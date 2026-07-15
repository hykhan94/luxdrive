// ============================================
// apps/server/src/controller/vendor/profile.controller.ts
// Vendor Portal — Company Profile Section
// Mirrors partner/profile.controller.ts logic exactly
// ============================================

import { Request, Response } from "express";
import { prisma } from "../../lib/prisma";
import { getReadUrl } from "../../lib/gcs";
import { asyncWrapper } from "../../utils/asyncWrapper";
import { NotFoundError, BadRequestError } from "../../utils/AppError";
import crypto from "crypto";

// ============== GCS SETUP ==============

// ============== CONSTANTS ==============

const REQUIRED_DOCUMENTS = [
  { type: "CR", label: "Commercial Registration" },
  { type: "VAT", label: "VAT Registration Certificate" },
  { type: "CHAMBER_OF_COMMERCE", label: "Chamber of Commerce" },
  { type: "BALADY", label: "Balady License" },
  { type: "NATIONAL_ADDRESS", label: "National Address" },
  { type: "IBAN_LETTER", label: "IBAN Letter" },
];

// Documents that need expiry dates
const DOCS_WITH_EXPIRY = ["CR", "CHAMBER_OF_COMMERCE", "BALADY"];

// Statuses where a vendor can edit their profile + upload docs/logo.
// ONBOARDING included so newly-invited vendors can fill their profile
// on first login. Mirrors partner/profile.controller.ts.
const EDITABLE_STATUSES = ["INVITED", "ONBOARDING", "CHANGES_REQUESTED"];

function assertEditable(status: string, action = "Profile") {
  if (!EDITABLE_STATUSES.includes(status)) {
    throw new BadRequestError(
      `${action} cannot be edited in "${status}" status. Submit a change request if you need to make changes.`,
    );
  }
}

const TEAM_ROLES = [
  { key: "admin", label: "Admin", description: "Full access to all sections" },
  {
    key: "manager",
    label: "Manager",
    description: "Can manage bookings, fleet, and drivers",
  },
  {
    key: "dispatcher",
    label: "Dispatcher",
    description: "Can manage bookings and assign drivers",
  },
  {
    key: "viewer",
    label: "Viewer",
    description: "Read-only access to all sections",
  },
];

// Editable fields for change request system
const VENDOR_EDITABLE_FIELDS: Record<string, string> = {
  companyName: "Company Name",
  crNumber: "CR Number",
  vatNumber: "VAT Number",
  chamberOfCommerceNumber: "Chamber of Commerce Number",
  baladyNumber: "Balady Number",
  nationalAddress: "National Address",
  contactPerson: "Contact Person",
  contactPhone: "Contact Phone",
  contactEmail: "Contact Email",
  address: "Address",
  logo: "Company Logo",
  bankName: "Bank Name",
  bankAccountNumber: "Account Number",
  bankIban: "IBAN",
  CR: "Commercial Registration",
  VAT: "VAT Certificate",
  CHAMBER_OF_COMMERCE: "Chamber of Commerce",
  BALADY: "Balady License",
  NATIONAL_ADDRESS: "National Address",
  IBAN_LETTER: "IBAN Letter",
  mou: "MOU Document",
  mouExpiry: "MOU Expiry Date",
};

// ============== HELPERS ==============

async function getVendorForUser(userId: string) {
  const vendor = await prisma.vendor.findUnique({
    where: { userId },
    include: {
      user: {
        select: { id: true, email: true, name: true, phone: true },
      },
      vendorDocuments: true,
      reviewComments: {
        where: { isResolved: false },
        orderBy: { createdAt: "desc" },
      },
    },
  });
  if (!vendor) throw new NotFoundError("Vendor profile");
  return vendor;
}

// Returns the set of field/doc keys the vendor is currently allowed to edit
// or null if no field-level gating applies (status is INVITED → vendor can
// edit anything during initial setup). For CHANGES_REQUESTED status, we look
// for an admin-approved-but-unresolved change request and return its fields[].
// If admin requested changes themselves (reviewComments path), the fields
// from those comments are what's editable.
async function getAllowedFieldsForVendor(
  vendorId: string,
  status: string,
): Promise<string[] | null> {
  // INVITED / ONBOARDING = initial setup, everything is editable.
  // ONBOARDING was added after this helper was written and was missed
  // here — previously it fell through to the empty-array branch below
  // and produced "No editable fields in this request" 400s when freshly
  // invited vendors tried to save Company Details. Both INVITED and
  // ONBOARDING mean "vendor is filling profile for the first time,"
  // so the field-level allowlist doesn't apply yet.
  if (status === "INVITED" || status === "ONBOARDING") return null;

  if (status === "CHANGES_REQUESTED") {
    // Source 1: vendor-initiated change request (admin approved it)
    const approvedRequest = await prisma.vendorProfileReviewRequest.findFirst({
      where: {
        vendorId,
        status: "APPROVED",
        isResolved: false,
      },
      orderBy: { reviewedAt: "desc" },
    });
    if (approvedRequest) {
      return approvedRequest.fields as string[];
    }
    // Source 2: admin-initiated changes via reviewComments
    const comments = await prisma.vendorReviewComment.findMany({
      where: { vendorId, isResolved: false },
      select: { fieldName: true },
    });
    if (comments.length > 0) {
      return Array.from(new Set(comments.map((c) => c.fieldName)));
    }
    // CHANGES_REQUESTED but no comments and no approved request — fall through
    // to allow all (shouldn't normally happen, but don't lock the vendor out)
    return null;
  }

  // APPROVED / SUSPENDED / PENDING_REVIEW etc. — nothing editable
  return [];
}

// ============== GET VENDOR PROFILE ==============

export const getVendorProfile = asyncWrapper(
  async (req: Request, res: Response) => {
    const vendor = await getVendorForUser(req.user!.id);

    // Build admin comments by field
    const commentsByField: Record<
      string,
      Array<{
        id: string;
        comment: string;
        // Type discriminates admin rejection vs vendor-request vs plain
        // admin note. Frontend uses this instead of prefix-parsing the
        // comment text.
        type: string;
        isResolved: boolean;
        createdAt: Date;
      }>
    > = {};
    vendor.reviewComments.forEach((c) => {
      if (!commentsByField[c.fieldName]) commentsByField[c.fieldName] = [];
      commentsByField[c.fieldName].push({
        id: c.id,
        comment: c.comment,
        type: (c as any).type,
        isResolved: c.isResolved,
        createdAt: c.createdAt,
      });
    });

    // Editable while filling out (ONBOARDING) or fixing
    // (CHANGES_REQUESTED). PENDING_REVIEW / APPROVED / SUSPENDED lock
    // edits — admins use change-request flow for approved vendors.
    const isEditable = EDITABLE_STATUSES.includes(vendor.status);

    // Logo signed URL
    const logoUrl = (vendor as any).logoUrl
      ? await getReadUrl((vendor as any).logoUrl)
      : null;

    // MOU signed URL
    const mouFileUrl = vendor.mouFileUrl
      ? await getReadUrl(vendor.mouFileUrl)
      : null;

    // Build document status with signed URLs
    const uploadedDocs = (vendor as any).vendorDocuments || [];
    const uploadedTypes = new Set(uploadedDocs.map((d: any) => d.type));

    const documentsWithUrls = await Promise.all(
      REQUIRED_DOCUMENTS.map(async (doc) => {
        const uploaded = uploadedDocs.find((d: any) => d.type === doc.type);
        return {
          type: doc.type,
          label: doc.label,
          isUploaded: !!uploaded,
          fileUrl: uploaded?.fileUrl
            ? await getReadUrl(uploaded.fileUrl)
            : null,
          fileName: uploaded?.fileName || null,
          expiryDate: uploaded?.expiryDate || null,
          requiresExpiry: DOCS_WITH_EXPIRY.includes(doc.type),
          uploadedAt: uploaded?.createdAt || null,
          filePath: uploaded?.fileUrl || null,
        };
      }),
    );

    const allDocumentsUploaded = REQUIRED_DOCUMENTS.every((d) =>
      uploadedTypes.has(d.type),
    );
    const missingDocuments = REQUIRED_DOCUMENTS.filter(
      (d) => !uploadedTypes.has(d.type),
    ).map((d) => d.label);

    // ============== EXPIRY DERIVATION ==============
    // Build expiring/expired arrays for the frontend popover + status banner.
    // Mirrors the shape used by driver/fleet endpoints. MOU is included as a
    // pseudo-doc with type "mou" so the same popover/chip code path handles it.
    const now = Date.now();
    const dayMs = 1000 * 60 * 60 * 24;
    type ExpiryDoc = { type: string; label: string; expiryDate: string | null };

    const expiringDocs: ExpiryDoc[] = [];
    const expiredDocs: ExpiryDoc[] = [];

    documentsWithUrls.forEach((doc) => {
      if (!doc.expiryDate) return;
      const days = Math.ceil(
        (new Date(doc.expiryDate).getTime() - now) / dayMs,
      );
      const entry = {
        type: doc.type,
        label: doc.label,
        expiryDate: doc.expiryDate
          ? new Date(doc.expiryDate).toISOString()
          : null,
      };
      if (days < 0) expiredDocs.push(entry);
      else if (days <= 30) expiringDocs.push(entry);
    });

    // MOU expiry
    if (vendor.mouExpiryDate) {
      const days = Math.ceil(
        (new Date(vendor.mouExpiryDate).getTime() - now) / dayMs,
      );
      const entry = {
        type: "mou",
        label: "MOU Document",
        expiryDate: new Date(vendor.mouExpiryDate).toISOString(),
      };
      if (days < 0) expiredDocs.push(entry);
      else if (days <= 30) expiringDocs.push(entry);
    }

    // ============== CHANGE REQUESTS ==============
    // Pull recent ones + the currently-active approved one (gates editing).
    const changeRequests = await prisma.vendorProfileReviewRequest.findMany({
      where: { vendorId: vendor.id },
      orderBy: { createdAt: "desc" },
      take: 10,
    });
    const hasPendingRequest = changeRequests.some(
      (r) => r.status === "PENDING",
    );
    const activeApproved = changeRequests.find(
      (r) => r.status === "APPROVED" && !r.isResolved,
    );

    // ============== EDITABLE FIELDS ==============
    // Compute once and return so the frontend doesn't duplicate the logic.
    const editableFields = await getAllowedFieldsForVendor(
      vendor.id,
      vendor.status,
    );

    res.json({
      success: true,
      data: {
        id: vendor.id,
        status: vendor.status,
        isEditable,
        // Logo is not subject to admin review — vendor can change
        // branding any time unless the account is suspended. Mirrors
        // the partner side.
        canEditLogo: vendor.status !== "SUSPENDED",
        isApproved: vendor.status === "APPROVED",
        isProfileComplete: vendor.isProfileComplete,

        // null = everything editable (INVITED state). Empty array = nothing
        // editable (APPROVED with no active change request). Non-empty array =
        // these specific fields/docs are editable.
        editableFields,

        // Expiry information for the status banner popover + inline chips
        expiringDocs,
        expiredDocs,

        // Change request state
        changeRequests: changeRequests.map((r) => ({
          id: r.id,
          fields: r.fields,
          fieldLabels: (r.fields as string[]).map(
            (f) => VENDOR_EDITABLE_FIELDS[f] || f,
          ),
          message: r.message,
          status: r.status,
          adminNote: r.adminNote,
          isResolved: r.isResolved,
          createdAt: r.createdAt,
          reviewedAt: r.reviewedAt,
        })),
        hasPendingRequest,
        activeApprovedRequest: activeApproved
          ? {
              id: activeApproved.id,
              fields: activeApproved.fields,
              message: activeApproved.message,
            }
          : null,

        // Company Info
        companyInfo: {
          companyName: vendor.companyName,
          logoUrl,
          crNumber: vendor.crNumber || null,
          vatNumber: vendor.vatNumber || null,
          chamberOfCommerceNumber:
            (vendor as any).chamberOfCommerceNumber || null,
          baladyNumber: (vendor as any).baladyNumber || null,
          nationalAddress: (vendor as any).nationalAddress || null,
          contactPerson: vendor.contactPerson || null,
          contactPhone: vendor.contactPhone || null,
          // Prefer the dedicated company contact email; fall back to
          // the auth login email for rows created before the
          // contactEmail column existed. Once the vendor edits Company
          // Details and saves, the contactEmail column will be set and
          // the fallback stops applying.
          contactEmail:
            (vendor as any).contactEmail || vendor.user.email || null,
          address: vendor.address || null,
        },

        // Business Documents (6 required)
        documents: {
          items: documentsWithUrls,
          allUploaded: allDocumentsUploaded,
          missingDocuments,
          uploadedCount: uploadedDocs.length,
          requiredCount: REQUIRED_DOCUMENTS.length,
        },

        // Bank Details
        bankDetails: {
          bankName: vendor.bankName || null,
          bankAccountNumber: (vendor as any).bankAccountNumber || null,
          bankIban: vendor.bankIban || null,
        },

        // MOU / Contract
        mou: {
          fileUrl: mouFileUrl,
          filePath: vendor.mouFileUrl || null,
          expiryDate: vendor.mouExpiryDate || null,
          uploadedAt: vendor.mouUploadedAt || null,
        },

        // Admin Review Comments (grouped by field)
        adminComments: commentsByField,
        unresolvedCommentCount: vendor.reviewComments.length,

        // Snapshot of profile fields as they were at the moment admin
        // clicked "Request Changes" (set by admin's requestVendorChanges
        // / approveVendorProfileChangeRequest paths). Lets the vendor UI
        // diff current values against the pre-rejection baseline to flag
        // fields the vendor has already addressed in this round. Empty
        // ({}) or null when no review cycle is active.
        profileSnapshot: vendor.profileSnapshot || null,

        // User info
        user: vendor.user,
        createdAt: vendor.createdAt,
      },
    });
  },
);

// ============== UPDATE COMPANY INFO ==============

export const updateCompanyInfo = asyncWrapper(
  async (req: Request, res: Response) => {
    const vendor = await getVendorForUser(req.user!.id);

    assertEditable(vendor.status, "Profile");

    const {
      companyName,
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

    // Field-level gating: when CHANGES_REQUESTED, only the fields the admin
    // approved (or admin-requested changes for) are editable. INVITED state
    // means initial setup → everything goes.
    const allowedFields = await getAllowedFieldsForVendor(
      vendor.id,
      vendor.status,
    );
    const isFieldAllowed = (key: string) =>
      allowedFields === null || allowedFields.includes(key);

    const updateData: Record<string, unknown> = {};
    if (companyName !== undefined && isFieldAllowed("companyName"))
      updateData.companyName = companyName.trim();
    if (crNumber !== undefined && isFieldAllowed("crNumber"))
      updateData.crNumber = crNumber.trim();
    if (vatNumber !== undefined && isFieldAllowed("vatNumber"))
      updateData.vatNumber = vatNumber.trim();
    if (
      chamberOfCommerceNumber !== undefined &&
      isFieldAllowed("chamberOfCommerceNumber")
    )
      updateData.chamberOfCommerceNumber = chamberOfCommerceNumber.trim();
    if (baladyNumber !== undefined && isFieldAllowed("baladyNumber"))
      updateData.baladyNumber = baladyNumber.trim();
    if (nationalAddress !== undefined && isFieldAllowed("nationalAddress"))
      updateData.nationalAddress = nationalAddress.trim();
    if (contactPerson !== undefined && isFieldAllowed("contactPerson"))
      updateData.contactPerson = contactPerson.trim();
    if (contactPhone !== undefined && isFieldAllowed("contactPhone"))
      updateData.contactPhone = contactPhone.trim();
    if (contactEmail !== undefined && isFieldAllowed("contactEmail"))
      updateData.contactEmail = contactEmail.trim();
    if (address !== undefined && isFieldAllowed("address"))
      updateData.address = address.trim();

    if (Object.keys(updateData).length === 0) {
      throw new BadRequestError(
        "No editable fields in this request. " +
          (allowedFields
            ? `You can only edit: ${allowedFields.join(", ")}`
            : ""),
      );
    }

    const updated = await prisma.vendor.update({
      where: { id: vendor.id },
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

export const updateBankDetails = asyncWrapper(
  async (req: Request, res: Response) => {
    const vendor = await getVendorForUser(req.user!.id);

    assertEditable(vendor.status, "Bank details");

    const { bankName, bankAccountNumber, bankIban } = req.body;

    // Field-level gating (like updateCompanyInfo). Bank is gated per-field
    // since each field is autosaved individually from the client.
    const allowedFields = await getAllowedFieldsForVendor(
      vendor.id,
      vendor.status,
    );
    const isFieldAllowed = (key: string) =>
      allowedFields === null || allowedFields.includes(key);

    // Partial update — mirror updateCompanyInfo. Field-level autosave
    // sends only the field that changed, so we must NOT require the full
    // set, and must NOT overwrite fields that weren't included.
    const updateData: any = {};

    if (bankName !== undefined && isFieldAllowed("bankName"))
      updateData.bankName = bankName?.trim() || null;
    if (bankAccountNumber !== undefined && isFieldAllowed("bankAccountNumber"))
      updateData.bankAccountNumber = bankAccountNumber?.trim() || null;
    // IBAN is normalized to uppercase regardless of how it's typed.
    if (bankIban !== undefined && isFieldAllowed("bankIban"))
      updateData.bankIban = bankIban?.trim().toUpperCase() || null;

    if (Object.keys(updateData).length === 0) {
      throw new BadRequestError(
        "No editable bank fields in this request. " +
          (allowedFields
            ? `You can only edit: ${allowedFields.join(", ")}`
            : ""),
      );
    }

    const updated = await prisma.vendor.update({
      where: { id: vendor.id },
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
 * Upload or replace a required business document
 * Types: CR, VAT, CHAMBER_OF_COMMERCE, BALADY, NATIONAL_ADDRESS, IBAN_LETTER
 * Only allowed when status is INVITED or CHANGES_REQUESTED
 * NOTE: Does NOT auto-resolve admin comments. Admin must verify.
 */
export const uploadDocument = asyncWrapper(
  async (req: Request, res: Response) => {
    const vendor = await getVendorForUser(req.user!.id);

    assertEditable(vendor.status, "Document");

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

    // Per-doc gating
    const allowedFields = await getAllowedFieldsForVendor(
      vendor.id,
      vendor.status,
    );
    if (allowedFields !== null && !allowedFields.includes(type)) {
      throw new BadRequestError(
        `"${REQUIRED_DOCUMENTS.find((d) => d.type === type)?.label || type}" is not in your current allowed edit list. ` +
          `Editable: ${allowedFields.join(", ")}`,
      );
    }

    if (DOCS_WITH_EXPIRY.includes(type) && !expiryDate) {
      throw new BadRequestError(
        `Expiry date is required for ${REQUIRED_DOCUMENTS.find((d) => d.type === type)?.label || type}`,
      );
    }

    const document = await prisma.vendorDocument.upsert({
      where: {
        vendorId_type: { vendorId: vendor.id, type },
      },
      create: {
        vendorId: vendor.id,
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
      // getVendorProfile's documents.items entries, so the client can
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

// ============== UPLOAD MOU ==============

export const uploadMou = asyncWrapper(async (req: Request, res: Response) => {
  const vendor = await getVendorForUser(req.user!.id);

  assertEditable(vendor.status, "Profile");

  const { fileUrl, expiryDate } = req.body;

  if (!fileUrl) throw new BadRequestError("fileUrl is required");
  if (!expiryDate) throw new BadRequestError("MOU expiry date is required");

  // Per-field gating
  const allowedFields = await getAllowedFieldsForVendor(
    vendor.id,
    vendor.status,
  );
  if (
    allowedFields !== null &&
    !allowedFields.includes("mou") &&
    !allowedFields.includes("mouExpiry")
  ) {
    throw new BadRequestError(
      "MOU is not in your current allowed edit list. " +
        `Editable: ${allowedFields.join(", ")}`,
    );
  }

  const updated = await prisma.vendor.update({
    where: { id: vendor.id },
    data: {
      mouFileUrl: fileUrl,
      mouExpiryDate: new Date(expiryDate),
      mouUploadedAt: new Date(),
    },
  });

  const signedUrl = updated.mouFileUrl
    ? await getReadUrl(updated.mouFileUrl)
    : null;

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
 * Intentionally NOT gated by `assertEditable` or the per-field
 * `allowedFields` allowlist — logo is just branding, not a profile
 * field admin reviews. Forcing vendors to wait for approval to update
 * their own logo is friction without business value. The only block
 * is SUSPENDED, since suspended accounts shouldn't be mutating
 * anything.
 *
 * Mirrors partner/profile.controller.ts. If a moderation step ever
 * gets added (e.g. content review), this is the gate to reintroduce.
 */
export const uploadLogo = asyncWrapper(async (req: Request, res: Response) => {
  const vendor = await getVendorForUser(req.user!.id);

  if (vendor.status === "SUSPENDED") {
    throw new BadRequestError(
      "Account is suspended. Contact admin to restore access.",
    );
  }

  const { logoUrl } = req.body;
  if (!logoUrl) throw new BadRequestError("logoUrl is required");

  await prisma.vendor.update({
    where: { id: vendor.id },
    data: { logoUrl } as any,
  });

  res.json({
    success: true,
    message: "Logo updated",
  });
});

// ============== SUBMIT PROFILE FOR REVIEW ==============

export const submitProfileForReview = asyncWrapper(
  async (req: Request, res: Response) => {
    const vendor = await getVendorForUser(req.user!.id);

    if (vendor.status === "APPROVED") {
      throw new BadRequestError("Profile is already approved");
    }
    if (vendor.status === "PENDING_REVIEW") {
      throw new BadRequestError("Profile is already submitted for review");
    }

    // Validate required fields
    const missingFields: string[] = [];

    if (!vendor.companyName) missingFields.push("Company Name");
    if (!vendor.crNumber) missingFields.push("CR Number");
    if (!vendor.vatNumber) missingFields.push("VAT Number");
    if (!(vendor as any).chamberOfCommerceNumber)
      missingFields.push("Chamber of Commerce Number");
    if (!(vendor as any).baladyNumber) missingFields.push("Balady Number");
    if (!(vendor as any).nationalAddress)
      missingFields.push("National Address");
    if (!vendor.contactPerson) missingFields.push("Contact Person");
    if (!vendor.contactPhone) missingFields.push("Contact Phone");
    if (!vendor.bankName || !vendor.bankIban)
      missingFields.push("Bank Details (Name + IBAN)");
    if (!vendor.mouFileUrl) missingFields.push("MOU Document");
    if (!vendor.mouExpiryDate) missingFields.push("MOU Expiry Date");

    // Validate documents
    const uploadedDocs = await prisma.vendorDocument.findMany({
      where: { vendorId: vendor.id },
      select: { type: true },
    });
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

    // Update status
    await prisma.vendor.update({
      where: { id: vendor.id },
      data: {
        status: "PENDING_REVIEW",
        isProfileComplete: true,
        profileSubmittedAt: new Date(),
      },
    });

    // Close the edit-permission window: mark any active approved change
    // requests as resolved. Vendor has used their permission to edit; if they
    // want to edit again later they need a fresh change request.
    await prisma.vendorProfileReviewRequest.updateMany({
      where: {
        vendorId: vendor.id,
        status: "APPROVED",
        isResolved: false,
      },
      data: {
        isResolved: true,
        resolvedAt: new Date(),
      },
    });

    // Resolve only VENDOR_REQUEST comments — those are granted-edit
    // permissions that expire when the vendor submits. ADMIN_REJECTION
    // rows are the admin's outstanding complaints and MUST stay live so
    // admin can accept/reject them on the re-review. Mirrors partner's
    // submitProfileForReview exactly.
    await prisma.vendorReviewComment.updateMany({
      where: {
        vendorId: vendor.id,
        isResolved: false,
        type: "VENDOR_REQUEST",
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
          title: "Vendor Profile Submitted for Review",
          message: `${vendor.companyName} has submitted their profile for review. All required documents and fields are complete.`,
          type: "VENDOR_PROFILE_SUBMITTED",
          data: { vendorId: vendor.id },
        })),
      });
    }

    await prisma.auditLog.create({
      data: {
        userId: req.user!.id,
        action: "VENDOR_PROFILE_SUBMITTED",
        entity: "Vendor",
        entityId: vendor.id,
        changes: { companyName: vendor.companyName },
      },
    });

    res.json({
      success: true,
      message: "Profile submitted for admin review",
    });
  },
);

// ============== REQUEST PROFILE CHANGES ==============

// ============== REQUEST PROFILE CHANGES (vendor-initiated) ==============
//
// Approved vendor asks admin for permission to edit specific profile fields or
// re-upload documents. We persist a VendorProfileReviewRequest (PENDING) so we
// can later track its lifecycle through admin approval; until approved, the
// vendor cannot edit. Mirrors driver/vehicle change-request flow.

export const requestProfileChanges = asyncWrapper(
  async (req: Request, res: Response) => {
    const vendor = await getVendorForUser(req.user!.id);

    if (vendor.status !== "APPROVED") {
      throw new BadRequestError(
        "Profile change requests can only be submitted when your profile is approved",
      );
    }

    const { fields, reason } = req.body;

    if (!fields || !Array.isArray(fields) || fields.length === 0) {
      throw new BadRequestError("Select at least one field to update");
    }
    if (!reason?.trim()) {
      throw new BadRequestError(
        "Please provide a reason for the change request",
      );
    }

    // Validate fields against the editable-fields whitelist
    const validFields = Object.keys(VENDOR_EDITABLE_FIELDS);
    const invalidFields = (fields as string[]).filter(
      (f) => !validFields.includes(f),
    );
    if (invalidFields.length > 0) {
      throw new BadRequestError(`Invalid fields: ${invalidFields.join(", ")}`);
    }

    // Don't let the vendor stack multiple pending requests
    const existingPending = await prisma.vendorProfileReviewRequest.findFirst({
      where: {
        vendorId: vendor.id,
        status: "PENDING",
      },
    });
    if (existingPending) {
      throw new BadRequestError(
        "You already have a pending change request. Wait for admin to review it before submitting another.",
      );
    }

    // Create the review request
    const reviewRequest = await prisma.vendorProfileReviewRequest.create({
      data: {
        vendorId: vendor.id,
        fields: fields as string[],
        message: reason.trim(),
        requestType: "VENDOR_INITIATED",
        status: "PENDING",
        createdBy: req.user!.id,
      },
    });

    // Notify all admins
    const adminUsers = await prisma.user.findMany({
      where: { role: "ADMIN", isActive: true },
      select: { id: true },
    });

    const fieldLabels = (fields as string[])
      .map((f) => VENDOR_EDITABLE_FIELDS[f] || f)
      .join(", ");

    if (adminUsers.length > 0) {
      await prisma.notification.createMany({
        data: adminUsers.map((admin) => ({
          userId: admin.id,
          title: "Vendor Profile Change Request",
          message: `${vendor.companyName} requests to update their profile. Fields: ${fieldLabels}. Reason: ${reason.trim()}`,
          type: "VENDOR_CHANGE_REQUEST",
          data: {
            vendorId: vendor.id,
            changeRequestId: reviewRequest.id,
            fields,
            reason: reason.trim(),
          },
        })),
      });
    }

    await prisma.auditLog.create({
      data: {
        userId: req.user!.id,
        action: "VENDOR_PROFILE_CHANGE_REQUESTED",
        entity: "Vendor",
        entityId: vendor.id,
        changes: { fields, reason: reason.trim(), fieldLabels },
      },
    });

    res.json({
      success: true,
      message: "Change request submitted. Admin will review it shortly.",
      data: {
        id: reviewRequest.id,
        fields,
        fieldLabels,
        reason: reason.trim(),
        status: reviewRequest.status,
      },
    });
  },
);

// ============== GET PROFILE CHANGE REQUESTS ==============
//
// Lists this vendor's change requests, most recent first. Used by the vendor
// portal to surface the "Recent Requests" panel + `hasPending` gating.

export const getProfileChangeRequests = asyncWrapper(
  async (req: Request, res: Response) => {
    const vendor = await getVendorForUser(req.user!.id);

    const requests = await prisma.vendorProfileReviewRequest.findMany({
      where: { vendorId: vendor.id },
      orderBy: { createdAt: "desc" },
      take: 20,
    });

    const formatted = requests.map((r) => ({
      id: r.id,
      fields: r.fields,
      fieldLabels: (r.fields as string[]).map(
        (f) => VENDOR_EDITABLE_FIELDS[f] || f,
      ),
      message: r.message,
      status: r.status,
      adminNote: r.adminNote,
      isResolved: r.isResolved,
      createdAt: r.createdAt,
      reviewedAt: r.reviewedAt,
      resolvedAt: r.resolvedAt,
    }));

    res.json({
      success: true,
      data: {
        requests: formatted,
        hasPending: formatted.some((r) => r.status === "PENDING"),
        // Currently active (admin-approved, vendor hasn't resubmitted yet) request.
        // This is what gates per-field edit permissions on the frontend.
        activeApproved: formatted.find(
          (r) => r.status === "APPROVED" && !r.isResolved,
        ),
      },
    });
  },
);

// ============== GET TEAM MEMBERS ==============

export const getTeamMembers = asyncWrapper(
  async (req: Request, res: Response) => {
    const vendor = await getVendorForUser(req.user!.id);

    const invitations = await prisma.vendorInvitationLog.findMany({
      where: { vendorId: vendor.id },
      orderBy: { createdAt: "desc" },
    });

    res.json({
      success: true,
      data: {
        members: invitations.map((inv) => ({
          id: inv.id,
          email: inv.email,
          companyName: inv.companyName,
          action: inv.action,
          createdAt: inv.createdAt,
        })),
        totalMembers: invitations.length,
        availableRoles: TEAM_ROLES,
      },
    });
  },
);

// ============== GET AVAILABLE ROLES ==============

export const getAvailableRoles = asyncWrapper(
  async (req: Request, res: Response) => {
    res.json({
      success: true,
      data: { roles: TEAM_ROLES },
    });
  },
);
