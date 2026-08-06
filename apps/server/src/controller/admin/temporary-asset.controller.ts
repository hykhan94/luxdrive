// ============================================
// !!! DESTINATION PATH: apps/server/src/controller/admin/temporary-asset.controller.ts
// ============================================
// Admin Portal — approval queue for vendor-submitted temporary vehicles
// and drivers. Admin reviews the photos and either approves the asset
// (PENDING_APPROVAL -> ACTIVE, assignable) or rejects it with a reason.

import { Request, Response } from "express";
import { prisma } from "../../lib/prisma";
import { getReadUrl } from "../../lib/gcs";
import { asyncWrapper } from "../../utils/asyncWrapper";
import { NotFoundError, BadRequestError } from "../../utils/AppError";
import type { TemporaryAssetStatus } from "../../../generated/prisma/client";

async function notifyVendor(
  vendorUserId: string,
  title: string,
  message: string,
  data: Record<string, string>,
) {
  await prisma.notification.create({
    data: {
      userId: vendorUserId,
      title,
      message,
      type: "TEMPORARY_ASSET_REVIEWED",
      data,
    },
  });
}

// ============== LIST (approval queue) ==============

/**
 * GET /api/v1/admin/temporary-assets?status=PENDING_APPROVAL
 * Returns temp vehicles + drivers (default: pending) with vendor info
 * and signed photo URLs.
 */
export const listTemporaryAssets = asyncWrapper(
  async (req: Request, res: Response) => {
    const status = (
      req.query.status ? String(req.query.status) : "PENDING_APPROVAL"
    ) as TemporaryAssetStatus;

    const [vehicles, drivers] = await Promise.all([
      prisma.temporaryVehicle.findMany({
        where: { status },
        orderBy: { createdAt: "asc" },
        include: { vendor: { select: { id: true, companyName: true } } },
      }),
      prisma.temporaryDriver.findMany({
        where: { status },
        orderBy: { createdAt: "asc" },
        include: { vendor: { select: { id: true, companyName: true } } },
      }),
    ]);

    const vehicleData = await Promise.all(
      vehicles.map(async (v) => ({
        id: v.id,
        vendor: v.vendor,
        model: v.model,
        vehicleClass: v.vehicleClass,
        status: v.status,
        singleUse: v.singleUse,
        completedBookingCount: v.completedBookingCount,
        frontPhotoUrl: await getReadUrl(v.frontPhotoUrl),
        backPhotoUrl: await getReadUrl(v.backPhotoUrl),
        createdAt: v.createdAt,
      })),
    );

    const driverData = await Promise.all(
      drivers.map(async (d) => ({
        id: d.id,
        vendor: d.vendor,
        name: d.name,
        mobile: d.mobile,
        status: d.status,
        singleUse: d.singleUse,
        photoVerified: d.photoVerified,
        completedBookingCount: d.completedBookingCount,
        photoUrl: await getReadUrl(d.photoUrl),
        createdAt: d.createdAt,
      })),
    );

    res.json({
      success: true,
      data: { vehicles: vehicleData, drivers: driverData },
    });
  },
);

// ============== APPROVE / REJECT — VEHICLE ==============

export const approveTemporaryVehicle = asyncWrapper(
  async (req: Request, res: Response) => {
    const { id } = req.params;
    const asset = await prisma.temporaryVehicle.findUnique({
      where: { id },
      include: { vendor: { select: { userId: true } } },
    });
    if (!asset) throw new NotFoundError("Temporary vehicle");
    if (asset.status !== "PENDING_APPROVAL") {
      throw new BadRequestError(
        `Cannot approve a temporary vehicle with status "${asset.status}".`,
      );
    }

    await prisma.temporaryVehicle.update({
      where: { id },
      data: {
        status: "ACTIVE",
        approvedBy: req.user!.id,
        approvedAt: new Date(),
        rejectionReason: null,
      },
    });

    await notifyVendor(
      asset.vendor.userId,
      "Temporary vehicle approved",
      `Your temporary vehicle "${asset.model}" was approved and can now be assigned.`,
      { kind: "vehicle", assetId: id, decision: "APPROVED" },
    );

    await prisma.auditLog.create({
      data: {
        userId: req.user!.id,
        action: "ADMIN_APPROVED_TEMPORARY_VEHICLE",
        entity: "TemporaryVehicle",
        entityId: id,
        changes: { model: asset.model },
      },
    });

    res.json({ success: true, message: "Temporary vehicle approved." });
  },
);

export const rejectTemporaryVehicle = asyncWrapper(
  async (req: Request, res: Response) => {
    const { id } = req.params;
    const { reason } = req.body ?? {};
    if (!reason || !String(reason).trim()) {
      throw new BadRequestError("A rejection reason is required.");
    }

    const asset = await prisma.temporaryVehicle.findUnique({
      where: { id },
      include: { vendor: { select: { userId: true } } },
    });
    if (!asset) throw new NotFoundError("Temporary vehicle");
    if (asset.status !== "PENDING_APPROVAL") {
      throw new BadRequestError(
        `Cannot reject a temporary vehicle with status "${asset.status}".`,
      );
    }

    const cleanReason = String(reason).trim();
    await prisma.temporaryVehicle.update({
      where: { id },
      data: { status: "REJECTED", rejectionReason: cleanReason },
    });

    await notifyVendor(
      asset.vendor.userId,
      "Temporary vehicle rejected",
      `Your temporary vehicle "${asset.model}" was rejected: ${cleanReason}`,
      { kind: "vehicle", assetId: id, decision: "REJECTED" },
    );

    await prisma.auditLog.create({
      data: {
        userId: req.user!.id,
        action: "ADMIN_REJECTED_TEMPORARY_VEHICLE",
        entity: "TemporaryVehicle",
        entityId: id,
        changes: { model: asset.model, reason: cleanReason },
      },
    });

    res.json({ success: true, message: "Temporary vehicle rejected." });
  },
);

// ============== APPROVE / REJECT — DRIVER ==============

export const approveTemporaryDriver = asyncWrapper(
  async (req: Request, res: Response) => {
    const { id } = req.params;
    const asset = await prisma.temporaryDriver.findUnique({
      where: { id },
      include: { vendor: { select: { userId: true } } },
    });
    if (!asset) throw new NotFoundError("Temporary driver");
    if (asset.status !== "PENDING_APPROVAL") {
      throw new BadRequestError(
        `Cannot approve a temporary driver with status "${asset.status}".`,
      );
    }

    await prisma.temporaryDriver.update({
      where: { id },
      data: {
        status: "ACTIVE",
        approvedBy: req.user!.id,
        approvedAt: new Date(),
        rejectionReason: null,
      },
    });

    await notifyVendor(
      asset.vendor.userId,
      "Temporary driver approved",
      `Your temporary driver "${asset.name}" was approved and can now be assigned.`,
      { kind: "driver", assetId: id, decision: "APPROVED" },
    );

    await prisma.auditLog.create({
      data: {
        userId: req.user!.id,
        action: "ADMIN_APPROVED_TEMPORARY_DRIVER",
        entity: "TemporaryDriver",
        entityId: id,
        changes: { name: asset.name },
      },
    });

    res.json({ success: true, message: "Temporary driver approved." });
  },
);

export const rejectTemporaryDriver = asyncWrapper(
  async (req: Request, res: Response) => {
    const { id } = req.params;
    const { reason } = req.body ?? {};
    if (!reason || !String(reason).trim()) {
      throw new BadRequestError("A rejection reason is required.");
    }

    const asset = await prisma.temporaryDriver.findUnique({
      where: { id },
      include: { vendor: { select: { userId: true } } },
    });
    if (!asset) throw new NotFoundError("Temporary driver");
    if (asset.status !== "PENDING_APPROVAL") {
      throw new BadRequestError(
        `Cannot reject a temporary driver with status "${asset.status}".`,
      );
    }

    const cleanReason = String(reason).trim();
    await prisma.temporaryDriver.update({
      where: { id },
      data: { status: "REJECTED", rejectionReason: cleanReason },
    });

    await notifyVendor(
      asset.vendor.userId,
      "Temporary driver rejected",
      `Your temporary driver "${asset.name}" was rejected: ${cleanReason}`,
      { kind: "driver", assetId: id, decision: "REJECTED" },
    );

    await prisma.auditLog.create({
      data: {
        userId: req.user!.id,
        action: "ADMIN_REJECTED_TEMPORARY_DRIVER",
        entity: "TemporaryDriver",
        entityId: id,
        changes: { name: asset.name, reason: cleanReason },
      },
    });

    res.json({ success: true, message: "Temporary driver rejected." });
  },
);
