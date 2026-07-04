// ============================================
// apps/server/src/controller/partner/profile.controller.ts
// Partner Portal — Company Profile Section
// ============================================

import { Request, Response } from "express";
import { prisma } from "../../lib/prisma";
import { getReadUrl } from "../../lib/gcs";
import { asyncWrapper } from "../../utils/asyncWrapper";
import { NotFoundError, BadRequestError } from "../../utils/AppError";
import crypto from "crypto";

// ============== CONSTANTS ==============

const REQUIRED_DOCUMENTS = [
  { type: "CR", label: "Commercial Registration" },
  { type: "VAT", label: "VAT Registration Certificate" },
  { type: "CHAMBER_OF_COMMERCE", label: "Chamber of Commerce" },
  { type: "BALADY", label: "Balady License" },
  { type: "NATIONAL_ADDRESS", label: "National Address" },
  { type: "IBAN_LETTER", label: "IBAN Letter" },
];

// Documents that need expiry dates — mirrors vendor's DOCS_WITH_EXPIRY.
// These are the Saudi-issued docs that legally expire and trigger the
// doc-expiry lockout when past their date. Other required docs (VAT,
// National Address, IBAN Letter) are issued once and don't expire in the
// same way, so we don't force an expiry on those.
const DOCS_WITH_EXPIRY = ["CR", "CHAMBER_OF_COMMERCE", "BALADY"];

// Statuses where a partner can edit their profile + upload docs/logo.
//   - INVITED:           shouldn't reach here (no session yet) but kept
//                        in case admin manually flips status backwards
//   - ONBOARDING:        post-link-acceptance, filling profile first time
//   - CHANGES_REQUESTED: admin rejected a field, partner is fixing it
//
// NOT editable: PENDING_REVIEW (in admin's queue), APPROVED (use a
// change-request flow instead), SUSPENDED. The same set guards every
// edit/upload endpoint so the rule is consistent.
const EDITABLE_STATUSES = ["INVITED", "ONBOARDING", "CHANGES_REQUESTED"];

function assertEditable(status: string, action = "Profile") {
  if (!EDITABLE_STATUSES.includes(status)) {
    throw new BadRequestError(
      `${action} cannot be edited in "${status}" status. Contact admin if you need to make changes.`,
    );
  }
}

const TEAM_ROLES = [
  { key: "admin", label: "Admin", description: "Full access to all sections" },
  {
    key: "manager",
    label: "Manager",
    description: "Can manage bookings, view invoices, view tariffs",
  },
  {
    key: "booker",
    label: "Booker",
    description: "Can only create and view bookings",
  },
  {
    key: "viewer",
    label: "Viewer",
    description: "Read-only access to all sections",
  },
];

// ============== HELPERS ==============

async function getPartnerForUser(userId: string) {
  const partner = await prisma.partner.findUnique({
    where: { userId },
    include: {
      user: {
        select: { id: true, email: true, name: true, phone: true },
      },
      documents: true,
      reviewComments: {
        where: { isResolved: false },
        orderBy: { createdAt: "desc" },
      },
    },
  });
  if (!partner) throw new NotFoundError("Partner profile");
  return partner;
}

// ============== GET COMPANY PROFILE ==============

/**
 * Get full company profile with all fields, document upload status,
 * bank details, MOU status, and unresolved admin comments
 */
export const getCompanyProfile = asyncWrapper(
  async (req: Request, res: Response) => {
    const partner = await getPartnerForUser(req.user!.id);

    // Build document status
    const uploadedDocs = partner.documents || [];
    const uploadedTypes = new Set(uploadedDocs.map((d) => d.type));

    const documentsStatus = REQUIRED_DOCUMENTS.map((doc) => {
      const uploaded = uploadedDocs.find((d) => d.type === doc.type);
      return {
        type: doc.type,
        label: doc.label,
        isUploaded: !!uploaded,
        fileUrl: uploaded?.fileUrl || null,
        fileName: uploaded?.fileName || null,
        expiryDate: uploaded?.expiryDate || null,
        uploadedAt: uploaded?.updatedAt || null,
        // Tells the frontend whether to render an expiry-date input for this
        // doc when uploading. The 3 docs in DOCS_WITH_EXPIRY require it; the
        // others store it if provided but don't force it.
        requiresExpiry: DOCS_WITH_EXPIRY.includes(doc.type),
      };
    });

    const allDocumentsUploaded = REQUIRED_DOCUMENTS.every((d) =>
      uploadedTypes.has(d.type),
    );
    const missingDocuments = REQUIRED_DOCUMENTS.filter(
      (d) => !uploadedTypes.has(d.type),
    ).map((d) => d.label);

    // Group admin comments by field
    const commentsByField: Record<string, any[]> = {};
    partner.reviewComments.forEach((c) => {
      if (!commentsByField[c.fieldName]) commentsByField[c.fieldName] = [];
      commentsByField[c.fieldName].push({
        id: c.id,
        comment: c.comment,
        // Type discriminates admin rejection vs partner-request vs plain
        // admin note. Frontend uses this instead of prefix-parsing the
        // comment text.
        type: c.type,
        isResolved: c.isResolved,
        createdAt: c.createdAt,
      });
    });

    // Editable while filling out (ONBOARDING) or fixing (CHANGES_REQUESTED).
    // INVITED is technically in the set too but a partner in that status
    // doesn't have a session, so they can never reach this endpoint.
    const isEditable = EDITABLE_STATUSES.includes(partner.status);

    // Generate signed read URLs for logo, documents, and MOU
    const logoReadUrl = await getReadUrl(partner.logoUrl);

    const documentsWithUrls = await Promise.all(
      documentsStatus.map(async (doc) => ({
        ...doc,
        fileUrl: doc.fileUrl ? await getReadUrl(doc.fileUrl) : null,
        filePath: doc.fileUrl, // Keep original path for re-uploads
      })),
    );

    const mouReadUrl = await getReadUrl(partner.mouFileUrl);

    res.json({
      success: true,
      data: {
        id: partner.id,
        status: partner.status,
        isEditable,
        // Logo edit is a softer rule than profile edit: branding is
        // not subject to admin review, so the partner can change it
        // any time unless the account is fully suspended. Surfaced
        // separately from `isEditable` so the frontend doesn't have
        // to re-derive the rule.
        canEditLogo: partner.status !== "SUSPENDED",
        isApproved: partner.status === "APPROVED",
        isProfileComplete: partner.isProfileComplete,

        // Company Info
        companyInfo: {
          companyName: partner.companyName,
          logoUrl: logoReadUrl || null,
          crNumber: partner.crNumber || null,
          vatNumber: partner.vatNumber || null,
          chamberOfCommerceNumber:
            (partner as any).chamberOfCommerceNumber || null,
          baladyNumber: (partner as any).baladyNumber || null,
          nationalAddress: (partner as any).nationalAddress || null,
          contactPerson: partner.contactPerson || null,
          contactPhone: partner.contactPhone || null,
          contactEmail: partner.contactEmail || null,
          address: partner.address || null,
        },

        // Bank Details
        bankDetails: {
          bankName: (partner as any).bankName || null,
          bankAccountNumber: (partner as any).bankAccountNumber || null,
          bankIban: (partner as any).bankIban || null,
        },

        // Documents (6 required)
        documents: {
          items: documentsWithUrls,
          allUploaded: allDocumentsUploaded,
          missingDocuments,
          uploadedCount: uploadedDocs.length,
          requiredCount: REQUIRED_DOCUMENTS.length,
        },

        // MOU
        mou: {
          fileUrl: mouReadUrl || null,
          filePath: partner.mouFileUrl,
          expiryDate: partner.mouExpiryDate || null,
          uploadedAt: partner.mouUploadedAt || null,
        },

        // Admin Review Comments (grouped by field)
        adminComments: commentsByField,
        unresolvedCommentCount: partner.reviewComments.length,

        // Snapshot of profile fields as they were at the moment admin
        // clicked "Request Changes." Lets the partner UI diff current
        // values against the pre-rejection baseline to flag fields the
        // partner has already addressed in this round. Empty ({}) or
        // null when no review cycle is active. Mirror of the vendor
        // side; see vendor/profile.controller.ts for full context.
        profileSnapshot: partner.profileSnapshot || null,

        // User info
        user: partner.user,
        createdAt: partner.createdAt,
      },
    });
  },
);

// ============== UPDATE COMPANY INFO ==============

/**
 * Update company information fields
 * Only allowed when status is INVITED or CHANGES_REQUESTED
 */
export const updateCompanyInfo = asyncWrapper(
  async (req: Request, res: Response) => {
    const partner = await getPartnerForUser(req.user!.id);

    assertEditable(partner.status, "Profile");

    const {
      companyName,
      logoUrl,
      crNumber,
      vatNumber,
      chamberOfCommerceNumber,
      baladyNumber,
      nationalAddress,
      contactPerson,
      contactPhone,
      contactEmail,
      address,
    } = req.body;

    const updateData: any = {};

    // Only update fields that are provided (partial update)
    if (companyName !== undefined) updateData.companyName = companyName.trim();
    if (logoUrl !== undefined) updateData.logoUrl = logoUrl;
    if (crNumber !== undefined) updateData.crNumber = crNumber.trim();
    if (vatNumber !== undefined) updateData.vatNumber = vatNumber.trim();
    if (chamberOfCommerceNumber !== undefined)
      updateData.chamberOfCommerceNumber = chamberOfCommerceNumber.trim();
    if (baladyNumber !== undefined)
      updateData.baladyNumber = baladyNumber.trim();
    if (nationalAddress !== undefined)
      updateData.nationalAddress = nationalAddress.trim();
    if (contactPerson !== undefined)
      updateData.contactPerson = contactPerson.trim();
    if (contactPhone !== undefined)
      updateData.contactPhone = contactPhone.trim();
    if (contactEmail !== undefined)
      updateData.contactEmail = contactEmail.trim();
    if (address !== undefined) updateData.address = address.trim();

    if (Object.keys(updateData).length === 0) {
      throw new BadRequestError("No fields to update");
    }

    const updated = await prisma.partner.update({
      where: { id: partner.id },
      data: updateData,
    });

    res.json({
      success: true,
      message: "Company info updated",
      data: {
        id: updated.id,
        companyName: updated.companyName,
        status: updated.status,
      },
    });
  },
);

// ============== UPDATE BANK DETAILS ==============

/**
 * Update bank details (Bank Name, Account No, IBAN)
 * Only allowed when status is INVITED or CHANGES_REQUESTED
 */
export const updateBankDetails = asyncWrapper(
  async (req: Request, res: Response) => {
    const partner = await getPartnerForUser(req.user!.id);

    assertEditable(partner.status, "Profile");

    const { bankName, bankAccountNumber, bankIban } = req.body;

    // Partial update - mirror updateCompanyInfo. Field-level autosave
    // sends only the field that changed, so we must NOT require the full
    // set, and must NOT overwrite fields that weren't included.
    const updateData: any = {};

    if (bankName !== undefined) updateData.bankName = bankName?.trim() || null;
    if (bankAccountNumber !== undefined)
      updateData.bankAccountNumber = bankAccountNumber?.trim() || null;
    // IBAN is normalized to uppercase regardless of how it's typed.
    if (bankIban !== undefined)
      updateData.bankIban = bankIban?.trim().toUpperCase() || null;

    if (Object.keys(updateData).length === 0) {
      throw new BadRequestError("No fields to update");
    }

    const updated = await prisma.partner.update({
      where: { id: partner.id },
      data: updateData,
    });

    res.json({
      success: true,
      message: "Bank details updated",
      // Return the persisted values so the client can reconcile local
      // state with what was actually stored (notably the uppercased
      // IBAN) without a full profile refetch.
      data: {
        bankName: (updated as any).bankName ?? null,
        bankAccountNumber: (updated as any).bankAccountNumber ?? null,
        bankIban: (updated as any).bankIban ?? null,
      },
    });
  },
);

// ============== UPLOAD / UPDATE DOCUMENT ==============

/**
 * Upload or replace a required document
 * Types: CR, VAT, CHAMBER_OF_COMMERCE, BALADY, NATIONAL_ADDRESS, IBAN_LETTER
 * Only allowed when status is INVITED or CHANGES_REQUESTED
 */
export const uploadDocument = asyncWrapper(
  async (req: Request, res: Response) => {
    const partner = await getPartnerForUser(req.user!.id);

    assertEditable(partner.status, "Profile");

    const { type, fileUrl, fileName, expiryDate } = req.body;

    if (!type || !fileUrl) {
      throw new BadRequestError("type and fileUrl are required");
    }

    const validTypes = REQUIRED_DOCUMENTS.map((d) => d.type);
    if (!validTypes.includes(type)) {
      throw new BadRequestError(
        `Invalid document type. Must be one of: ${validTypes.join(", ")}`,
      );
    }

    // Enforce expiry date for docs that legally expire. Without this, the
    // doc-expiry lockout would never trigger because the column would stay
    // null forever.
    if (DOCS_WITH_EXPIRY.includes(type) && !expiryDate) {
      throw new BadRequestError(
        `Expiry date is required for ${REQUIRED_DOCUMENTS.find((d) => d.type === type)?.label || type}`,
      );
    }

    // Upsert — create if not exists, update if exists
    const document = await prisma.partnerDocument.upsert({
      where: {
        partnerId_type: { partnerId: partner.id, type },
      },
      create: {
        partnerId: partner.id,
        type,
        fileUrl,
        fileName: fileName || null,
        expiryDate: expiryDate ? new Date(expiryDate) : null,
      },
      update: {
        fileUrl,
        fileName: fileName || null,
        expiryDate: expiryDate ? new Date(expiryDate) : null,
      },
    });

    const signedUrl = await getReadUrl(document.fileUrl);
    const label =
      REQUIRED_DOCUMENTS.find((d) => d.type === document.type)?.label ||
      document.type;

    res.json({
      success: true,
      message: `${label} uploaded successfully`,
      // Return the full document item, shaped exactly like
      // getCompanyProfile's documents.items entries, so the client can
      // splice it into local state without a refetch.
      data: {
        document: {
          type: document.type,
          label,
          isUploaded: true,
          fileUrl: signedUrl,
          filePath: document.fileUrl,
          fileName: document.fileName,
          expiryDate: document.expiryDate,
          uploadedAt: document.updatedAt,
          requiresExpiry: DOCS_WITH_EXPIRY.includes(document.type),
        },
      },
    });
  },
);

// ============== UPLOAD / UPDATE MOU ==============

/**
 * Upload or replace MOU document
 */
export const uploadMou = asyncWrapper(async (req: Request, res: Response) => {
  const partner = await getPartnerForUser(req.user!.id);

  assertEditable(partner.status, "MOU");

  const { fileUrl, expiryDate } = req.body;

  if (!fileUrl) throw new BadRequestError("fileUrl is required");
  if (!expiryDate) throw new BadRequestError("MOU expiry date is required");

  const updated = await prisma.partner.update({
    where: { id: partner.id },
    data: {
      mouFileUrl: fileUrl,
      mouExpiryDate: new Date(expiryDate),
      mouUploadedAt: new Date(),
    },
  });

  const signedUrl = await getReadUrl(updated.mouFileUrl);

  res.json({
    success: true,
    message: "MOU uploaded successfully",
    // Return the persisted MOU state (with a signed read URL) so the
    // client can update the MOU card without a refetch.
    data: {
      mou: {
        fileUrl: signedUrl,
        filePath: updated.mouFileUrl,
        expiryDate: updated.mouExpiryDate,
        uploadedAt: updated.mouUploadedAt,
      },
    },
  });
});

// ============== UPLOAD LOGO ==============

/**
 * Upload or replace company logo.
 *
 * Intentionally NOT gated by `assertEditable` — logo is just branding,
 * not a profile field that admin reviews. Forcing partners to wait
 * for admin approval to update their own logo is friction without
 * business value. The only check that makes sense is "suspended
 * accounts can't change anything," which we enforce explicitly.
 *
 * If we ever add a moderation requirement for logos (e.g. content
 * review), revisit this — but as of now the logo flows straight
 * through.
 */
export const uploadLogo = asyncWrapper(async (req: Request, res: Response) => {
  const partner = await getPartnerForUser(req.user!.id);

  if (partner.status === "SUSPENDED") {
    throw new BadRequestError(
      "Account is suspended. Contact admin to restore access.",
    );
  }

  const { logoUrl } = req.body;
  if (!logoUrl) throw new BadRequestError("logoUrl is required");

  const updated = await prisma.partner.update({
    where: { id: partner.id },
    data: { logoUrl },
  });

  const signedUrl = await getReadUrl(updated.logoUrl);

  res.json({
    success: true,
    message: "Logo updated",
    // Signed URL so the client can render the new logo immediately,
    // without a refetch.
    data: {
      logoUrl: signedUrl,
    },
  });
});

// ============== SUBMIT PROFILE FOR REVIEW ==============

/**
 * Partner submits their profile for admin review
 * Validates all required fields and documents are present
 */
export const submitProfileForReview = asyncWrapper(
  async (req: Request, res: Response) => {
    const partner = await getPartnerForUser(req.user!.id);

    if (partner.status === "APPROVED") {
      throw new BadRequestError("Profile is already approved");
    }

    if (partner.status === "PENDING_REVIEW") {
      throw new BadRequestError("Profile is already submitted for review");
    }

    // Validate required fields
    const missingFields: string[] = [];

    if (!partner.companyName) missingFields.push("Company Name");
    if (!partner.crNumber) missingFields.push("CR Number");
    if (!partner.vatNumber) missingFields.push("VAT Number");
    if (!(partner as any).chamberOfCommerceNumber)
      missingFields.push("Chamber of Commerce Number");
    if (!(partner as any).baladyNumber) missingFields.push("Balady Number");
    if (!(partner as any).nationalAddress)
      missingFields.push("National Address");
    if (!(partner as any).bankName || !(partner as any).bankIban)
      missingFields.push("Bank Details (Name + IBAN)");
    if (!partner.contactPerson) missingFields.push("Contact Person");
    if (!partner.contactPhone) missingFields.push("Contact Phone");
    if (!partner.mouFileUrl) missingFields.push("MOU Document");
    if (!partner.mouExpiryDate) missingFields.push("MOU Expiry Date");

    // Validate documents
    const uploadedDocs = partner.documents || [];
    const uploadedTypes = new Set(uploadedDocs.map((d) => d.type));
    const missingDocs = REQUIRED_DOCUMENTS.filter(
      (d) => !uploadedTypes.has(d.type),
    );
    if (missingDocs.length > 0) {
      missingDocs.forEach((d) => missingFields.push(`${d.label} document`));
    }

    if (missingFields.length > 0) {
      throw new BadRequestError(
        `Cannot submit: ${missingFields.length} required item(s) missing — ${missingFields.join(", ")}`,
      );
    }

    // Update status to PENDING_REVIEW
    await prisma.partner.update({
      where: { id: partner.id },
      data: {
        status: "PENDING_REVIEW",
        isProfileComplete: true,
        profileSubmittedAt: new Date(),
      },
    });

    // Resolve only PARTNER_REQUEST comments — those are granted-edit
    // permissions that expire when the partner submits. ADMIN_REJECTION
    // rows are the admin's outstanding complaints and MUST stay live so
    // admin can accept/reject them on the re-review. The partner-side UI
    // hides them via a status gate (only renders during CHANGES_REQUESTED),
    // so the "clean slate for partner after submit" behavior is preserved
    // without destroying the admin's audit trail.
    await prisma.partnerReviewComment.updateMany({
      where: {
        partnerId: partner.id,
        isResolved: false,
        type: "PARTNER_REQUEST",
      },
      data: { isResolved: true, resolvedAt: new Date() },
    });

    // Notify admin
    const adminUsers = await prisma.user.findMany({
      where: { role: "ADMIN", isActive: true },
      select: { id: true },
    });

    if (adminUsers.length > 0) {
      await prisma.notification.createMany({
        data: adminUsers.map((admin) => ({
          userId: admin.id,
          title: "Partner Profile Submitted for Review",
          message: `${partner.companyName} has submitted their profile for review. All required documents and fields are complete.`,
          type: "PARTNER_PROFILE_SUBMITTED",
          data: { partnerId: partner.id },
        })),
      });
    }

    await prisma.auditLog.create({
      data: {
        userId: req.user!.id,
        action: "PARTNER_PROFILE_SUBMITTED",
        entity: "Partner",
        entityId: partner.id,
        changes: { companyName: partner.companyName },
      },
    });

    res.json({
      success: true,
      message: "Profile submitted for admin review",
    });
  },
);

// ============== GET TEAM MEMBERS ==============

/**
 * Get all team members added by this partner
 */
export const getTeamMembers = asyncWrapper(
  async (req: Request, res: Response) => {
    const partner = await getPartnerForUser(req.user!.id);

    const members = await prisma.partnerTeamMember.findMany({
      where: { partnerId: partner.id },
      orderBy: { createdAt: "desc" },
    });

    const formattedMembers = members.map((m) => ({
      id: m.id,
      name: m.name,
      email: m.email,
      phone: (m as any).phone || null,
      role: m.role,
      roleLabel: TEAM_ROLES.find((r) => r.key === m.role)?.label || m.role,
      status: (m as any).status || (m.isActive ? "ACTIVE" : "DEACTIVATED"),
      isActive: m.isActive,
      invitationSentAt: (m as any).invitationSentAt || null,
      invitationAcceptedAt: (m as any).invitationAcceptedAt || null,
      createdAt: m.createdAt,
    }));

    res.json({
      success: true,
      data: {
        members: formattedMembers,
        totalMembers: members.length,
        activeMembers: members.filter((m) => m.isActive).length,
        availableRoles: TEAM_ROLES,
      },
    });
  },
);

// ============== ADD TEAM MEMBER (INVITE) ==============

/**
 * Partner invites a team member
 * Creates user placeholder + sends invitation link
 * Team members DO NOT need admin approval — they get access based on role
 */
export const addTeamMember = asyncWrapper(
  async (req: Request, res: Response) => {
    const partner = await getPartnerForUser(req.user!.id);

    // Team member invites work regardless of partner approval status
    // (partner is purposefully inviting)

    const { name, email, phone, role } = req.body;

    if (!name?.trim()) throw new BadRequestError("Name is required");
    if (!email?.trim()) throw new BadRequestError("Email is required");
    if (!role) throw new BadRequestError("Role is required");

    const validRoles = TEAM_ROLES.map((r) => r.key);
    if (!validRoles.includes(role)) {
      throw new BadRequestError(
        `Invalid role. Must be one of: ${validRoles.join(", ")}`,
      );
    }

    // Check if email already exists as a team member for this partner
    const existingMember = await prisma.partnerTeamMember.findFirst({
      where: { partnerId: partner.id, email: email.trim().toLowerCase() },
    });
    if (existingMember) {
      throw new BadRequestError("A team member with this email already exists");
    }

    // Check if email is already registered as a user
    const existingUser = await prisma.user.findUnique({
      where: { email: email.trim().toLowerCase() },
    });
    if (existingUser) {
      throw new BadRequestError(
        "This email is already registered in the system. The person may already have an account.",
      );
    }

    // Generate invitation token
    const invitationToken = crypto.randomBytes(32).toString("hex");
    const invitationExpiresAt = new Date();
    invitationExpiresAt.setDate(invitationExpiresAt.getDate() + 7);

    const member = await prisma.partnerTeamMember.create({
      data: {
        partnerId: partner.id,
        name: name.trim(),
        email: email.trim().toLowerCase(),
        phone: phone?.trim() || null,
        role,
        status: "INVITED",
        isActive: true,
        invitationToken,
        invitationSentAt: new Date(),
        invitationExpiresAt,
      } as any,
    });

    // Log the invitation
    await prisma.partnerInvitationLog.create({
      data: {
        partnerId: partner.id,
        email: email.trim().toLowerCase(),
        companyName: partner.companyName,
        action: "TEAM_MEMBER_INVITED",
        sentByUserId: req.user!.id,
        sentByName: partner.contactPerson || partner.companyName,
      },
    });

    // TODO: Send actual email with invitation link
    // const invitationLink = `${process.env.PARTNER_PORTAL_URL}/join?token=${invitationToken}`;

    res.status(201).json({
      success: true,
      message: `Invitation sent to ${email}`,
      data: {
        id: member.id,
        name: member.name,
        email: member.email,
        role: member.role,
        status: "INVITED",
        invitationToken:
          process.env.NODE_ENV === "development" ? invitationToken : undefined,
      },
    });
  },
);

// ============== RESEND TEAM MEMBER INVITE ==============

/**
 * Resend invitation email to a team member
 */
export const resendTeamMemberInvite = asyncWrapper(
  async (req: Request, res: Response) => {
    const partner = await getPartnerForUser(req.user!.id);
    const { memberId } = req.params;

    const member = await prisma.partnerTeamMember.findFirst({
      where: { id: memberId, partnerId: partner.id },
    });

    if (!member) throw new NotFoundError("Team member");

    if ((member as any).status !== "INVITED") {
      throw new BadRequestError(
        "Can only resend invitations to members with INVITED status",
      );
    }

    // Generate new token
    const invitationToken = crypto.randomBytes(32).toString("hex");
    const invitationExpiresAt = new Date();
    invitationExpiresAt.setDate(invitationExpiresAt.getDate() + 7);

    await prisma.partnerTeamMember.update({
      where: { id: memberId },
      data: {
        invitationToken,
        invitationSentAt: new Date(),
        invitationExpiresAt,
      } as any,
    });

    await prisma.partnerInvitationLog.create({
      data: {
        partnerId: partner.id,
        email: member.email,
        companyName: partner.companyName,
        action: "TEAM_MEMBER_INVITE_RESENT",
        sentByUserId: req.user!.id,
        sentByName: partner.contactPerson || partner.companyName,
      },
    });

    // TODO: Send actual email

    res.json({
      success: true,
      message: `Invitation resent to ${member.email}`,
    });
  },
);

// ============== UPDATE TEAM MEMBER ROLE ==============

/**
 * Change a team member's role
 */
export const updateTeamMemberRole = asyncWrapper(
  async (req: Request, res: Response) => {
    const partner = await getPartnerForUser(req.user!.id);
    const { memberId } = req.params;
    const { role } = req.body;

    if (!role) throw new BadRequestError("Role is required");

    const validRoles = TEAM_ROLES.map((r) => r.key);
    if (!validRoles.includes(role)) {
      throw new BadRequestError(
        `Invalid role. Must be one of: ${validRoles.join(", ")}`,
      );
    }

    const member = await prisma.partnerTeamMember.findFirst({
      where: { id: memberId, partnerId: partner.id },
    });
    if (!member) throw new NotFoundError("Team member");

    await prisma.partnerTeamMember.update({
      where: { id: memberId },
      data: { role },
    });

    res.json({
      success: true,
      message: `${member.name}'s role updated to ${TEAM_ROLES.find((r) => r.key === role)?.label || role}`,
    });
  },
);

// ============== DEACTIVATE / REACTIVATE TEAM MEMBER ==============

/**
 * Deactivate a team member (revoke access)
 */
export const deactivateTeamMember = asyncWrapper(
  async (req: Request, res: Response) => {
    const partner = await getPartnerForUser(req.user!.id);
    const { memberId } = req.params;

    const member = await prisma.partnerTeamMember.findFirst({
      where: { id: memberId, partnerId: partner.id },
    });
    if (!member) throw new NotFoundError("Team member");

    await prisma.partnerTeamMember.update({
      where: { id: memberId },
      data: { isActive: false, status: "DEACTIVATED" } as any,
    });

    res.json({
      success: true,
      message: `${member.name} has been deactivated`,
    });
  },
);

/**
 * Reactivate a previously deactivated team member
 */
export const reactivateTeamMember = asyncWrapper(
  async (req: Request, res: Response) => {
    const partner = await getPartnerForUser(req.user!.id);
    const { memberId } = req.params;

    const member = await prisma.partnerTeamMember.findFirst({
      where: { id: memberId, partnerId: partner.id },
    });
    if (!member) throw new NotFoundError("Team member");

    if (member.isActive) {
      throw new BadRequestError("Team member is already active");
    }

    await prisma.partnerTeamMember.update({
      where: { id: memberId },
      data: { isActive: true, status: "ACTIVE" } as any,
    });

    res.json({
      success: true,
      message: `${member.name} has been reactivated`,
    });
  },
);

// ============== REMOVE TEAM MEMBER ==============

/**
 * Permanently remove a team member
 */
export const removeTeamMember = asyncWrapper(
  async (req: Request, res: Response) => {
    const partner = await getPartnerForUser(req.user!.id);
    const { memberId } = req.params;

    const member = await prisma.partnerTeamMember.findFirst({
      where: { id: memberId, partnerId: partner.id },
    });
    if (!member) throw new NotFoundError("Team member");

    await prisma.partnerTeamMember.delete({
      where: { id: memberId },
    });

    res.json({
      success: true,
      message: `${member.name} has been removed`,
    });
  },
);

// ============== GET AVAILABLE ROLES ==============

/**
 * Get available roles for team members
 */
export const getAvailableRoles = asyncWrapper(
  async (req: Request, res: Response) => {
    res.json({
      success: true,
      data: { roles: TEAM_ROLES },
    });
  },
);

// ============== REQUEST PROFILE CHANGES ==============

/**
 * POST /api/v1/partner/profile/change-request
 *
 * Approved partners can request permission to edit specific fields.
 * Admin reviews and either approves (sets status back to CHANGES_REQUESTED)
 * or rejects with a note.
 *
 * Body: { fields: string[], reason: string }
 */
export const requestProfileChanges = asyncWrapper(
  async (req: Request, res: Response) => {
    const partner = await getPartnerForUser(req.user!.id);

    if (partner.status !== "APPROVED") {
      throw new BadRequestError(
        "Change requests can only be submitted when your profile is approved. If your profile is still editable, you can make changes directly.",
      );
    }

    const { fields, reason } = req.body;

    if (!fields || !Array.isArray(fields) || fields.length === 0) {
      throw new BadRequestError(
        "Please select at least one field you want to change",
      );
    }
    if (!reason?.trim()) {
      throw new BadRequestError(
        "Please provide a reason for the change request",
      );
    }

    // Check for existing pending request
    const existingPending = await prisma.partnerChangeRequest.findFirst({
      where: { partnerId: partner.id, status: "PENDING" },
    });
    if (existingPending) {
      throw new BadRequestError(
        "You already have a pending change request. Please wait for admin to review it before submitting another.",
      );
    }

    const changeRequest = await prisma.partnerChangeRequest.create({
      data: {
        partnerId: partner.id,
        fields,
        reason: reason.trim(),
        status: "PENDING",
      },
    });

    // Notify admin
    const adminUsers = await prisma.user.findMany({
      where: { role: "ADMIN", isActive: true },
      select: { id: true },
    });

    if (adminUsers.length > 0) {
      await prisma.notification.createMany({
        data: adminUsers.map((admin) => ({
          userId: admin.id,
          title: "Partner Change Request",
          message: `${partner.companyName} is requesting to edit their profile. Fields: ${(fields as string[]).join(", ")}. Reason: ${reason.trim()}`,
          type: "PARTNER_CHANGE_REQUEST",
          data: { partnerId: partner.id, changeRequestId: changeRequest.id },
        })),
      });
    }

    res.status(201).json({
      success: true,
      message: "Change request submitted. Admin will review it shortly.",
      data: {
        id: changeRequest.id,
        status: "PENDING",
        fields,
        reason: reason.trim(),
      },
    });
  },
);

// ============== GET CHANGE REQUESTS ==============

/**
 * GET /api/v1/partner/profile/change-requests
 */
export const getChangeRequests = asyncWrapper(
  async (req: Request, res: Response) => {
    const partner = await getPartnerForUser(req.user!.id);

    const requests = await prisma.partnerChangeRequest.findMany({
      where: { partnerId: partner.id },
      orderBy: { createdAt: "desc" },
      take: 10,
    });

    res.json({
      success: true,
      data: {
        requests,
        hasPending: requests.some((r) => r.status === "PENDING"),
      },
    });
  },
);
