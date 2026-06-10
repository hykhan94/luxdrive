// ============================================
// apps/server/src/controller/admin/partner.controller.ts
// ============================================

import { Request, Response } from "express";
import { prisma } from "../../lib/prisma";
import { getReadUrl } from "../../lib/gcs";
import { asyncWrapper } from "../../utils/asyncWrapper";
import { NotFoundError, BadRequestError } from "../../utils/AppError";
import { sendInvitationEmail } from "../../lib/email";
import crypto from "crypto";
const REQUIRED_PARTNER_DOCUMENTS = [
  "CR",
  "VAT",
  "CHAMBER_OF_COMMERCE",
  "BALADY",
  "NATIONAL_ADDRESS",
  "IBAN_LETTER",
] as const;

const DOCUMENT_LABELS: Record<string, string> = {
  CR: "Commercial Registration (CR#)",
  VAT: "VAT Certificate",
  CHAMBER_OF_COMMERCE: "Chamber of Commerce",
  BALADY: "Balady License",
  NATIONAL_ADDRESS: "National Address",
  IBAN_LETTER: "IBAN Letter",
};

// ============== SUMMARY & STATS ==============

/**
 * Get partner summary cards
 */
export const getPartnerSummary = asyncWrapper(
  async (req: Request, res: Response) => {
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const endOfMonth = new Date(
      now.getFullYear(),
      now.getMonth() + 1,
      0,
      23,
      59,
      59,
    );
    const monthName = now.toLocaleString("default", { month: "long" });

    const [
      totalPartners,
      activePartners,
      pendingApproval,
      monthlyBookings,
      pendingReviewCount,
    ] = await Promise.all([
      // Total partners (all statuses except INVITED that never registered)
      prisma.partner.count(),
      // Active partners
      prisma.partner.count({ where: { status: "APPROVED" } }),
      // Pending approval (PENDING_REVIEW status)
      prisma.partner.count({ where: { status: "PENDING_REVIEW" } }),
      // Total bookings this month from all partners
      prisma.booking.count({
        where: {
          source: "PARTNER",
          partnerId: { not: null },
          createdAt: { gte: startOfMonth, lte: endOfMonth },
        },
      }),
      // Count for sidebar badge
      prisma.partner.count({ where: { status: "PENDING_REVIEW" } }),
    ]);

    // Get active bookings count for this month
    const activeBookingsThisMonth = await prisma.booking.count({
      where: {
        source: "PARTNER",
        partnerId: { not: null },
        status: { in: ["PENDING", "CONFIRMED", "IN_PROGRESS"] },
        createdAt: { gte: startOfMonth, lte: endOfMonth },
      },
    });

    res.json({
      success: true,
      data: {
        cards: {
          totalPartners,
          activePartners,
          pendingApproval,
          totalBookings: {
            count: monthlyBookings,
            activeCount: activeBookingsThisMonth,
            month: monthName,
          },
        },
        notifications: {
          pendingReview: pendingReviewCount,
        },
      },
    });
  },
);

/**
 * Get notification count for sidebar badge
 */
export const getPartnerNotifications = asyncWrapper(
  async (req: Request, res: Response) => {
    const pendingReviewCount = await prisma.partner.count({
      where: { status: "PENDING_REVIEW" },
    });

    res.json({
      success: true,
      data: {
        pendingReview: pendingReviewCount,
        total: pendingReviewCount,
      },
    });
  },
);

// ============== LIST PARTNERS ==============

/**
 * Get all partners with filters
 */
export const getPartners = asyncWrapper(async (req: Request, res: Response) => {
  const { status, search, page = "1", limit = "10" } = req.query;

  const where: any = {};

  // Status filter
  if (status && status !== "all") {
    where.status = status;
  }

  // Search filter
  if (search) {
    const searchStr = search as string;
    where.OR = [
      { companyName: { contains: searchStr, mode: "insensitive" } },
      { crNumber: { contains: searchStr, mode: "insensitive" } },
      { contactEmail: { contains: searchStr, mode: "insensitive" } },
      { contactPerson: { contains: searchStr, mode: "insensitive" } },
      { user: { email: { contains: searchStr, mode: "insensitive" } } },
    ];
  }

  const skip = (parseInt(page as string) - 1) * parseInt(limit as string);

  const [partners, total, statusCounts] = await Promise.all([
    prisma.partner.findMany({
      where,
      skip,
      take: parseInt(limit as string),
      orderBy: [{ status: "asc" }, { createdAt: "desc" }],
      include: {
        user: { select: { id: true, email: true, name: true, phone: true } },
        _count: { select: { bookings: true } },
        // Pull documents with their expiry dates so we can compute
        // per-row doc-health badges (e.g. "2 expired" / "1 expiring").
        // Cheap — partners have at most a handful of docs, and the
        // page-size cap on the list keeps total rows small.
        documents: {
          select: { type: true, expiryDate: true },
        },
      },
    }),
    prisma.partner.count({ where }),
    // Get counts per status for filter badges
    prisma.partner.groupBy({
      by: ["status"],
      _count: { id: true },
    }),
  ]);

  // Get active bookings count per partner for current month
  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

  const activeBookingCounts = await prisma.booking.groupBy({
    by: ["partnerId"],
    where: {
      partnerId: { in: partners.map((p) => p.id) },
      status: { in: ["PENDING", "CONFIRMED", "IN_PROGRESS"] },
      createdAt: { gte: startOfMonth },
    },
    _count: { id: true },
  });

  const activeBookingMap = new Map(
    activeBookingCounts.map((b) => [b.partnerId, b._count.id]),
  );

  // Build the per-partner response shape, signing the logo URL where
  // present. Promise.all so signing runs concurrently rather than
  // sequentially blocking on each row — important once the list grows
  // past a handful of partners.
  //
  // Also computes `docHealth` per row — a small breakdown of expired
  // vs expiring-soon (≤30d) docs. The admin list view uses this to
  // surface a row-level chip ("2 expired" / "1 expiring") so admin
  // can see at a glance who needs attention without opening each
  // partner. MOU is counted alongside other docs since it has an
  // expiry date too — and crucially, an expired MOU is the trigger
  // for auto-suspension (see lib/cron.ts).
  const nowMs = Date.now();
  const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;
  const computeDocHealth = (
    docs: Array<{ type: string; expiryDate: Date | null }>,
    mouExpiry: Date | null,
  ) => {
    let expiredCount = 0;
    let expiringSoonCount = 0;
    const expiredTypes: string[] = [];
    const expiringSoonTypes: string[] = [];
    const check = (label: string, expiry: Date | null) => {
      if (!expiry) return;
      const diff = expiry.getTime() - nowMs;
      if (diff < 0) {
        expiredCount++;
        expiredTypes.push(label);
      } else if (diff <= THIRTY_DAYS_MS) {
        expiringSoonCount++;
        expiringSoonTypes.push(label);
      }
    };
    docs.forEach((d) => check(d.type, d.expiryDate));
    check("MOU", mouExpiry);
    return {
      expiredCount,
      expiringSoonCount,
      expiredTypes,
      expiringSoonTypes,
    };
  };

  const formattedPartners = await Promise.all(
    partners.map(async (partner) => ({
      id: partner.id,
      companyName: partner.companyName,
      logoUrl: await getReadUrl((partner as any).logoUrl ?? null),
      email: partner.contactEmail || partner.user?.email,
      contact: {
        name: partner.contactPerson || partner.user?.name,
        phone: partner.contactPhone || partner.user?.phone,
        email: partner.contactEmail || partner.user?.email,
      },
      crNumber: partner.crNumber,
      vatNumber: partner.vatNumber,
      status: partner.status,
      bookings: {
        active: activeBookingMap.get(partner.id) || 0,
        total: partner._count.bookings,
      },
      creditLimit: partner.creditLimit,
      currentBalance: partner.currentBalance,
      createdAt: partner.createdAt,
      // For invitation tracking
      invitationSentAt: partner.invitationSentAt,
      profileSubmittedAt: partner.profileSubmittedAt,
      docHealth: computeDocHealth(
        partner.documents,
        (partner as any).mouExpiryDate ?? null,
      ),
    })),
  );

  // Build status counts object
  const statusCountsObj: Record<string, number> = {
    all: total,
    INVITED: 0,
    PENDING_REVIEW: 0,
    CHANGES_REQUESTED: 0,
    APPROVED: 0,
    SUSPENDED: 0,
  };
  statusCounts.forEach((sc) => {
    statusCountsObj[sc.status] = sc._count.id;
  });

  res.json({
    success: true,
    data: {
      partners: formattedPartners,
      statusCounts: statusCountsObj,
      pagination: {
        page: parseInt(page as string),
        limit: parseInt(limit as string),
        total,
        totalPages: Math.ceil(total / parseInt(limit as string)),
      },
    },
  });
});

/**
 * Get single partner details
 */
export const getPartnerDetails = asyncWrapper(
  async (req: Request, res: Response) => {
    const { id } = req.params;

    const partner = await prisma.partner.findUnique({
      where: { id },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            name: true,
            phone: true,
            image: true,
          },
        },
        _count: { select: { bookings: true, invoices: true } },
        documents: {
          orderBy: { type: "asc" },
        },
      },
    });

    if (!partner) {
      throw new NotFoundError("Partner");
    }

    // Get booking stats
    const [activeBookings, monthlyBookings] = await Promise.all([
      prisma.booking.count({
        where: {
          partnerId: id,
          status: { in: ["CONFIRMED", "IN_PROGRESS"] },
        },
      }),
      prisma.booking.count({
        where: {
          partnerId: id,
          tripDate: {
            gte: new Date(new Date().getFullYear(), new Date().getMonth(), 1),
          },
        },
      }),
    ]);

    // Document summary
    const uploadedDocsMap = new Map(partner.documents.map((d) => [d.type, d]));

    const documents = REQUIRED_PARTNER_DOCUMENTS.map((type) => {
      const doc = uploadedDocsMap.get(type);
      return {
        type,
        label: DOCUMENT_LABELS[type],
        uploaded: !!doc,
        fileUrl: doc?.fileUrl || null,
        fileName: doc?.fileName || null,
        expiryDate: doc?.expiryDate || null,
      };
    });

    const missingDocCount = documents.filter((d) => !d.uploaded).length;

    const documentsWithUrls = await Promise.all(
      documents.map(async (doc) => ({
        ...doc,
        fileUrl: doc.fileUrl ? await getReadUrl(doc.fileUrl) : null,
      })),
    );

    const mouReadUrl = await getReadUrl(partner.mouFileUrl);
    // Logo URL — signed so it actually renders in the admin's partner
    // detail drawer/sheet. Same pattern as documents and MOU.
    const logoReadUrl = await getReadUrl((partner as any).logoUrl ?? null);

    // MOU expiry check
    let mouExpiryWarning = null;
    if (partner.mouExpiryDate) {
      const daysLeft = Math.ceil(
        (partner.mouExpiryDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24),
      );
      if (daysLeft <= 60) {
        mouExpiryWarning = { isExpiring: true, daysLeft };
      }
    }

    res.json({
      success: true,
      data: {
        id: partner.id,
        companyName: partner.companyName,
        logoUrl: logoReadUrl,
        status: partner.status,
        contactPerson: partner.contactPerson,
        contactEmail: partner.contactEmail || partner.user?.email,
        contactPhone: partner.contactPhone || partner.user?.phone,
        crNumber: partner.crNumber,
        vatNumber: partner.vatNumber,
        address: partner.address,
        creditLimit: partner.creditLimit,
        currentBalance: partner.currentBalance,
        createdAt: partner.createdAt,
        bookingStats: {
          active: activeBookings,
          thisMonth: monthlyBookings,
          total: partner._count.bookings,
        },
        mouExpiryWarning,
        mou: {
          fileUrl: mouReadUrl,
          expiryDate: partner.mouExpiryDate,
          uploadedAt: partner.mouUploadedAt,
        },
        // NEW: Documents
        documents: documentsWithUrls,
        missingDocCount,
      },
    });
  },
);

// Helper to check if MOU is expiring within 2 months
function isMouExpiringSoon(
  expiryDate: Date,
): { isExpiring: boolean; daysLeft: number } | null {
  const now = new Date();
  const twoMonthsFromNow = new Date();
  twoMonthsFromNow.setMonth(twoMonthsFromNow.getMonth() + 2);

  const daysLeft = Math.ceil(
    (expiryDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24),
  );

  if (expiryDate <= twoMonthsFromNow) {
    return { isExpiring: true, daysLeft };
  }
  return { isExpiring: false, daysLeft };
}

// ============== INVITE PARTNER ==============

/**
 * Send invitation to a new partner (only companyName and email required)
 */
export const invitePartner = asyncWrapper(
  async (req: Request, res: Response) => {
    const { companyName, email } = req.body;

    if (!companyName || !email) {
      throw new BadRequestError("companyName and email are required");
    }

    // Check if email already exists
    const existingUser = await prisma.user.findUnique({ where: { email } });
    if (existingUser) {
      throw new BadRequestError("A user with this email already exists");
    }

    // Check if partner with same company name exists
    const existingPartner = await prisma.partner.findFirst({
      where: { companyName: { equals: companyName, mode: "insensitive" } },
    });
    if (existingPartner) {
      throw new BadRequestError(
        "A partner with this company name already exists",
      );
    }

    // Generate invitation token + 72-hour expiry. 72h is the chosen
    // standard across vendor + partner invitations — long enough for a
    // partner to act on Friday/Monday, short enough to keep tokens from
    // sitting valid indefinitely.
    const invitationToken = crypto.randomBytes(32).toString("hex");
    const invitationExpiresAt = new Date();
    invitationExpiresAt.setHours(invitationExpiresAt.getHours() + 72);

    // Create a placeholder user for the partner
    const user = await prisma.user.create({
      data: {
        email,
        name: companyName,
        role: "PARTNER",
        emailVerified: false,
      },
    });

    // Create partner with INVITED status
    const partner = await prisma.partner.create({
      data: {
        userId: user.id,
        companyName,
        contactEmail: email,
        status: "INVITED",
        invitationToken,
        invitationSentAt: new Date(),
        invitationExpiresAt,
        invitedByUserId: req.user!.id,
      },
    });

    // Log the invitation
    await prisma.partnerInvitationLog.create({
      data: {
        partnerId: partner.id,
        email,
        companyName,
        action: "SENT",
        sentByUserId: req.user!.id,
        sentByName: req.user!.name || req.user!.email,
      },
    });

    // Send the invitation email. We don't `await throw` on failure —
    // the partner record is already created at this point, and admin
    // can use the Resend Invitation button to retry. Logging the email
    // result into PartnerInvitationLog is a future improvement.
    const emailResult = await sendInvitationEmail({
      to: email,
      companyName,
      inviteToken: invitationToken,
      type: "partner",
      expiresInHours: 72,
    });

    if (!emailResult.ok) {
      console.error(
        `[invitePartner] Email send failed for ${email}: ${emailResult.error}`,
      );
      // Surface to admin so they know to retry, but don't roll back —
      // the partner record IS valid, just unsent. Admin can hit Resend.
    }

    res.json({
      success: true,
      message: emailResult.ok
        ? `Invitation sent to ${email}`
        : `Partner created, but invitation email failed to send. Use Resend to retry.`,
      data: {
        partnerId: partner.id,
        companyName,
        email,
        invitationSentAt: partner.invitationSentAt,
        invitationExpiresAt: partner.invitationExpiresAt,
        emailSent: emailResult.ok,
        // Include token in dev only so the admin can test by pasting it
        // into the browser without needing actual email delivery.
        invitationToken:
          process.env.NODE_ENV === "development" ? invitationToken : undefined,
      },
    });
  },
);

/**
 * Resend invitation to a partner
 */
export const resendInvitation = asyncWrapper(
  async (req: Request, res: Response) => {
    const { id } = req.params;

    const partner = await prisma.partner.findUnique({
      where: { id },
      include: { user: { select: { email: true } } },
    });

    if (!partner) {
      throw new NotFoundError("Partner");
    }

    if (partner.status !== "INVITED") {
      throw new BadRequestError(
        "Can only resend invitation to partners with INVITED status",
      );
    }

    // Generate new token + 72-hour expiry (matches the initial invite)
    const invitationToken = crypto.randomBytes(32).toString("hex");
    const invitationExpiresAt = new Date();
    invitationExpiresAt.setHours(invitationExpiresAt.getHours() + 72);

    await prisma.partner.update({
      where: { id },
      data: {
        invitationToken,
        invitationSentAt: new Date(),
        invitationExpiresAt,
      },
    });

    // Log the resend
    await prisma.partnerInvitationLog.create({
      data: {
        partnerId: partner.id,
        email: partner.contactEmail || partner.user.email,
        companyName: partner.companyName,
        action: "RESENT",
        sentByUserId: req.user!.id,
        sentByName: req.user!.name || req.user!.email,
      },
    });

    // Fire the email. Same template + flow as the initial invitation —
    // recipient sees no difference between the first send and a resend.
    const recipientEmail = partner.contactEmail || partner.user.email;
    const emailResult = await sendInvitationEmail({
      to: recipientEmail,
      companyName: partner.companyName,
      inviteToken: invitationToken,
      type: "partner",
      expiresInHours: 72,
    });

    if (!emailResult.ok) {
      console.error(
        `[resendInvitation:partner] Email send failed for ${recipientEmail}: ${emailResult.error}`,
      );
    }

    res.json({
      success: true,
      message: emailResult.ok
        ? "Invitation resent successfully"
        : "Token regenerated, but email failed to send. Try again.",
      data: {
        emailSent: emailResult.ok,
        invitationToken:
          process.env.NODE_ENV === "development" ? invitationToken : undefined,
      },
    });
  },
);

// ============== PROFILE REVIEW ==============

/**
 * Get partners pending profile review
 */
export const getPendingReviews = asyncWrapper(
  async (req: Request, res: Response) => {
    const [pendingPartners, recentlyProcessed] = await Promise.all([
      // Partners pending review
      prisma.partner.findMany({
        where: { status: "PENDING_REVIEW" },
        orderBy: { profileSubmittedAt: "asc" },
        include: {
          user: { select: { id: true, email: true, name: true } },
        },
      }),
      // Recently processed (approved or changes requested in last 7 days)
      prisma.partner.findMany({
        where: {
          status: { in: ["APPROVED", "CHANGES_REQUESTED"] },
          profileReviewedAt: {
            gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
          },
        },
        orderBy: { profileReviewedAt: "desc" },
        take: 10,
        include: {
          user: { select: { id: true, email: true, name: true } },
        },
      }),
    ]);

    res.json({
      success: true,
      data: {
        pendingCount: pendingPartners.length,
        pending: pendingPartners.map((p) => ({
          id: p.id,
          companyName: p.companyName,
          contactPerson: p.contactPerson || p.user?.name,
          submittedAt: p.profileSubmittedAt,
          user: p.user,
        })),
        recentlyProcessed: recentlyProcessed.map((p) => ({
          id: p.id,
          companyName: p.companyName,
          contactPerson: p.contactPerson || p.user?.name,
          status: p.status,
          reviewedAt: p.profileReviewedAt,
        })),
      },
    });
  },
);

/**
 * Get partner profile for review (detailed view)
 */
export const getPartnerProfileForReview = asyncWrapper(
  async (req: Request, res: Response) => {
    const { id } = req.params;

    const partner = await prisma.partner.findUnique({
      where: { id },
      include: {
        user: {
          select: { id: true, email: true, name: true, phone: true },
        },
        reviewComments: {
          orderBy: { createdAt: "desc" },
        },
        documents: {
          orderBy: { type: "asc" },
        },
      },
    });

    if (!partner) {
      throw new NotFoundError("Partner");
    }

    // Group comments by field
    const commentsByField: Record<string, any[]> = {};
    partner.reviewComments.forEach((comment) => {
      if (!commentsByField[comment.fieldName]) {
        commentsByField[comment.fieldName] = [];
      }
      commentsByField[comment.fieldName].push({
        id: comment.id,
        comment: comment.comment,
        isResolved: comment.isResolved,
        createdAt: comment.createdAt,
      });
    });

    const unresolvedCommentCount = partner.reviewComments.filter(
      (c) => !c.isResolved,
    ).length;

    // Build documents map: type → doc info (or null if missing)
    const uploadedDocsMap = new Map(partner.documents.map((d) => [d.type, d]));

    // "Replaced since last review" detection — mirrors vendor. For each
    // doc, find the most recent UNRESOLVED rejection comment for that
    // doc and compare doc.updatedAt against it. Only fires when the
    // partner has actually re-uploaded after a rejection (NOT immediately
    // when admin clicks Reject).
    function computeReplaced(
      docType: string,
      docUpdatedAt: Date | null | undefined,
    ): boolean {
      if (!docUpdatedAt) return false;
      const rejectionComments = (commentsByField[docType] || []).filter(
        (c: any) => !c.isResolved && c.comment?.startsWith?.("❌ Rejected:"),
      );
      if (rejectionComments.length === 0) return false;
      const mostRecent: Date = rejectionComments.reduce((acc: Date, c: any) => {
        const t = new Date(c.createdAt);
        return t > acc ? t : acc;
      }, new Date(0));
      return new Date(docUpdatedAt).getTime() > mostRecent.getTime();
    }

    const documents = REQUIRED_PARTNER_DOCUMENTS.map((type) => {
      const doc = uploadedDocsMap.get(type);
      return {
        type,
        label: DOCUMENT_LABELS[type],
        uploaded: !!doc,
        fileUrl: doc?.fileUrl || null,
        fileName: doc?.fileName || null,
        expiryDate: doc?.expiryDate || null,
        uploadedAt: doc?.createdAt || null,
        updatedAt: doc?.updatedAt || null,
        replacedSinceLastReview: !!doc && computeReplaced(type, doc.updatedAt),
      };
    });

    const missingDocuments = documents
      .filter((d) => !d.uploaded)
      .map((d) => d.label);

    const allDocumentsUploaded = missingDocuments.length === 0;

    const documentsWithUrls = await Promise.all(
      documents.map(async (doc) => ({
        ...doc,
        fileUrl: doc.fileUrl ? await getReadUrl(doc.fileUrl) : null,
      })),
    );

    const mouReadUrl = await getReadUrl(partner.mouFileUrl);
    // Logo URL — admin needs to see the partner's branding when
    // reviewing their submission, same as the partner sees it in their
    // own portal. Raw GCS path won't render in the browser, so sign it
    // for read access.
    const logoReadUrl = await getReadUrl((partner as any).logoUrl ?? null);

    res.json({
      success: true,
      data: {
        id: partner.id,
        status: partner.status,
        companyName: partner.companyName,
        logoUrl: logoReadUrl,
        profile: {
          contactPerson: partner.contactPerson,
          email: partner.contactEmail || partner.user?.email,
          phone: partner.contactPhone || partner.user?.phone,
          companyName: partner.companyName,
          crNumber: partner.crNumber,
          vatNumber: partner.vatNumber,
          chamberOfCommerceNumber: (partner as any).chamberOfCommerceNumber,
          baladyNumber: (partner as any).baladyNumber,
          nationalAddress: (partner as any).nationalAddress,
          address: partner.address,
          bankName: (partner as any).bankName,
          bankIban: (partner as any).bankIban,
        },
        mou: {
          fileUrl: mouReadUrl,
          expiryDate: partner.mouExpiryDate,
          uploadedAt: partner.mouUploadedAt,
          expiryWarning: partner.mouExpiryDate
            ? isMouExpiringSoon(partner.mouExpiryDate)
            : null,
          // Same per-field rejection comparison as documents (see
          // computeReplaced above): true when the MOU was uploaded AFTER
          // the most recent unresolved rejection comment for "mou".
          replacedSinceLastReview: computeReplaced(
            "mou",
            partner.mouUploadedAt,
          ),
        },
        // NEW: Documents section
        documents: documentsWithUrls,
        allDocumentsUploaded,
        missingDocuments,
        comments: commentsByField,
        unresolvedCommentCount,
        submittedAt: partner.profileSubmittedAt,
        previousProfile: partner.profileSnapshot || null,
      },
    });
  },
);

/**
 * Add review comment on a specific field
 */
export const addReviewComment = asyncWrapper(
  async (req: Request, res: Response) => {
    const { id } = req.params;
    const { fieldName, comment } = req.body;

    if (!fieldName || !comment) {
      throw new BadRequestError("fieldName and comment are required");
    }

    const validFields = [
      // Profile fields
      "contactPerson",
      "email",
      "phone",
      "companyName",
      "crNumber",
      "vatNumber",
      "chamberOfCommerceNumber",
      "baladyNumber",
      "nationalAddress",
      "address",
      "bankName",
      "bankIban",
      "mou",
      // Document fields (new)
      "CR",
      "VAT",
      "CHAMBER_OF_COMMERCE",
      "BALADY",
      "NATIONAL_ADDRESS",
      "IBAN_LETTER",
    ];

    if (!validFields.includes(fieldName)) {
      throw new BadRequestError(
        `Invalid fieldName. Must be one of: ${validFields.join(", ")}`,
      );
    }

    const partner = await prisma.partner.findUnique({
      where: { id },
      include: {
        documents: { select: { type: true, fileUrl: true } },
      },
    });
    if (!partner) {
      throw new NotFoundError("Partner");
    }

    // Friendly label for the field, used in the notification body.
    const fieldLabelMap: Record<string, string> = {
      contactPerson: "Contact Person",
      email: "Email",
      phone: "Phone",
      companyName: "Company Name",
      crNumber: "CR Number",
      vatNumber: "VAT Number",
      chamberOfCommerceNumber: "Chamber of Commerce Number",
      baladyNumber: "Balady Number",
      nationalAddress: "National Address",
      address: "Address",
      bankName: "Bank Name",
      bankIban: "IBAN",
      mou: "MOU",
      CR: "Commercial Registration",
      VAT: "VAT Certificate",
      CHAMBER_OF_COMMERCE: "Chamber of Commerce",
      BALADY: "Balady License",
      NATIONAL_ADDRESS: "National Address",
      IBAN_LETTER: "IBAN Letter",
    };
    const fieldLabel = fieldLabelMap[fieldName] || fieldName;

    // Tailor notification copy based on whether this is a rejection
    // (admin's reject flow writes a "❌ Rejected:" prefix) or a plain
    // comment. The transaction ensures the comment + notification land
    // together — never a comment the partner was never told about.
    const isRejection = comment.startsWith("❌ Rejected:");
    const reasonText = isRejection
      ? comment.replace(/^❌ Rejected:\s*/, "").trim()
      : comment;

    // ============== PROFILE SNAPSHOT MAINTENANCE ==============
    // Mirrors the vendor side (addVendorReviewComment in
    // controller/admin/vendor.controller.ts). The partner portal compares
    // each field's current value to partner.profileSnapshot to decide
    // whether the partner has addressed a rejection in this round. We
    // populate that snapshot on every rejection (not just on whole-
    // profile Request Changes) so per-field reject — the more common
    // admin path — also feeds the partner's addressed-state UI.
    //
    // Behaviour parallels the vendor implementation: fresh-cycle gets a
    // full snapshot capture, mid-cycle re-rejection bumps just that
    // field. Plain comments don't touch the snapshot.
    if (isRejection) {
      const existing = (partner as any).profileSnapshot;
      const isEmptySnap =
        !existing ||
        typeof existing !== "object" ||
        Object.keys(existing).length === 0;

      const docMap = new Map<string, string | null>();
      for (const d of partner.documents ?? []) {
        docMap.set(d.type, d.fileUrl ?? null);
      }
      const currentByKey: Record<string, any> = {
        companyName: partner.companyName ?? null,
        crNumber: partner.crNumber ?? null,
        vatNumber: partner.vatNumber ?? null,
        chamberOfCommerceNumber: partner.chamberOfCommerceNumber ?? null,
        baladyNumber: partner.baladyNumber ?? null,
        nationalAddress: partner.nationalAddress ?? null,
        contactPerson: partner.contactPerson ?? null,
        contactPhone: partner.contactPhone ?? null,
        address: partner.address ?? null,
        bankName: partner.bankName ?? null,
        bankIban: partner.bankIban ?? null,
        mou: partner.mouFileUrl ?? null,
      };
      for (const [type, url] of docMap) currentByKey[type] = url;

      if (isEmptySnap) {
        await prisma.partner.update({
          where: { id },
          data: { profileSnapshot: currentByKey as any },
        });
      } else if (
        fieldName in (existing as Record<string, any>) &&
        currentByKey[fieldName] !== undefined
      ) {
        const nextSnap = {
          ...(existing as Record<string, any>),
          [fieldName]: currentByKey[fieldName],
        };
        await prisma.partner.update({
          where: { id },
          data: { profileSnapshot: nextSnap as any },
        });
      }
    }

    const [reviewComment] = await prisma.$transaction([
      prisma.partnerReviewComment.create({
        data: {
          partnerId: id,
          fieldName,
          comment,
          createdBy: req.user!.id,
        },
      }),
      prisma.notification.create({
        data: {
          userId: partner.userId,
          title: isRejection
            ? `${fieldLabel} rejected`
            : `New comment on ${fieldLabel}`,
          message: isRejection
            ? `Admin rejected ${fieldLabel}: ${reasonText}. Please update and resubmit.`
            : `Admin added a comment on ${fieldLabel}: ${reasonText}`,
          type: isRejection
            ? "PARTNER_PROFILE_FIELD_REJECTED"
            : "PARTNER_PROFILE_REVIEW_COMMENT",
          data: { partnerId: id, fieldName },
        },
      }),
    ]);

    res.json({
      success: true,
      message: "Comment added",
      data: reviewComment,
    });
  },
);

/**
 * Approve partner profile
 */
export const approvePartner = asyncWrapper(
  async (req: Request, res: Response) => {
    const { id } = req.params;

    const partner = await prisma.partner.findUnique({
      where: { id },
      include: {
        reviewComments: { where: { isResolved: false } },
        documents: true,
      },
    });

    if (!partner) {
      throw new NotFoundError("Partner");
    }

    if (partner.status === "APPROVED") {
      throw new BadRequestError("Partner is already approved");
    }

    // Check unresolved comments — must be resolved before approval
    if (partner.reviewComments.length > 0) {
      throw new BadRequestError(
        `Cannot approve: ${partner.reviewComments.length} unresolved comment(s) exist`,
      );
    }

    // Check all required documents are uploaded
    const uploadedTypes = new Set(partner.documents.map((d) => d.type));
    const missingDocs = REQUIRED_PARTNER_DOCUMENTS.filter(
      (type) => !uploadedTypes.has(type),
    );

    if (missingDocs.length > 0) {
      const missingLabels = missingDocs.map(
        (type) => DOCUMENT_LABELS[type] || type,
      );
      throw new BadRequestError(
        `Cannot approve: ${missingDocs.length} required document(s) missing — ${missingLabels.join(", ")}`,
      );
    }

    // All checks passed — resolve any remaining comments and clear snapshot
    await prisma.partnerReviewComment.updateMany({
      where: { partnerId: id, isResolved: false },
      data: { isResolved: true, resolvedAt: new Date() },
    });

    await prisma.partner.update({
      where: { id },
      data: { profileSnapshot: {} as any },
    });

    const updated = await prisma.partner.update({
      where: { id },
      data: {
        status: "APPROVED",
        profileReviewedAt: new Date(),
        profileReviewedBy: req.user!.id,
      },
    });

    // Audit log
    await prisma.auditLog.create({
      data: {
        userId: req.user!.id,
        action: "PARTNER_APPROVED",
        entity: "Partner",
        entityId: id,
        changes: {
          companyName: partner.companyName,
          documentsVerified: REQUIRED_PARTNER_DOCUMENTS.length,
        },
      },
    });

    // Notify the partner about approval
    await prisma.notification.create({
      data: {
        userId: partner.userId,
        title: "Profile Approved",
        message:
          "Your profile has been reviewed and approved. You can now access all features and start making bookings.",
        type: "PARTNER_APPROVED",
        data: { partnerId: id },
      },
    });

    res.json({
      success: true,
      message: "Partner approved successfully",
      data: {
        id: updated.id,
        status: updated.status,
        approvedAt: updated.profileReviewedAt,
      },
    });
  },
);

/**
 * Request changes to partner profile
 */
export const requestChanges = asyncWrapper(
  async (req: Request, res: Response) => {
    const { id } = req.params;
    const { comments } = req.body; // Optional: array of {fieldName, comment}

    const partner = await prisma.partner.findUnique({ where: { id } });
    if (!partner) {
      throw new NotFoundError("Partner");
    }

    if (partner.status !== "PENDING_REVIEW") {
      throw new BadRequestError(
        "Can only request changes for partners in PENDING_REVIEW status",
      );
    }

    // Add comments if provided
    if (comments && Array.isArray(comments) && comments.length > 0) {
      await prisma.partnerReviewComment.createMany({
        data: comments.map((c: { fieldName: string; comment: string }) => ({
          partnerId: id,
          fieldName: c.fieldName,
          comment: c.comment,
          createdBy: req.user!.id,
        })),
      });
    }

    // Save current profile as snapshot before sending back for changes
    const currentPartner = await prisma.partner.findUnique({
      where: { id },
      select: {
        companyName: true,
        crNumber: true,
        vatNumber: true,
        chamberOfCommerceNumber: true,
        baladyNumber: true,
        nationalAddress: true,
        contactPerson: true,
        contactPhone: true,
        contactEmail: true,
        address: true,
        bankName: true,
        bankAccountNumber: true,
        bankIban: true,
      },
    });

    const updated = await prisma.partner.update({
      where: { id },
      data: {
        status: "CHANGES_REQUESTED",
        profileReviewedAt: new Date(),
        profileReviewedBy: req.user!.id,
        profileSnapshot: currentPartner as any,
      },
    });

    // TODO: Send notification to partner about requested changes
    // Build a clear message listing the fields that need attention
    const unresolvedComments = await prisma.partnerReviewComment.findMany({
      where: { partnerId: id, isResolved: false },
      select: { fieldName: true, comment: true },
    });

    const fieldSummary = unresolvedComments
      .map((c) => {
        const label = c.fieldName.replace(/([A-Z])/g, " $1").trim();
        return `• ${label}: ${c.comment}`;
      })
      .join("\n");

    await prisma.notification.create({
      data: {
        userId: partner.userId,
        title: "Profile Changes Requested by Admin",
        message:
          unresolvedComments.length > 0
            ? `Admin has reviewed your profile and requested changes on ${unresolvedComments.length} field(s):\n${fieldSummary}`
            : "Admin has reviewed your profile and requested changes. Please check your profile for details.",
        type: "PROFILE_CHANGES_REQUESTED",
        data: {
          partnerId: id,
          fields: unresolvedComments.map((c) => c.fieldName),
          comments: unresolvedComments.map((c) => ({
            field: c.fieldName,
            comment: c.comment,
          })),
        },
      },
    });

    res.json({
      success: true,
      message: "Changes requested",
      data: {
        id: updated.id,
        status: updated.status,
      },
    });
  },
);

// ============== SUSPEND / REACTIVATE ==============

/**
 * Suspend a partner
 */
export const suspendPartner = asyncWrapper(
  async (req: Request, res: Response) => {
    const { id } = req.params;
    const { reason } = req.body;

    const partner = await prisma.partner.findUnique({
      where: { id },
      select: { id: true, status: true, userId: true, companyName: true },
    });
    if (!partner) {
      throw new NotFoundError("Partner");
    }

    if (partner.status === "SUSPENDED") {
      throw new BadRequestError("Partner is already suspended");
    }

    // Store previous status for potential reactivation
    const previousStatus = partner.status;

    const updated = await prisma.partner.update({
      where: { id },
      data: {
        status: "SUSPENDED",
      },
    });

    // Log the suspension
    await prisma.auditLog.create({
      data: {
        userId: req.user!.id,
        action: "PARTNER_SUSPENDED",
        entity: "Partner",
        entityId: id,
        changes: { previousStatus, reason },
      },
    });

    // Notify the partner. Type matches the PROFILE_SUSPENDED slot
    // already registered in partner/notification.controller.ts (icon =
    // x-circle, severity = danger, category = PROFILE). Includes the
    // admin-supplied reason when present so the partner knows the
    // "why" without contacting support.
    await prisma.notification.create({
      data: {
        userId: partner.userId,
        title: "Account Suspended",
        message: reason
          ? `Your LuxDrive partner account has been suspended. Reason: ${reason}`
          : "Your LuxDrive partner account has been suspended. Contact admin for details.",
        type: "PROFILE_SUSPENDED",
        data: { partnerId: id, reason: reason || null },
      },
    });

    res.json({
      success: true,
      message: "Partner suspended",
      data: { id: updated.id, status: updated.status },
    });
  },
);

/**
 * Reactivate a suspended partner
 */
export const reactivatePartner = asyncWrapper(
  async (req: Request, res: Response) => {
    const { id } = req.params;

    const partner = await prisma.partner.findUnique({ where: { id } });
    if (!partner) {
      throw new NotFoundError("Partner");
    }

    if (partner.status !== "SUSPENDED") {
      throw new BadRequestError("Partner is not suspended");
    }

    const updated = await prisma.partner.update({
      where: { id },
      data: {
        status: "APPROVED",
      },
    });

    // Log the reactivation
    await prisma.auditLog.create({
      data: {
        userId: req.user!.id,
        action: "PARTNER_REACTIVATED",
        entity: "Partner",
        entityId: id,
      },
    });

    // Notify the partner. Type matches PROFILE_REACTIVATED slot
    // already registered in partner/notification.controller.ts. Tone
    // is welcoming — they can resume operations.
    await prisma.notification.create({
      data: {
        userId: partner.userId,
        title: "Account Reactivated",
        message:
          "Your LuxDrive partner account has been reactivated. You can now resume your operations.",
        type: "PROFILE_REACTIVATED",
        data: { partnerId: id },
      },
    });

    res.json({
      success: true,
      message: "Partner reactivated",
      data: { id: updated.id, status: updated.status },
    });
  },
);

// ============== MOU MANAGEMENT ==============

/**
 * Check partners with expiring MOUs (for scheduled job)
 */
export const checkExpiringMous = asyncWrapper(
  async (req: Request, res: Response) => {
    const twoMonthsFromNow = new Date();
    twoMonthsFromNow.setMonth(twoMonthsFromNow.getMonth() + 2);

    const expiringMous = await prisma.partner.findMany({
      where: {
        status: "APPROVED",
        mouExpiryDate: { lte: twoMonthsFromNow },
        mouExpiryNotified: false,
      },
      select: {
        id: true,
        companyName: true,
        contactEmail: true,
        mouExpiryDate: true,
      },
    });

    // Mark as notified and send notifications
    for (const partner of expiringMous) {
      await prisma.partner.update({
        where: { id: partner.id },
        data: { mouExpiryNotified: true },
      });

      // TODO: Send notification to partner and admin
      // await sendNotification({ ... });
    }

    res.json({
      success: true,
      message: `${expiringMous.length} partners notified about expiring MOUs`,
      data: expiringMous,
    });
  },
);

/**
 * Get partners with expiring MOUs (for admin dashboard)
 */
export const getExpiringMous = asyncWrapper(
  async (req: Request, res: Response) => {
    const twoMonthsFromNow = new Date();
    twoMonthsFromNow.setMonth(twoMonthsFromNow.getMonth() + 2);

    const expiringMous = await prisma.partner.findMany({
      where: {
        status: "APPROVED",
        mouExpiryDate: { lte: twoMonthsFromNow },
      },
      select: {
        id: true,
        companyName: true,
        contactEmail: true,
        mouExpiryDate: true,
        mouExpiryNotified: true,
      },
      orderBy: { mouExpiryDate: "asc" },
    });

    const formatted = expiringMous.map((p) => ({
      ...p,
      daysUntilExpiry: Math.ceil(
        (p.mouExpiryDate!.getTime() - Date.now()) / (1000 * 60 * 60 * 24),
      ),
      isExpired: p.mouExpiryDate! < new Date(),
    }));

    res.json({
      success: true,
      data: formatted,
    });
  },
);

// ============== UPDATE PARTNER (Admin) ==============

/**
 * Update partner details (admin can update credit limit, payment terms)
 */
export const updatePartner = asyncWrapper(
  async (req: Request, res: Response) => {
    const { id } = req.params;
    const { creditLimit, paymentTerms } = req.body;

    const partner = await prisma.partner.findUnique({ where: { id } });
    if (!partner) {
      throw new NotFoundError("Partner");
    }

    const updateData: any = {};
    if (creditLimit !== undefined) updateData.creditLimit = creditLimit;
    if (paymentTerms !== undefined) updateData.paymentTerms = paymentTerms;

    const updated = await prisma.partner.update({
      where: { id },
      data: updateData,
    });

    res.json({
      success: true,
      message: "Partner updated",
      data: updated,
    });
  },
);

// ============== PARTNER BOOKINGS ==============

/**
 * Get bookings for a specific partner
 */
export const getPartnerBookings = asyncWrapper(
  async (req: Request, res: Response) => {
    const { id } = req.params;
    const { status, page = "1", limit = "10" } = req.query;

    const partner = await prisma.partner.findUnique({ where: { id } });
    if (!partner) {
      throw new NotFoundError("Partner");
    }

    const where: any = { partnerId: id };
    if (status && status !== "all") {
      where.status = status;
    }

    const skip = (parseInt(page as string) - 1) * parseInt(limit as string);

    const [bookings, total] = await Promise.all([
      prisma.booking.findMany({
        where,
        skip,
        take: parseInt(limit as string),
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          bookingRef: true,
          guestName: true,
          tripDate: true,
          tripTime: true,
          pickupAddress: true,
          dropoffAddress: true,
          vehicleClass: true,
          totalPrice: true,
          status: true,
          createdAt: true,
        },
      }),
      prisma.booking.count({ where }),
    ]);

    res.json({
      success: true,
      data: {
        bookings,
        pagination: {
          page: parseInt(page as string),
          limit: parseInt(limit as string),
          total,
          totalPages: Math.ceil(total / parseInt(limit as string)),
        },
      },
    });
  },
);

// ============== PARTNER REVIEWS ==============
export const resolveReviewComment = asyncWrapper(
  async (req: Request, res: Response) => {
    const { id, commentId } = req.params;

    const comment = await prisma.partnerReviewComment.findFirst({
      where: { id: commentId, partnerId: id },
    });

    if (!comment) throw new NotFoundError("Comment");
    if (comment.isResolved)
      throw new BadRequestError("Comment is already resolved");

    await prisma.partnerReviewComment.update({
      where: { id: commentId },
      data: { isResolved: true, resolvedAt: new Date() },
    });

    res.json({
      success: true,
      message: "Comment resolved",
    });
  },
);
