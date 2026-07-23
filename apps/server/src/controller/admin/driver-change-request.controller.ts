// ============================================
// apps/server/src/controller/admin/driver-change-request.controller.ts
// Admin handlers for vendor-initiated driver edit requests
// Mirrors partner-change-request-controller.ts pattern
// ============================================

import { Request, Response } from "express";
import { prisma } from "../../lib/prisma";
import { asyncWrapper } from "../../utils/asyncWrapper";
import { NotFoundError, BadRequestError } from "../../utils/AppError";

// Field label map. Keys here are the field codes vendor sends in change-request
// payloads — text fields (firstName/lastName/phone) and document type codes
// (PROFILE_PHOTO, IQAMA_NATIONAL_ID, DRIVING_LICENSE).
const DRIVER_FIELD_LABELS: Record<string, string> = {
  firstName: "First Name",
  lastName: "Last Name",
  phone: "Phone Number",
  nationalId: "National ID / Iqama",
  licenseNumber: "Driving Licence Number",
  PROFILE_PHOTO: "Profile Photo",
  IQAMA_NATIONAL_ID: "Iqama / National ID",
  DRIVING_LICENSE: "Driving License",
};

// ============== GET PENDING CHANGE REQUESTS ==============
// Lists vendor-initiated change requests waiting for admin approval

export const getPendingDriverChangeRequests = asyncWrapper(
  async (req: Request, res: Response) => {
    const requests = await prisma.driverReviewRequest.findMany({
      where: {
        status: "PENDING",
        requestType: "VENDOR_INITIATED",
      },
      include: {
        driver: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            phone: true,
            photoUrl: true,
            vendor: {
              select: { id: true, companyName: true, userId: true },
            },
          },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    const formatted = requests.map((r) => ({
      id: r.id,
      driverId: r.driverId,
      fields: r.fields,
      fieldLabels: r.fields.map((f) => DRIVER_FIELD_LABELS[f] || f),
      reason: r.message,
      status: r.status,
      adminNote: r.adminNote,
      createdAt: r.createdAt,
      driver: {
        id: r.driver.id,
        name: `${r.driver.firstName} ${r.driver.lastName}`,
        phone: r.driver.phone,
        photoUrl: r.driver.photoUrl,
      },
      vendor: r.driver.vendor,
    }));

    res.json({
      success: true,
      data: { requests: formatted, total: formatted.length },
    });
  },
);

// ============== APPROVE CHANGE REQUEST ==============
// Approving lets vendor edit ONLY the requested fields
// Creates a review-comment per requested field so vendor knows what they can edit
// Saves snapshot of current driver state for diff display

export const approveDriverChangeRequest = asyncWrapper(
  async (req: Request, res: Response) => {
    const { id } = req.params;
    const { adminNote } = req.body;

    const request = await prisma.driverReviewRequest.findUnique({
      where: { id },
      include: {
        driver: { include: { vendor: true } },
      },
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

    // 1. Snapshot the driver's current state (so admin can see diff later).
    // Includes all scalar fields the vendor might edit — firstName /
    // lastName / phone / nationalId / licenseNumber — so the vendor's
    // "Addressed" pill lights up correctly once each field is corrected.
    const snapshot = {
      photoUrl: request.driver.photoUrl,
      firstName: request.driver.firstName,
      lastName: request.driver.lastName,
      phone: request.driver.phone,
      nationalId: request.driver.nationalId,
      licenseNumber: request.driver.licenseNumber,
    };

    // 2. Approve the change request, save snapshot, set driver to CHANGES_REQUESTED
    await prisma.$transaction([
      prisma.driverReviewRequest.update({
        where: { id },
        data: {
          status: "APPROVED",
          adminNote:
            adminNote ||
            "Approved — please update the requested fields and resubmit",
          reviewedBy: req.user!.id,
          reviewedAt: new Date(),
          isResolved: true,
          resolvedAt: new Date(),
        },
      }),
      prisma.driver.update({
        where: { id: request.driverId },
        data: {
          status: "CHANGES_REQUESTED",
          editSnapshot: snapshot as any,
        },
      }),
      // Create field-level review comments so vendor sees which fields are editable
      prisma.driverReviewComment.createMany({
        data: fields.map((field) => ({
          driverId: request.driverId,
          fieldName: field,
          comment: `Change requested by vendor: ${DRIVER_FIELD_LABELS[field] || field}. Reason: ${request.message}`,
          createdBy: req.user!.id,
        })),
      }),
    ]);

    // 3. Notify the vendor
    await prisma.notification.create({
      data: {
        userId: request.driver.vendor.userId,
        title: "Driver Change Request Approved",
        message: `Your request to edit driver ${request.driver.firstName} ${request.driver.lastName} has been approved. You can now update: ${fields.map((f) => DRIVER_FIELD_LABELS[f] || f).join(", ")}.`,
        type: "DRIVER_CHANGE_REQUEST_APPROVED",
        data: { driverId: request.driverId, fields, changeRequestId: id },
      },
    });

    res.json({
      success: true,
      message: `Change request approved for ${request.driver.firstName} ${request.driver.lastName}`,
    });
  },
);

// ============== REJECT CHANGE REQUEST ==============

export const rejectDriverChangeRequest = asyncWrapper(
  async (req: Request, res: Response) => {
    const { id } = req.params;
    const { adminNote } = req.body;

    if (!adminNote?.trim()) {
      throw new BadRequestError("Please provide a reason for rejection");
    }

    const request = await prisma.driverReviewRequest.findUnique({
      where: { id },
      include: { driver: { include: { vendor: true } } },
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

    await prisma.driverReviewRequest.update({
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

    // Notify vendor
    await prisma.notification.create({
      data: {
        userId: request.driver.vendor.userId,
        title: "Driver Change Request Rejected",
        message: `Your request to edit driver ${request.driver.firstName} ${request.driver.lastName} was declined. Reason: ${adminNote.trim()}`,
        type: "DRIVER_CHANGE_REQUEST_REJECTED",
        data: { driverId: request.driverId, changeRequestId: id },
      },
    });

    res.json({
      success: true,
      message: `Change request rejected for ${request.driver.firstName} ${request.driver.lastName}`,
    });
  },
);
