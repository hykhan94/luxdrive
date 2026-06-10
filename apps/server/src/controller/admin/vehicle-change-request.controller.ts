// ============================================
// apps/server/src/controller/admin/vehicle-change-request.controller.ts
// Admin handlers for vendor-initiated vehicle edit requests
// Mirrors partner-change-request-controller.ts pattern
// ============================================

import { Request, Response } from "express";
import { prisma } from "../../lib/prisma";
import { asyncWrapper } from "../../utils/asyncWrapper";
import { NotFoundError, BadRequestError } from "../../utils/AppError";

const VEHICLE_FIELD_LABELS: Record<string, string> = {
  vehiclePhotos: "Vehicle Photos",
  numberPlates: "Number Plates",
  odometer: "Odometer Reading",
  insurance: "Vehicle Insurance",
  istimara: "Istimara (Registration)",
  make: "Make",
  model: "Model",
  year: "Year",
  plateNumber: "Plate Number",
  color: "Color",
  category: "Category",
  mileage: "Mileage",
};

// ============== GET PENDING CHANGE REQUESTS ==============

export const getPendingVehicleChangeRequests = asyncWrapper(
  async (req: Request, res: Response) => {
    const requests = await prisma.vehicleReviewRequest.findMany({
      where: {
        status: "PENDING",
        requestType: "VENDOR_INITIATED",
      },
      include: {
        vehicle: {
          select: {
            id: true,
            make: true,
            model: true,
            year: true,
            plateNumber: true,
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
      vehicleId: r.vehicleId,
      fields: r.documents, // documents field in schema, but represents fields
      fieldLabels: (r.documents as string[]).map(
        (f) => VEHICLE_FIELD_LABELS[f] || f,
      ),
      reason: r.message,
      status: r.status,
      adminNote: r.adminNote,
      createdAt: r.createdAt,
      vehicle: {
        id: r.vehicle.id,
        name: `${r.vehicle.make} ${r.vehicle.model}`,
        year: r.vehicle.year,
        plateNumber: r.vehicle.plateNumber,
      },
      vendor: r.vehicle.vendor,
    }));

    res.json({
      success: true,
      data: { requests: formatted, total: formatted.length },
    });
  },
);

// ============== APPROVE CHANGE REQUEST ==============

export const approveVehicleChangeRequest = asyncWrapper(
  async (req: Request, res: Response) => {
    const { id } = req.params;
    const { adminNote } = req.body;

    const request = await prisma.vehicleReviewRequest.findUnique({
      where: { id },
      include: {
        vehicle: { include: { vendor: true } },
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

    const fields = request.documents as string[];

    // Snapshot vehicle's current editable state
    const snapshot = {
      make: request.vehicle.make,
      model: request.vehicle.model,
      year: request.vehicle.year,
      plateNumber: request.vehicle.plateNumber,
      color: request.vehicle.color,
      category: request.vehicle.category,
      mileage: request.vehicle.mileage,
    };

    await prisma.$transaction([
      prisma.vehicleReviewRequest.update({
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
      prisma.vehicle.update({
        where: { id: request.vehicleId },
        data: {
          status: "CHANGES_REQUESTED",
          editSnapshot: snapshot as any,
        },
      }),
      prisma.vehicleReviewComment.createMany({
        data: fields.map((field) => ({
          vehicleId: request.vehicleId,
          fieldName: field,
          comment: `Change requested by vendor: ${VEHICLE_FIELD_LABELS[field] || field}. Reason: ${request.message}`,
          createdBy: req.user!.id,
        })),
      }),
    ]);

    await prisma.notification.create({
      data: {
        userId: request.vehicle.vendor.userId,
        title: "Vehicle Change Request Approved",
        message: `Your request to edit ${request.vehicle.make} ${request.vehicle.model} (${request.vehicle.plateNumber}) has been approved. You can now update: ${fields.map((f) => VEHICLE_FIELD_LABELS[f] || f).join(", ")}.`,
        type: "VEHICLE_CHANGE_REQUEST_APPROVED",
        data: { vehicleId: request.vehicleId, fields, changeRequestId: id },
      },
    });

    res.json({
      success: true,
      message: `Change request approved for ${request.vehicle.make} ${request.vehicle.model}`,
    });
  },
);

// ============== REJECT CHANGE REQUEST ==============

export const rejectVehicleChangeRequest = asyncWrapper(
  async (req: Request, res: Response) => {
    const { id } = req.params;
    const { adminNote } = req.body;

    if (!adminNote?.trim()) {
      throw new BadRequestError("Please provide a reason for rejection");
    }

    const request = await prisma.vehicleReviewRequest.findUnique({
      where: { id },
      include: { vehicle: { include: { vendor: true } } },
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

    await prisma.vehicleReviewRequest.update({
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

    await prisma.notification.create({
      data: {
        userId: request.vehicle.vendor.userId,
        title: "Vehicle Change Request Rejected",
        message: `Your request to edit ${request.vehicle.make} ${request.vehicle.model} (${request.vehicle.plateNumber}) was declined. Reason: ${adminNote.trim()}`,
        type: "VEHICLE_CHANGE_REQUEST_REJECTED",
        data: { vehicleId: request.vehicleId, changeRequestId: id },
      },
    });

    res.json({
      success: true,
      message: `Change request rejected for ${request.vehicle.make} ${request.vehicle.model}`,
    });
  },
);
