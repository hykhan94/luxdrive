// ============================================
// !!! DESTINATION PATH: apps/server/src/controller/admin/booking-deletion.controller.ts
// ============================================
// Admin Portal — review queue for partner-initiated booking deletion
// requests. Approval performs the SOFT delete (sets booking.deletedAt);
// the row is retained for invoice/payout integrity and audit, and hidden
// from every read path by the Prisma client extension.

import { Request, Response } from "express";
import { prisma } from "../../lib/prisma";
import { asyncWrapper } from "../../utils/asyncWrapper";
import { NotFoundError, BadRequestError } from "../../utils/AppError";
import type { BookingDeletionRequest } from "../../../generated/prisma/client";

// ============== LIST (queue) ==============

/**
 * GET /api/v1/admin/booking-deletion-requests?status=PENDING
 * Nested booking include intentionally bypasses the soft-delete filter,
 * so APPROVED rows still show which (now-hidden) booking was deleted.
 */
export const listDeletionRequests = asyncWrapper(
  async (req: Request, res: Response) => {
    const status = req.query.status ? String(req.query.status) : "PENDING";

    const rows = await prisma.bookingDeletionRequest.findMany({
      where: { status },
      orderBy: { createdAt: "asc" },
      include: {
        partner: { select: { id: true, companyName: true } },
        booking: {
          select: {
            bookingRef: true,
            status: true,
            tripDate: true,
            tripTime: true,
            pickupAddress: true,
            dropoffAddress: true,
            totalPrice: true,
          },
        },
      },
    });

    res.json({ success: true, data: rows });
  },
);

// ============== APPROVE (soft delete) ==============

/**
 * PATCH /api/v1/admin/booking-deletion-requests/:id/approve
 * Body: { adminNote? }
 */
export const approveDeletion = asyncWrapper(
  async (req: Request, res: Response) => {
    const { id } = req.params;
    const { adminNote } = req.body ?? {};

    const request = await prisma.bookingDeletionRequest.findUnique({
      where: { id },
      include: { partner: { select: { userId: true } } },
    });
    if (!request) throw new NotFoundError("Deletion request");
    assertPending(request);

    await prisma.$transaction([
      prisma.booking.update({
        where: { id: request.bookingId },
        data: {
          deletedAt: new Date(),
          deletedBy: req.user!.id,
          deletionReason: request.reason,
        },
      }),
      prisma.bookingDeletionRequest.update({
        where: { id },
        data: {
          status: "APPROVED",
          reviewedBy: req.user!.id,
          reviewedAt: new Date(),
          adminNote: adminNote ? String(adminNote) : null,
        },
      }),
    ]);

    if (request.partner?.userId) {
      await prisma.notification.create({
        data: {
          userId: request.partner.userId,
          title: "Booking deletion approved",
          message: "Your request to delete a booking was approved.",
          type: "BOOKING_DELETION_REVIEWED",
          data: {
            requestId: id,
            bookingId: request.bookingId,
            decision: "APPROVED",
          },
        },
      });
    }

    await prisma.auditLog.create({
      data: {
        userId: req.user!.id,
        action: "ADMIN_APPROVED_BOOKING_DELETION",
        entity: "Booking",
        entityId: request.bookingId,
        changes: { requestId: id, reason: request.reason },
      },
    });

    res.json({ success: true, message: "Booking deleted." });
  },
);

// ============== REJECT ==============

/**
 * PATCH /api/v1/admin/booking-deletion-requests/:id/reject
 * Body: { adminNote? }
 */
export const rejectDeletion = asyncWrapper(
  async (req: Request, res: Response) => {
    const { id } = req.params;
    const { adminNote } = req.body ?? {};

    const request = await prisma.bookingDeletionRequest.findUnique({
      where: { id },
      include: { partner: { select: { userId: true } } },
    });
    if (!request) throw new NotFoundError("Deletion request");
    assertPending(request);

    await prisma.bookingDeletionRequest.update({
      where: { id },
      data: {
        status: "REJECTED",
        reviewedBy: req.user!.id,
        reviewedAt: new Date(),
        adminNote: adminNote ? String(adminNote) : null,
      },
    });

    if (request.partner?.userId) {
      await prisma.notification.create({
        data: {
          userId: request.partner.userId,
          title: "Booking deletion declined",
          message: `Your booking deletion request was declined${
            adminNote ? `: ${String(adminNote)}` : "."
          }`,
          type: "BOOKING_DELETION_REVIEWED",
          data: {
            requestId: id,
            bookingId: request.bookingId,
            decision: "REJECTED",
          },
        },
      });
    }

    await prisma.auditLog.create({
      data: {
        userId: req.user!.id,
        action: "ADMIN_REJECTED_BOOKING_DELETION",
        entity: "Booking",
        entityId: request.bookingId,
        changes: { requestId: id, adminNote: adminNote ?? null },
      },
    });

    res.json({ success: true, message: "Deletion request declined." });
  },
);

function assertPending(request: BookingDeletionRequest): void {
  if (request.status !== "PENDING") {
    throw new BadRequestError(
      `This request has already been ${request.status.toLowerCase()}.`,
    );
  }
}
