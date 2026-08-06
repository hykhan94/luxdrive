// ============================================
// !!! DESTINATION PATH: apps/server/src/lib/temporary-asset.service.ts
// ============================================
// Temporary (ad-hoc) vehicle/driver assignment. A vendor supplies a
// one-off vehicle/driver to cover a booking they can't serve from their
// approved fleet (a class change, or an eleventh-hour breakdown). These
// assets require admin approval (PENDING_APPROVAL -> ACTIVE) before they
// can be assigned, and are archived once the booking they served
// completes (with a usage counter bumped).
//
// This module bridges permanent + temporary assets: resolveBookingAssignment
// takes a driver source and a vehicle source (each either a permanent
// fleet id OR a temporary asset id) and returns the exact booking-column
// update plus display labels. It imports the permanent validators from
// vendor-assignment.service (one-directional — no cycle).

import { prisma } from "./prisma";
import { BadRequestError } from "../utils/AppError";
import type { VehicleClass } from "../../generated/prisma/client";
import {
  validatePermanentDriver,
  validatePermanentVehicle,
} from "./vendor-assignment.service";

// ------------------------------------------------------------------
// Temporary-asset validators — ACTIVE (admin-approved), belongs to the
// vendor, and (vehicle) class matches. No fleet-approval or doc-expiry
// checks: a single-use temp asset has no fleet documents.
// ------------------------------------------------------------------
export async function validateTemporaryDriver(params: {
  vendorId: string;
  temporaryDriverId: string;
}): Promise<{ id: string; name: string; mobile: string }> {
  const driver = await prisma.temporaryDriver.findFirst({
    where: {
      id: params.temporaryDriverId,
      vendorId: params.vendorId,
      status: "ACTIVE",
    },
    select: { id: true, name: true, mobile: true },
  });
  if (!driver) {
    throw new BadRequestError(
      "Invalid temporary driver. It must be approved (active) and belong to you.",
    );
  }
  return driver;
}

export async function validateTemporaryVehicle(params: {
  vendorId: string;
  vehicleClass: VehicleClass;
  temporaryVehicleId: string;
}): Promise<{ id: string; model: string }> {
  const vehicle = await prisma.temporaryVehicle.findFirst({
    where: {
      id: params.temporaryVehicleId,
      vendorId: params.vendorId,
      status: "ACTIVE",
    },
    select: { id: true, model: true, vehicleClass: true },
  });
  if (!vehicle) {
    throw new BadRequestError(
      "Invalid temporary vehicle. It must be approved (active) and belong to you.",
    );
  }
  if (vehicle.vehicleClass !== params.vehicleClass) {
    throw new BadRequestError(
      `This temporary vehicle is a ${vehicle.vehicleClass}, but the booking needs a ${params.vehicleClass}.`,
    );
  }
  return { id: vehicle.id, model: vehicle.model };
}

// ------------------------------------------------------------------
// Resolve a driver source + a vehicle source into the booking-column
// update. Each side is EITHER a permanent fleet id OR a temporary id —
// exactly one per side. Returns the update payload (used ids set, the
// unused counterparts nulled) plus display labels.
// ------------------------------------------------------------------
export interface ResolvedAssignment {
  // Only the changed side(s) are present; an omitted side is left
  // untouched so the current driver/vehicle carries over unchanged.
  update: {
    driverId?: string | null;
    vehicleId?: string | null;
    temporaryDriverId?: string | null;
    temporaryVehicleId?: string | null;
  };
  driverLabel: string;
  driverPhone: string | null;
  vehicleLabel: string;
  usedTemporary: boolean;
}

export async function resolveBookingAssignment(params: {
  vendorId: string;
  vehicleClass: VehicleClass;
  tripDate: Date;
  driverId?: string | null;
  vehicleId?: string | null;
  temporaryDriverId?: string | null;
  temporaryVehicleId?: string | null;
}): Promise<ResolvedAssignment> {
  const {
    vendorId,
    vehicleClass,
    tripDate,
    driverId,
    vehicleId,
    temporaryDriverId,
    temporaryVehicleId,
  } = params;

  // Partial reassignment: a side may be omitted to keep the current
  // driver/vehicle. At least one side must change, and a provided side
  // must name exactly one source (fleet OR temporary, not both).
  const driverProvided = Boolean(driverId) || Boolean(temporaryDriverId);
  const vehicleProvided = Boolean(vehicleId) || Boolean(temporaryVehicleId);
  if (!driverProvided && !vehicleProvided) {
    throw new BadRequestError("Select a driver or a vehicle to change.");
  }
  if (driverId && temporaryDriverId) {
    throw new BadRequestError(
      "Select exactly one driver — either a fleet driver or a temporary driver.",
    );
  }
  if (vehicleId && temporaryVehicleId) {
    throw new BadRequestError(
      "Select exactly one vehicle — either a fleet vehicle or a temporary vehicle.",
    );
  }

  // Only provided sides are written; an omitted side is left untouched.
  const update: ResolvedAssignment["update"] = {};
  let driverLabel = "(unchanged)";
  let driverPhone: string | null = null;
  let vehicleLabel = "(unchanged)";
  let usedTemporary = false;

  // Driver side.
  if (driverProvided) {
    if (driverId) {
      const d = await validatePermanentDriver({ vendorId, tripDate, driverId });
      update.driverId = d.id;
      update.temporaryDriverId = null;
      driverLabel = `${d.firstName} ${d.lastName} \u00b7 ${d.phone}`;
      driverPhone = d.phone;
    } else {
      const d = await validateTemporaryDriver({
        vendorId,
        temporaryDriverId: temporaryDriverId!,
      });
      update.temporaryDriverId = d.id;
      update.driverId = null;
      driverLabel = `${d.name} \u00b7 ${d.mobile} (temporary)`;
      driverPhone = d.mobile;
      usedTemporary = true;
    }
  }

  // Vehicle side.
  if (vehicleProvided) {
    if (vehicleId) {
      const v = await validatePermanentVehicle({
        vendorId,
        vehicleClass,
        tripDate,
        vehicleId,
      });
      update.vehicleId = v.id;
      update.temporaryVehicleId = null;
      vehicleLabel = `${v.make} ${v.model} (${v.plateNumber})`;
    } else {
      const v = await validateTemporaryVehicle({
        vendorId,
        vehicleClass,
        temporaryVehicleId: temporaryVehicleId!,
      });
      update.temporaryVehicleId = v.id;
      update.vehicleId = null;
      vehicleLabel = `${v.model} (temporary)`;
      usedTemporary = true;
    }
  }

  return { update, driverLabel, driverPhone, vehicleLabel, usedTemporary };
}

// ------------------------------------------------------------------
// Archive the temporary assets a completed booking used: bump their
// usage counter and mark them ARCHIVED. The vendor can reactivate a
// single-use asset later for another eleventh-hour job.
// ------------------------------------------------------------------
export async function archiveTemporaryAssetsForBooking(params: {
  temporaryVehicleId: string | null;
  temporaryDriverId: string | null;
}): Promise<void> {
  const ops = [];
  if (params.temporaryVehicleId) {
    ops.push(
      prisma.temporaryVehicle.update({
        where: { id: params.temporaryVehicleId },
        data: {
          status: "ARCHIVED",
          archivedAt: new Date(),
          completedBookingCount: { increment: 1 },
        },
      }),
    );
  }
  if (params.temporaryDriverId) {
    ops.push(
      prisma.temporaryDriver.update({
        where: { id: params.temporaryDriverId },
        data: {
          status: "ARCHIVED",
          archivedAt: new Date(),
          completedBookingCount: { increment: 1 },
        },
      }),
    );
  }
  if (ops.length > 0) {
    await prisma.$transaction(ops);
  }
}
