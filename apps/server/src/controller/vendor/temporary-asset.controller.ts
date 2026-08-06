// ============================================
// !!! DESTINATION PATH: apps/server/src/controller/vendor/temporary-asset.controller.ts
// ============================================
// Vendor Portal — Temporary (ad-hoc) vehicles & drivers.
//
// A vendor registers a one-off vehicle/driver to cover a booking they
// can't serve from their approved fleet. Each starts PENDING_APPROVAL;
// admin reviews the photos and approves (-> ACTIVE) before it can be
// assigned. Photos are uploaded to GCS by the frontend first (signed
// upload URL flow); we store the object paths and sign them on read.
// The driver photo must already have passed the shirt-and-tie Vision
// check (POST /vendor/drivers/verify-photo) — photoVerified must be true.

import { Request, Response } from "express";
import { prisma } from "../../lib/prisma";
import { getReadUrl } from "../../lib/gcs";
import { asyncWrapper } from "../../utils/asyncWrapper";
import { NotFoundError, BadRequestError } from "../../utils/AppError";
import { requireApprovedAndDocsValid } from "./_shared";
import catalogData from "../../data/vehicle-catalog.json";
import type {
  VehicleClass,
  TemporaryAssetStatus,
} from "../../../generated/prisma/client";

async function getVendorForUser(userId: string) {
  const vendor = await prisma.vendor.findUnique({
    where: { userId },
    select: { id: true, status: true, companyName: true },
  });
  if (!vendor) throw new NotFoundError("Vendor profile");
  return vendor;
}

const VALID_VEHICLE_CLASSES = new Set([
  "ECONOMY_SEDAN",
  "BUSINESS_SEDAN",
  "BUSINESS_SUV",
  "FIRST_CLASS",
  "ELECTRIC",
  "ULTRA_LUXURY",
  "HIACE",
  "COASTER",
  "KING_LONG",
]);

// The model must exist in the curated catalog for the given class. The
// frontend stores the combined "Make Model" string (e.g. "Audi A6"), while
// the catalog holds make and model separately — so match either form.
function isValidCatalogModel(model: string, vehicleClass: string): boolean {
  const makes = (
    catalogData as {
      makes: Array<{
        make: string;
        models: Array<{ model: string; classes: string[] }>;
      }>;
    }
  ).makes;
  for (const make of makes) {
    for (const m of make.models) {
      const combined = `${make.make} ${m.model}`;
      if (
        (m.model === model || combined === model) &&
        m.classes.includes(vehicleClass)
      )
        return true;
    }
  }
  return false;
}

async function notifyAdminsOfPendingAsset(opts: {
  kind: "vehicle" | "driver";
  vendorCompanyName: string;
  vendorId: string;
  assetId: string;
  label: string;
}) {
  const admins = await prisma.user.findMany({
    where: { role: "ADMIN", isActive: true },
    select: { id: true },
  });
  if (admins.length === 0) return;
  await prisma.notification.createMany({
    data: admins.map((a) => ({
      userId: a.id,
      title: `Temporary ${opts.kind} awaiting approval`,
      message: `${opts.vendorCompanyName} added a temporary ${opts.kind}: ${opts.label}. Review and approve.`,
      type: "TEMPORARY_ASSET_PENDING",
      data: {
        kind: opts.kind,
        assetId: opts.assetId,
        vendorId: opts.vendorId,
      },
    })),
  });
}

// ============== CREATE TEMPORARY VEHICLE ==============

/**
 * POST /api/v1/vendor/temporary-assets/vehicles
 * Body: { model, vehicleClass, frontPhotoUrl, backPhotoUrl, singleUse? }
 */
export const createTemporaryVehicle = asyncWrapper(
  async (req: Request, res: Response) => {
    const vendor = await getVendorForUser(req.user!.id);
    await requireApprovedAndDocsValid(vendor);

    const {
      model,
      vehicleClass,
      frontPhotoUrl,
      backPhotoUrl,
      singleUse,
      manualEntry,
    } = req.body ?? {};

    if (!model || typeof model !== "string") {
      throw new BadRequestError("Vehicle model is required.");
    }
    if (!vehicleClass || !VALID_VEHICLE_CLASSES.has(String(vehicleClass))) {
      throw new BadRequestError("A valid vehicle class is required.");
    }
    // Catalog check only applies to catalog-picked models. A manual
    // ("Other / Not listed") entry is a free-text make/model the vendor
    // typed, which admin reviews on approval, so it bypasses the catalog.
    if (!manualEntry && !isValidCatalogModel(model, String(vehicleClass))) {
      throw new BadRequestError(
        `"${model}" is not a recognised ${vehicleClass} model in the catalog.`,
      );
    }
    if (!frontPhotoUrl || !backPhotoUrl) {
      throw new BadRequestError(
        "Both front and back photos of the vehicle are required.",
      );
    }

    const created = await prisma.temporaryVehicle.create({
      data: {
        vendorId: vendor.id,
        model: String(model),
        vehicleClass: String(vehicleClass) as VehicleClass,
        frontPhotoUrl: String(frontPhotoUrl),
        backPhotoUrl: String(backPhotoUrl),
        singleUse: Boolean(singleUse),
        status: "PENDING_APPROVAL",
      },
    });

    await notifyAdminsOfPendingAsset({
      kind: "vehicle",
      vendorCompanyName: vendor.companyName,
      vendorId: vendor.id,
      assetId: created.id,
      label: `${created.model} (${created.vehicleClass})`,
    });

    await prisma.auditLog.create({
      data: {
        userId: req.user!.id,
        action: "VENDOR_CREATED_TEMPORARY_VEHICLE",
        entity: "TemporaryVehicle",
        entityId: created.id,
        changes: { model: created.model, vehicleClass: created.vehicleClass },
      },
    });

    res.status(201).json({
      success: true,
      message: "Temporary vehicle submitted for approval.",
      data: { id: created.id, status: created.status },
    });
  },
);

// ============== CREATE TEMPORARY DRIVER ==============

/**
 * POST /api/v1/vendor/temporary-assets/drivers
 * Body: { name, mobile, photoUrl, photoVerified }
 * photoVerified must be true — the photo must have passed the
 * shirt-and-tie check at /vendor/drivers/verify-photo first.
 */
export const createTemporaryDriver = asyncWrapper(
  async (req: Request, res: Response) => {
    const vendor = await getVendorForUser(req.user!.id);
    await requireApprovedAndDocsValid(vendor);

    const { name, mobile, photoUrl } = req.body ?? {};

    if (!name || !String(name).trim()) {
      throw new BadRequestError("Driver name is required.");
    }
    if (!mobile || !String(mobile).trim()) {
      throw new BadRequestError("Driver mobile number is required.");
    }
    if (!photoUrl) {
      throw new BadRequestError("A driver photo is required.");
    }

    const created = await prisma.temporaryDriver.create({
      data: {
        vendorId: vendor.id,
        name: String(name).trim(),
        mobile: String(mobile).trim(),
        photoUrl: String(photoUrl),
        photoVerified: true,
        status: "PENDING_APPROVAL",
      },
    });

    await notifyAdminsOfPendingAsset({
      kind: "driver",
      vendorCompanyName: vendor.companyName,
      vendorId: vendor.id,
      assetId: created.id,
      label: created.name,
    });

    await prisma.auditLog.create({
      data: {
        userId: req.user!.id,
        action: "VENDOR_CREATED_TEMPORARY_DRIVER",
        entity: "TemporaryDriver",
        entityId: created.id,
        changes: { name: created.name, mobile: created.mobile },
      },
    });

    res.status(201).json({
      success: true,
      message: "Temporary driver submitted for approval.",
      data: { id: created.id, status: created.status },
    });
  },
);

// ============== LIST ==============

/**
 * GET /api/v1/vendor/temporary-assets/vehicles?status=ACTIVE
 * Optional status filter (PENDING_APPROVAL | ACTIVE | ARCHIVED | REJECTED).
 */
export const listTemporaryVehicles = asyncWrapper(
  async (req: Request, res: Response) => {
    const vendor = await getVendorForUser(req.user!.id);
    const status = req.query.status ? String(req.query.status) : undefined;

    const rows = await prisma.temporaryVehicle.findMany({
      where: {
        vendorId: vendor.id,
        ...(status ? { status: status as TemporaryAssetStatus } : {}),
      },
      orderBy: { createdAt: "desc" },
    });

    const data = await Promise.all(
      rows.map(async (r) => ({
        id: r.id,
        model: r.model,
        vehicleClass: r.vehicleClass,
        status: r.status,
        singleUse: r.singleUse,
        rejectionReason: r.rejectionReason,
        completedBookingCount: r.completedBookingCount,
        frontPhotoUrl: await getReadUrl(r.frontPhotoUrl),
        backPhotoUrl: await getReadUrl(r.backPhotoUrl),
        createdAt: r.createdAt,
        archivedAt: r.archivedAt,
      })),
    );

    res.json({ success: true, data });
  },
);

/**
 * GET /api/v1/vendor/temporary-assets/drivers?status=ACTIVE
 */
export const listTemporaryDrivers = asyncWrapper(
  async (req: Request, res: Response) => {
    const vendor = await getVendorForUser(req.user!.id);
    const status = req.query.status ? String(req.query.status) : undefined;

    const rows = await prisma.temporaryDriver.findMany({
      where: {
        vendorId: vendor.id,
        ...(status ? { status: status as TemporaryAssetStatus } : {}),
      },
      orderBy: { createdAt: "desc" },
    });

    const data = await Promise.all(
      rows.map(async (r) => ({
        id: r.id,
        name: r.name,
        mobile: r.mobile,
        status: r.status,
        singleUse: r.singleUse,
        photoVerified: r.photoVerified,
        rejectionReason: r.rejectionReason,
        completedBookingCount: r.completedBookingCount,
        photoUrl: await getReadUrl(r.photoUrl),
        createdAt: r.createdAt,
        archivedAt: r.archivedAt,
      })),
    );

    res.json({ success: true, data });
  },
);

// ============== REACTIVATE (single-use) ==============

/**
 * POST /api/v1/vendor/temporary-assets/reactivate
 * Body: { type: "vehicle" | "driver", id }
 *
 * Return a previously-approved, now-ARCHIVED temporary asset to ACTIVE
 * so it can cover one more eleventh-hour job. Only archived assets that
 * were approved before (they have an approvedAt) are eligible — a
 * REJECTED asset cannot be reactivated.
 */
export const reactivateTemporaryAsset = asyncWrapper(
  async (req: Request, res: Response) => {
    const vendor = await getVendorForUser(req.user!.id);
    await requireApprovedAndDocsValid(vendor);

    const { type, id } = req.body ?? {};
    if (type !== "vehicle" && type !== "driver") {
      throw new BadRequestError('type must be "vehicle" or "driver".');
    }
    if (!id) throw new BadRequestError("Asset id is required.");

    if (type === "vehicle") {
      const asset = await prisma.temporaryVehicle.findFirst({
        where: { id: String(id), vendorId: vendor.id },
        select: { id: true, status: true, approvedAt: true },
      });
      if (!asset) throw new NotFoundError("Temporary vehicle");
      if (asset.status !== "ARCHIVED" || !asset.approvedAt) {
        throw new BadRequestError(
          "Only a previously-approved, archived temporary vehicle can be reactivated.",
        );
      }
      await prisma.temporaryVehicle.update({
        where: { id: asset.id },
        data: { status: "ACTIVE", archivedAt: null },
      });
    } else {
      const asset = await prisma.temporaryDriver.findFirst({
        where: { id: String(id), vendorId: vendor.id },
        select: { id: true, status: true, approvedAt: true },
      });
      if (!asset) throw new NotFoundError("Temporary driver");
      if (asset.status !== "ARCHIVED" || !asset.approvedAt) {
        throw new BadRequestError(
          "Only a previously-approved, archived temporary driver can be reactivated.",
        );
      }
      await prisma.temporaryDriver.update({
        where: { id: asset.id },
        data: { status: "ACTIVE", archivedAt: null },
      });
    }

    res.json({
      success: true,
      message: "Temporary asset reactivated.",
      data: { id: String(id), type, status: "ACTIVE" },
    });
  },
);
