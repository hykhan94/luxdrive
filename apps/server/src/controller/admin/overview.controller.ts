// ============================================
// !!! DESTINATION PATH: apps/server/src/controller/admin/overview.controller.ts
// ============================================
// ============================================
// apps/server/src/controller/admin/overview.controller.ts
// Admin Dashboard Overview — focused endpoints
// ============================================

import { Request, Response } from "express";
import { prisma } from "../../lib/prisma";
import { asyncWrapper } from "../../utils/asyncWrapper";

/**
 * GET /overview/stats
 * Summary cards: vendors, partners, active bookings, monthly revenue, drivers, vehicles
 */
export const getOverviewStats = asyncWrapper(
  async (req: Request, res: Response) => {
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

    const [
      totalVendors,
      activeVendors,
      totalPartners,
      activePartners,
      activeBookings,
      completedBookingsThisMonth,
      totalDrivers,
      totalVehicles,
      monthlyRevenue,
      totalCustomers,
    ] = await Promise.all([
      prisma.vendor.count(),
      prisma.vendor.count({ where: { status: "APPROVED" } }),
      prisma.partner.count(),
      prisma.partner.count({ where: { status: "APPROVED" } }),
      prisma.booking.count({
        where: {
          status: {
            in: [
              "PENDING",
              "ASSIGNMENT_OFFERED",
              "ASSIGNMENT_RE_OFFERED",
              "CONFIRMED",
              "IN_PROGRESS",
            ],
          },
        },
      }),
      prisma.booking.count({
        where: {
          status: "COMPLETED",
          completedAt: { gte: startOfMonth },
        },
      }),
      prisma.driver.count({ where: { isActive: true } }),
      prisma.vehicle.count({ where: { isActive: true } }),
      prisma.booking.aggregate({
        where: {
          status: "COMPLETED",
          completedAt: { gte: startOfMonth },
        },
        _sum: { totalPrice: true },
      }),
      prisma.user.count({ where: { role: "CUSTOMER", isActive: true } }),
    ]);

    res.json({
      success: true,
      data: {
        totalVendors,
        activeVendors,
        totalPartners,
        activePartners,
        activeBookings,
        completedBookingsThisMonth,
        totalDrivers,
        totalVehicles,
        monthlyRevenue: monthlyRevenue._sum.totalPrice || 0,
        totalCustomers,
      },
    });
  },
);

/**
 * GET /overview/recent-bookings
 * Latest bookings with customer, vendor, partner info
 * Query: ?page=1&limit=10
 */
export const getRecentBookings = asyncWrapper(
  async (req: Request, res: Response) => {
    const { page = "1", limit = "10" } = req.query;

    const pageNum = parseInt(page as string);
    const limitNum = parseInt(limit as string);
    const skip = (pageNum - 1) * limitNum;

    const [bookings, total] = await Promise.all([
      prisma.booking.findMany({
        skip,
        take: limitNum,
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          bookingRef: true,
          status: true,
          totalPrice: true,
          tripDate: true,
          tripTime: true,
          createdAt: true,
          isReadByAdmin: true,
          needsAttention: true,
          attentionReason: true,
          vehicleClass: true,
          source: true,
          // Trip-type fields — needed so admin can see at a glance
          // which bookings are hourly vs one-way (mirrors the
          // visual treatment in the partner dashboard).
          tripType: true,
          hours: true,
          hourlyDuration: true,
          city: true,
          customer: {
            select: { id: true, name: true, email: true },
          },
          partner: {
            select: { id: true, companyName: true },
          },
          vendor: {
            select: { id: true, companyName: true },
          },
          guestName: true,
        },
      }),
      prisma.booking.count(),
    ]);

    res.json({
      success: true,
      data: {
        bookings: bookings.map((booking) => ({
          id: booking.id,
          bookingRef: booking.bookingRef,
          customer: booking.customer?.name || booking.guestName || "Guest",
          customerEmail: booking.customer?.email || null,
          vendor: booking.vendor?.companyName || "Unassigned",
          // `partner` is the partner companyName if the booking came in
          // via the partner portal; null when the customer booked
          // directly. Frontend uses null-ness to render either a
          // partner chip or a "Direct customer" chip — that distinction
          // matters operationally (which team handles questions, who
          // owes whom) so we surface it intentionally rather than
          // hiding it in a subtitle.
          partner: booking.partner?.companyName || null,
          date: booking.tripDate,
          time: booking.tripTime,
          status: booking.status.toLowerCase().replace(/_/g, "-"),
          amount: booking.totalPrice,
          vehicleClass: booking.vehicleClass,
          source: booking.source,
          tripType: booking.tripType,
          hours: booking.hours,
          hourlyDuration: (booking as any).hourlyDuration || null,
          city: booking.city,
          isUnread: !booking.isReadByAdmin,
          needsAttention: booking.needsAttention,
          attentionReason: booking.attentionReason,
          createdAt: booking.createdAt,
        })),
        pagination: {
          page: pageNum,
          limit: limitNum,
          total,
          totalPages: Math.ceil(total / limitNum),
        },
      },
    });
  },
);

/**
 * GET /overview/payment-summary
 * Quick payment overview for the dashboard cards
 */
export const getPaymentOverview = asyncWrapper(
  async (req: Request, res: Response) => {
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

    const [
      onlineReceivedThisMonth,
      pendingVendorPayments,
      pendingPartnerPayments,
      overduePartnerInvoices,
    ] = await Promise.all([
      prisma.onlinePayment.aggregate({
        where: {
          status: "COMPLETED",
          createdAt: { gte: startOfMonth },
        },
        _sum: { amount: true },
      }),
      // Pending payouts admin owes vendors (new direction). Sum across
      // all PENDING VendorPayout rows. Old query summed VendorReceipt
      // amounts the vendor uploaded — that table no longer exists.
      prisma.vendorPayout.aggregate({
        where: { status: "PENDING" },
        _sum: { amount: true },
      }),
      prisma.partnerInvoice.aggregate({
        where: { status: { in: ["PENDING", "OVERDUE"] } },
        _sum: { amount: true },
      }),
      prisma.partnerInvoice.count({ where: { status: "OVERDUE" } }),
    ]);

    res.json({
      success: true,
      data: {
        onlineReceived: onlineReceivedThisMonth._sum.amount || 0,
        pendingToVendors: pendingVendorPayments._sum.amount || 0,
        pendingFromPartners: pendingPartnerPayments._sum.amount || 0,
        overduePartnerInvoices,
      },
    });
  },
);

/**
 * GET /overview/alerts-summary
 * Quick count of things needing attention across all sections,
 * plus detail arrays the overview UI uses for hover popovers and
 * deep-link navigation:
 *   - expiredDocs:   docs that have already lapsed (red severity)
 *   - expiringDocs:  docs lapsing within 30 days (amber severity)
 *   - unactionedBookingsList: bookings without an assigned vendor
 *                             where the trip is within 24 hours
 *
 * Each detail row carries the entity identifiers the UI needs to
 * deep-link directly to the specific vendor/partner/booking when
 * the admin clicks a row in the popover. Backwards-compatible:
 * existing count fields remain unchanged.
 */
export const getOverviewAlertsSummary = asyncWrapper(
  async (req: Request, res: Response) => {
    const now = new Date();
    const twentyFourHoursFromNow = new Date(
      now.getTime() + 24 * 60 * 60 * 1000,
    );
    const sixtyDaysFromNow = new Date(now.getTime() + 60 * 24 * 60 * 60 * 1000);
    const thirtyDaysFromNow = new Date(
      now.getTime() + 30 * 24 * 60 * 60 * 1000,
    );

    const [
      unactionedBookings,
      unreadBookings,
      needsAttentionBookings,
      pendingVendorReviews,
      pendingPartnerReviews,
      newVendorReceipts,
      overduePartnerInvoices,
      expiringPartnerMous,
      expiringVendorMous,
      // ---- Detail-list queries for hover popovers ----
      // Partners + their docs + MOU. We pull APPROVED only because
      // pre-approval docs haven't been validated yet, mirroring the
      // gating logic in the portal-side banners (see fix in earlier
      // session). For each entity we'll classify each doc into
      // expired vs expiring-soon (≤30d) on the JS side.
      partnersWithDocs,
      vendorsWithDocs,
      // Unactioned-booking detail rows. Same filter as the count
      // above so the list and the count agree.
      unactionedBookingsDetail,
    ] = await Promise.all([
      prisma.booking.count({
        where: {
          vendorId: null,
          tripDate: { lte: twentyFourHoursFromNow },
          status: {
            in: ["PENDING", "ASSIGNMENT_OFFERED", "ASSIGNMENT_RE_OFFERED"],
          },
        },
      }),
      prisma.booking.count({ where: { isReadByAdmin: false } }),
      prisma.booking.count({ where: { needsAttention: true } }),
      prisma.vendor.count({ where: { status: "PENDING_REVIEW" } }),
      prisma.partner.count({ where: { status: "PENDING_REVIEW" } }),
      // Pending vendor payouts (new direction). Was: vendorReceipt
      // counts the vendor's uploaded receipts to review.
      prisma.vendorPayout.count({ where: { status: "PENDING" } }),
      prisma.partnerInvoice.count({ where: { status: "OVERDUE" } }),
      prisma.partner.count({
        where: {
          status: "APPROVED",
          mouExpiryDate: { lte: sixtyDaysFromNow, gte: now },
        },
      }),
      prisma.vendor.count({
        where: {
          status: "APPROVED",
          mouExpiryDate: { lte: sixtyDaysFromNow, gte: now },
        },
      }),
      prisma.partner.findMany({
        where: { status: "APPROVED" },
        select: {
          id: true,
          companyName: true,
          mouExpiryDate: true,
          documents: { select: { type: true, expiryDate: true } },
        },
      }),
      prisma.vendor.findMany({
        where: { status: "APPROVED" },
        select: {
          id: true,
          companyName: true,
          mouExpiryDate: true,
          vendorDocuments: { select: { type: true, expiryDate: true } },
        },
      }),
      prisma.booking.findMany({
        where: {
          vendorId: null,
          tripDate: { lte: twentyFourHoursFromNow },
          status: {
            in: ["PENDING", "ASSIGNMENT_OFFERED", "ASSIGNMENT_RE_OFFERED"],
          },
        },
        select: {
          id: true,
          bookingRef: true,
          tripDate: true,
          pickupAddress: true,
          dropoffAddress: true,
          status: true,
          source: true,
          guestName: true,
          customer: { select: { name: true, firstName: true, lastName: true } },
        },
        orderBy: { tripDate: "asc" },
        take: 50, // cap so the response stays small even at scale
      }),
    ]);

    // ---- Build the expired vs expiring-soon detail lists ----
    // We walk every doc on every approved partner/vendor, including
    // their MOU, classify each by where its expiry date falls
    // relative to now, and emit a flat list. The UI sorts and
    // groups; the API just emits flat rows so each chip's popover
    // can render them independently.
    type DocRow = {
      entityType: "partner" | "vendor";
      entityId: string;
      entityName: string;
      docType: string; // "MOU" | "CR" | "VAT" | ...
      expiryDate: string;
      daysFromNow: number; // negative = expired N days ago
    };

    const expiredDocs: DocRow[] = [];
    const expiringDocs: DocRow[] = [];

    const classify = (
      entityType: "partner" | "vendor",
      entityId: string,
      entityName: string,
      docType: string,
      expiry: Date | null,
    ) => {
      if (!expiry) return;
      const diffMs = expiry.getTime() - now.getTime();
      const daysFromNow = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
      const row: DocRow = {
        entityType,
        entityId,
        entityName,
        docType,
        expiryDate: expiry.toISOString(),
        daysFromNow,
      };
      if (diffMs < 0) {
        expiredDocs.push(row);
      } else if (diffMs <= 30 * 24 * 60 * 60 * 1000) {
        // Within 30 days — same threshold as the per-row chip in
        // the management panels and the portal-side banners.
        expiringDocs.push(row);
      }
    };

    for (const p of partnersWithDocs) {
      for (const d of p.documents) {
        classify("partner", p.id, p.companyName, d.type, d.expiryDate);
      }
      classify("partner", p.id, p.companyName, "MOU", p.mouExpiryDate);
    }
    for (const v of vendorsWithDocs) {
      for (const d of v.vendorDocuments) {
        classify("vendor", v.id, v.companyName, d.type, d.expiryDate);
      }
      classify("vendor", v.id, v.companyName, "MOU", v.mouExpiryDate);
    }

    // Sort: expired oldest first (most overdue at top), expiring
    // soonest first. Admin's eye gravitates to the top of the list,
    // so the most-urgent items belong there.
    expiredDocs.sort((a, b) => a.daysFromNow - b.daysFromNow);
    expiringDocs.sort((a, b) => a.daysFromNow - b.daysFromNow);

    // Format booking rows for the popover. Compute hoursUntilTrip
    // since it's the most useful "urgency" signal — and avoids the
    // UI having to do timezone math. Customer label falls back
    // through the available name sources: guest name first
    // (B2C-direct), then linked customer record.
    const unactionedBookingsList = unactionedBookingsDetail.map((b: any) => {
      const customerLabel =
        b.guestName ||
        b.customer?.name ||
        [b.customer?.firstName, b.customer?.lastName]
          .filter(Boolean)
          .join(" ") ||
        null;
      return {
        id: b.id,
        bookingRef: b.bookingRef,
        tripDate: b.tripDate.toISOString(),
        pickupAddress: b.pickupAddress,
        dropoffAddress: b.dropoffAddress,
        status: b.status,
        source: b.source,
        customerLabel,
        hoursUntilTrip: Math.ceil(
          (b.tripDate.getTime() - now.getTime()) / (1000 * 60 * 60),
        ),
      };
    });

    const totalAlerts =
      unactionedBookings +
      unreadBookings +
      needsAttentionBookings +
      pendingVendorReviews +
      pendingPartnerReviews +
      newVendorReceipts +
      overduePartnerInvoices +
      expiringPartnerMous +
      expiringVendorMous +
      expiredDocs.length;

    res.json({
      success: true,
      data: {
        unactionedBookings,
        unreadBookings,
        needsAttentionBookings,
        pendingVendorReviews,
        pendingPartnerReviews,
        newVendorReceipts,
        overduePartnerInvoices,
        expiringMous: expiringPartnerMous + expiringVendorMous,
        expiringPartnerMous,
        expiringVendorMous,
        // ---- New fields for popover + deep-link ----
        expiredDocsCount: expiredDocs.length,
        expiringDocsCount: expiringDocs.length,
        expiredDocs,
        expiringDocs,
        unactionedBookingsList,
        totalAlerts,
      },
    });
  },
);
