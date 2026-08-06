// ============================================
// !!! DESTINATION PATH: apps/server/src/controller/admin/booking-policy.controller.ts
// ============================================
// Admin Portal — the booking policy singleton: minimum lead times (in
// hours) for partner/vendor changes and cancellations. Backs the
// BookingPolicyConfig row that the modify/cancel flows read.

import { Request, Response } from "express";
import { prisma } from "../../lib/prisma";
import { asyncWrapper } from "../../utils/asyncWrapper";
import { BadRequestError } from "../../utils/AppError";

const FIELDS = [
  "partnerChangeCutoffHours",
  "vendorChangeCutoffHours",
  "partnerCancelCutoffHours",
  "vendorCancelCutoffHours",
] as const;

// Return the singleton, lazily seeding it with the 12h defaults.
async function loadPolicyRow() {
  const existing = await prisma.bookingPolicyConfig.findFirst();
  if (existing) return existing;
  return prisma.bookingPolicyConfig.create({ data: {} });
}

/** GET /api/v1/admin/booking-policy */
export const getBookingPolicy = asyncWrapper(
  async (_req: Request, res: Response) => {
    const policy = await loadPolicyRow();
    res.json({ success: true, data: policy });
  },
);

/** PATCH /api/v1/admin/booking-policy — body: any subset of the four hour fields */
export const updateBookingPolicy = asyncWrapper(
  async (req: Request, res: Response) => {
    const body = req.body ?? {};
    const data: Record<string, number> = {};

    for (const field of FIELDS) {
      if (body[field] === undefined) continue;
      const n = Number(body[field]);
      if (!Number.isInteger(n) || n < 0 || n > 720) {
        throw new BadRequestError(
          `${field} must be a whole number of hours between 0 and 720.`,
        );
      }
      data[field] = n;
    }

    if (Object.keys(data).length === 0) {
      throw new BadRequestError("No policy values supplied.");
    }

    const row = await loadPolicyRow();
    const updated = await prisma.bookingPolicyConfig.update({
      where: { id: row.id },
      data: { ...data, updatedBy: req.user!.id },
    });

    await prisma.auditLog.create({
      data: {
        userId: req.user!.id,
        action: "ADMIN_UPDATED_BOOKING_POLICY",
        entity: "BookingPolicyConfig",
        entityId: row.id,
        changes: data,
      },
    });

    res.json({ success: true, message: "Booking policy updated.", data: updated });
  },
);
