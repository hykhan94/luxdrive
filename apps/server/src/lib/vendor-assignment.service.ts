// ============================================
// !!! DESTINATION PATH: apps/server/src/lib/vendor-assignment.service.ts
// ============================================
// Shared vendor driver+vehicle assignment logic. One rule set for the
// paths that assign a vendor's PERMANENT (fleet) driver/vehicle to a
// booking:
//   - acceptBooking  (offer accept: OFFERED -> CONFIRMED)
//   - reassignBooking (swap on a CONFIRMED booking; may mix with temp)
//
// The validators are granular (driver / vehicle separately) so the
// reassign path can pair a permanent asset with a temporary one — e.g.
// a permanent driver plus a temporary vehicle when the partner changed
// the class to one the vendor can't meet from its approved fleet. The
// temporary-asset validators live in temporary-asset.service.ts and
// deliberately skip the fleet-APPROVED + document-expiry checks below.

import { prisma } from "./prisma";
import { BadRequestError } from "../utils/AppError";
import type { VehicleClass } from "../../generated/prisma/client";

export interface ValidatedDriver {
  id: string;
  firstName: string;
  lastName: string;
  phone: string;
}
export interface ValidatedVehicle {
  id: string;
  make: string;
  model: string;
  plateNumber: string;
}
export interface ValidatedAssignment {
  driver: ValidatedDriver;
  vehicle: ValidatedVehicle;
}

// Validate a permanent driver for this vendor + trip: belongs to the
// vendor, active, APPROVED, and no required document expiring on or
// before the trip date.
export async function validatePermanentDriver(params: {
  vendorId: string;
  tripDate: Date;
  driverId: string;
}): Promise<ValidatedDriver> {
  const { vendorId, tripDate, driverId } = params;

  const driver = await prisma.driver.findFirst({
    where: { id: driverId, vendorId, isActive: true, status: "APPROVED" },
    select: { id: true, firstName: true, lastName: true, phone: true },
  });
  if (!driver) {
    throw new BadRequestError("Invalid or inactive driver selected");
  }

  const expiring = await prisma.driverDocument.findMany({
    where: { driverId, expiryDate: { lte: tripDate } },
    select: { type: true, expiryDate: true },
  });
  if (expiring.length > 0) {
    throw new BadRequestError(
      `Cannot assign this driver. The following document(s) expire on or before the trip date: ${formatDocList(
        expiring,
      )}. Please renew them first.`,
    );
  }

  return driver;
}

// Validate a permanent vehicle for this vendor + trip: belongs to the
// vendor, active, APPROVED, class matches, and no required document
// expiring on or before the trip date.
export async function validatePermanentVehicle(params: {
  vendorId: string;
  vehicleClass: VehicleClass;
  tripDate: Date;
  vehicleId: string;
}): Promise<ValidatedVehicle> {
  const { vendorId, vehicleClass, tripDate, vehicleId } = params;

  const vehicle = await prisma.vehicle.findFirst({
    where: {
      id: vehicleId,
      vendorId,
      isActive: true,
      status: "APPROVED",
      category: vehicleClass,
    },
    select: { id: true, make: true, model: true, plateNumber: true },
  });
  if (!vehicle) {
    throw new BadRequestError(
      `Invalid vehicle selected. Must be an active, approved ${vehicleClass} vehicle.`,
    );
  }

  const expiring = await prisma.vehicleDocument.findMany({
    where: { vehicleId, expiryDate: { lte: tripDate } },
    select: { type: true, expiryDate: true },
  });
  if (expiring.length > 0) {
    throw new BadRequestError(
      `Cannot assign this vehicle. The following document(s) expire on or before the trip date: ${formatDocList(
        expiring,
      )}. Please renew them first.`,
    );
  }

  return vehicle;
}

function formatDocList(
  docs: Array<{ type: string; expiryDate: Date | null }>,
): string {
  return docs
    .map((d) => `${d.type} (expires ${d.expiryDate!.toISOString().split("T")[0]})`)
    .join(", ");
}

// Convenience wrapper: validate a permanent driver + vehicle together.
// Used by acceptBooking, where both are always permanent.
export async function validateVendorAssignment(params: {
  vendorId: string;
  vehicleClass: VehicleClass;
  tripDate: Date;
  driverId: string;
  vehicleId: string;
}): Promise<ValidatedAssignment> {
  const driver = await validatePermanentDriver({
    vendorId: params.vendorId,
    tripDate: params.tripDate,
    driverId: params.driverId,
  });
  const vehicle = await validatePermanentVehicle({
    vendorId: params.vendorId,
    vehicleClass: params.vehicleClass,
    tripDate: params.tripDate,
    vehicleId: params.vehicleId,
  });
  return { driver, vehicle };
}

// Assign (or re-assign) a permanent driver + vehicle to a booking the
// vendor already holds. Clears any prior temporary assignment.
export async function applyVendorAssignment(params: {
  bookingId: string;
  driverId: string;
  vehicleId: string;
}) {
  return prisma.booking.update({
    where: { id: params.bookingId },
    data: {
      driverId: params.driverId,
      vehicleId: params.vehicleId,
      temporaryDriverId: null,
      temporaryVehicleId: null,
    },
  });
}

// Resolve the latest still-PENDING modification on a booking to a final
// vendor decision. Single writer of that decision — called wherever a
// vendor signs off on (or declines) a change.
export async function resolveLatestModificationDecision(params: {
  bookingId: string;
  decision: "ACCEPTED" | "REJECTED";
  reason?: string;
}): Promise<void> {
  const latest = await prisma.bookingModification.findFirst({
    where: { bookingId: params.bookingId, vendorDecision: "PENDING" },
    orderBy: { createdAt: "desc" },
    select: { id: true },
  });
  if (!latest) return;

  await prisma.bookingModification.update({
    where: { id: latest.id },
    data: {
      vendorDecision: params.decision,
      vendorDecisionReason: params.reason ?? null,
      vendorDecidedAt: new Date(),
    },
  });
}
