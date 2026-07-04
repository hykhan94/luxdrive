import { Request, Response } from "express";
import { prisma } from "../../lib/prisma";
import { asyncWrapper } from "../../utils/asyncWrapper";
import { NotFoundError, BadRequestError } from "../../utils/AppError";
import { createPartnerNotification } from "../partner/notification.controller";

// ============== GET PENDING CHANGE REQUESTS ==============

export const getPendingChangeRequests = asyncWrapper(
  async (req: Request, res: Response) => {
    const requests = await prisma.partnerChangeRequest.findMany({
      where: { status: "PENDING" },
      include: {
        partner: {
          select: { id: true, companyName: true, userId: true },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    res.json({
      success: true,
      data: { requests, total: requests.length },
    });
  },
);

// ============== APPROVE CHANGE REQUEST ==============

export const approveChangeRequest = asyncWrapper(
  async (req: Request, res: Response) => {
    const { id } = req.params;
    const { adminNote } = req.body;

    const request = await prisma.partnerChangeRequest.findUnique({
      where: { id },
      include: {
        partner: {
          select: { id: true, companyName: true, userId: true },
        },
      },
    });

    if (!request) throw new NotFoundError("Change request");
    if (request.status !== "PENDING") {
      throw new BadRequestError("This request has already been processed");
    }

    // 1. Approve the change request
    await prisma.partnerChangeRequest.update({
      where: { id },
      data: {
        status: "APPROVED",
        adminNote: adminNote || "Approved — please update the requested fields",
        reviewedBy: req.user!.id,
        reviewedAt: new Date(),
      },
    });

    // 2. Set partner status to CHANGES_REQUESTED
    await prisma.partner.update({
      where: { id: request.partnerId },
      data: { status: "CHANGES_REQUESTED" },
    });

    // After updating partner status to CHANGES_REQUESTED, save snapshot
    // Save snapshot of current profile before partner makes edits
    const currentPartner = await prisma.partner.findUnique({
      where: { id: request.partnerId },
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

    await prisma.partner.update({
      where: { id: request.partnerId },
      data: {
        profileSnapshot: currentPartner as any,
      },
    });
    // 3. Create review comments for each requested field so the partner sees which fields are editable
    const fieldLabels: Record<string, string> = {
      companyName: "Company Name",
      crNumber: "CR Number",
      vatNumber: "VAT Number",
      chamberOfCommerceNumber: "Chamber of Commerce",
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

    const fields = request.fields as string[];
    if (fields.length > 0) {
      await prisma.partnerReviewComment.createMany({
        data: fields.map((field) => ({
          partnerId: request.partnerId,
          fieldName: field,
          // The `type` column now carries the "this is a partner request"
          // meaning; the comment text is the partner's reason alone.
          comment: `${fieldLabels[field] || field}: ${request.reason}`,
          type: "PARTNER_REQUEST" as const,
          createdBy: req.user!.id,
        })),
      });
    }
    // 4. Notify the partner
    await createPartnerNotification(request.partner.userId, {
      type: "PROFILE_CHANGES_REQUESTED",
      title: "Change Request Approved",
      message: `Your request to edit profile fields has been approved. Fields: ${(request.fields as string[]).join(", ")}. You can now make changes and resubmit your profile.`,
      data: { changeRequestId: id, fields: request.fields },
    });

    res.json({
      success: true,
      message: `Change request approved for ${request.partner.companyName}`,
    });
  },
);

// ============== REJECT CHANGE REQUEST ==============

export const rejectChangeRequest = asyncWrapper(
  async (req: Request, res: Response) => {
    const { id } = req.params;
    const { adminNote } = req.body;

    if (!adminNote?.trim()) {
      throw new BadRequestError("Please provide a reason for rejection");
    }

    const request = await prisma.partnerChangeRequest.findUnique({
      where: { id },
      include: {
        partner: {
          select: { id: true, companyName: true, userId: true },
        },
      },
    });

    if (!request) throw new NotFoundError("Change request");
    if (request.status !== "PENDING") {
      throw new BadRequestError("This request has already been processed");
    }

    // 1. Reject the change request
    await prisma.partnerChangeRequest.update({
      where: { id },
      data: {
        status: "REJECTED",
        adminNote: adminNote.trim(),
        reviewedBy: req.user!.id,
        reviewedAt: new Date(),
      },
    });

    // 2. Notify the partner
    await createPartnerNotification(request.partner.userId, {
      type: "PROFILE_COMMENT_ADDED",
      title: "Change Request Declined",
      message: `Your request to edit profile fields was declined. Reason: ${adminNote.trim()}`,
      data: { changeRequestId: id },
    });

    res.json({
      success: true,
      message: `Change request rejected for ${request.partner.companyName}`,
    });
  },
);
