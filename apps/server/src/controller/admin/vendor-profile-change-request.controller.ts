// ============================================
// apps/server/src/controller/admin/vendor-profile-change-request.controller.ts
// Admin handlers for vendor-initiated profile edit requests
// Mirrors driver-change-request.controller.ts pattern
// ============================================

import { Request, Response } from "express";
import { prisma } from "../../lib/prisma";
import { asyncWrapper } from "../../utils/asyncWrapper";
import { NotFoundError, BadRequestError } from "../../utils/AppError";

// Mirror of VENDOR_EDITABLE_FIELDS in the vendor profile controller — kept here
// to avoid a cross-controller import. If you add/remove fields there, update
// this map too.
const VENDOR_FIELD_LABELS: Record<string, string> = {
  companyName: "Company Name",
  crNumber: "CR Number",
  vatNumber: "VAT Number",
  chamberOfCommerceNumber: "Chamber of Commerce Number",
  baladyNumber: "Balady Number",
  nationalAddress: "National Address",
  contactPerson: "Contact Person",
  contactPhone: "Contact Phone",
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

// ============== LIST PENDING CHANGE REQUESTS ==============
// All vendor-initiated profile change requests awaiting admin review

export const getPendingVendorProfileChangeRequests = asyncWrapper(
  async (_req: Request, res: Response) => {
    const requests = await prisma.vendorProfileReviewRequest.findMany({
      where: {
        status: "PENDING",
        requestType: "VENDOR_INITIATED",
      },
      include: {
        vendor: {
          select: {
            id: true,
            companyName: true,
            userId: true,
            logoUrl: true,
            contactPerson: true,
            contactPhone: true,
          },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    const formatted = requests.map((r) => ({
      id: r.id,
      vendorId: r.vendorId,
      fields: r.fields,
      fieldLabels: (r.fields as string[]).map(
        (f) => VENDOR_FIELD_LABELS[f] || f,
      ),
      reason: r.message,
      status: r.status,
      adminNote: r.adminNote,
      createdAt: r.createdAt,
      vendor: r.vendor,
    }));

    res.json({
      success: true,
      data: { requests: formatted, total: formatted.length },
    });
  },
);

// ============== APPROVE CHANGE REQUEST ==============
// Approving unlocks the requested fields for editing AND flips the vendor's
// status from APPROVED → CHANGES_REQUESTED so the existing upload/update
// endpoints accept changes. Vendor then makes the edits, calls
// submitProfileForReview to flip back to PENDING_REVIEW, admin re-approves.

export const approveVendorProfileChangeRequest = asyncWrapper(
  async (req: Request, res: Response) => {
    const { id } = req.params;
    const { adminNote } = req.body;

    const request = await prisma.vendorProfileReviewRequest.findUnique({
      where: { id },
      include: { vendor: true },
    });

    if (!request) throw new NotFoundError("Change request");
    if (request.requestType !== "VENDOR_INITIATED") {
      throw new BadRequestError(
        "Only vendor-initiated change requests can be approved/rejected here",
      );
    }
    if (request.status !== "PENDING") {
      throw new BadRequestError("This request has already been processed");
    }

    const fields = request.fields as string[];

    // Snapshot the vendor's current state so admin can compare on the next
    // review cycle. Stored on Vendor.profileSnapshot.
    const snapshot = {
      companyName: request.vendor.companyName,
      crNumber: request.vendor.crNumber,
      vatNumber: request.vendor.vatNumber,
      chamberOfCommerceNumber: (request.vendor as any).chamberOfCommerceNumber,
      baladyNumber: (request.vendor as any).baladyNumber,
      nationalAddress: (request.vendor as any).nationalAddress,
      contactPerson: request.vendor.contactPerson,
      contactPhone: request.vendor.contactPhone,
      address: request.vendor.address,
      bankName: request.vendor.bankName,
      bankAccountNumber: (request.vendor as any).bankAccountNumber,
      bankIban: request.vendor.bankIban,
      mouFileUrl: request.vendor.mouFileUrl,
      mouExpiryDate: request.vendor.mouExpiryDate,
      logoUrl: (request.vendor as any).logoUrl,
    };

    const fieldLabels: Record<string, string> = {
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
      CHAMBER_OF_COMMERCE: "Chamber of Commerce Doc",
      BALADY: "Balady License",
      NATIONAL_ADDRESS: "National Address Doc",
      IBAN_LETTER: "IBAN Letter",
      mou: "MOU Document",
      mouExpiry: "MOU Expiry Date",
    };

    await prisma.$transaction([
      // Mark the request approved. We DON'T set isResolved=true here — that
      // happens when vendor resubmits the profile (closing the edit window).
      prisma.vendorProfileReviewRequest.update({
        where: { id },
        data: {
          status: "APPROVED",
          adminNote:
            adminNote ||
            "Approved — please update the requested fields and resubmit",
          reviewedBy: req.user!.id,
          reviewedAt: new Date(),
        },
      }),
      // Flip vendor → CHANGES_REQUESTED so the existing gating on upload/update
      // endpoints lets the vendor through.
      prisma.vendor.update({
        where: { id: request.vendorId },
        data: {
          status: "CHANGES_REQUESTED",
          profileSnapshot: snapshot as any,
        },
      }),
      // Create a per-field VendorReviewComment for each granted field so the
      // admin review UI flags them ("changes requested" state) — mirrors
      // partner-change-request-controller.ts. Now that VendorReviewComment
      // has a `type` column, we use the explicit VENDOR_REQUEST enum. The
      // prefix used to be the discriminator; frontend transitioned to the
      // type field, so the comment text is now just the label + reason.
      prisma.vendorReviewComment.createMany({
        data: fields.map((field) => ({
          vendorId: request.vendorId,
          fieldName: field,
          comment: `${fieldLabels[field] || field}${
            request.message ? `: ${request.message}` : ""
          }`,
          type: "VENDOR_REQUEST" as const,
          createdBy: req.user!.id,
        })),
      }),
    ]);

    // Notify the vendor
    await prisma.notification.create({
      data: {
        userId: request.vendor.userId,
        title: "Profile Change Request Approved",
        message: `Your request to edit your profile has been approved. You can now update: ${fields.map((f) => VENDOR_FIELD_LABELS[f] || f).join(", ")}. Submit for review when done.`,
        type: "VENDOR_PROFILE_CHANGE_REQUEST_APPROVED",
        data: { vendorId: request.vendorId, fields, changeRequestId: id },
      },
    });

    res.json({
      success: true,
      message: `Change request approved for ${request.vendor.companyName}`,
    });
  },
);

// ============== REJECT CHANGE REQUEST ==============

export const rejectVendorProfileChangeRequest = asyncWrapper(
  async (req: Request, res: Response) => {
    const { id } = req.params;
    const { adminNote } = req.body;

    if (!adminNote?.trim()) {
      throw new BadRequestError("Please provide a reason for rejection");
    }

    const request = await prisma.vendorProfileReviewRequest.findUnique({
      where: { id },
      include: { vendor: true },
    });

    if (!request) throw new NotFoundError("Change request");
    if (request.requestType !== "VENDOR_INITIATED") {
      throw new BadRequestError(
        "Only vendor-initiated change requests can be approved/rejected here",
      );
    }
    if (request.status !== "PENDING") {
      throw new BadRequestError("This request has already been processed");
    }

    await prisma.vendorProfileReviewRequest.update({
      where: { id },
      data: {
        status: "REJECTED",
        adminNote: adminNote.trim(),
        reviewedBy: req.user!.id,
        reviewedAt: new Date(),
        isResolved: true,
        resolvedAt: new Date(),
      },
    });

    // Notify the vendor
    await prisma.notification.create({
      data: {
        userId: request.vendor.userId,
        title: "Profile Change Request Rejected",
        message: `Your profile change request was rejected. Reason: ${adminNote.trim()}`,
        type: "VENDOR_PROFILE_CHANGE_REQUEST_REJECTED",
        data: { vendorId: request.vendorId, changeRequestId: id },
      },
    });

    res.json({
      success: true,
      message: `Change request rejected for ${request.vendor.companyName}`,
    });
  },
);
