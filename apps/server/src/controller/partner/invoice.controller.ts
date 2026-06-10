// ============================================
// apps/server/src/controller/partner/invoice.controller.ts
// Partner Portal — Invoice Section
// ============================================

import { Request, Response } from "express";
import { prisma } from "../../lib/prisma";
import { asyncWrapper } from "../../utils/asyncWrapper";
import { NotFoundError, BadRequestError } from "../../utils/AppError";
import { requireOperational, requireApprovedAndDocsValid } from "./_shared";

// ============== HELPERS ==============

async function getPartnerForUser(userId: string) {
  const partner = await prisma.partner.findUnique({
    where: { userId },
    select: {
      id: true,
      status: true,
      companyName: true,
      crNumber: true,
      vatNumber: true,
      contactPerson: true,
      contactPhone: true,
      address: true,
    },
  });
  if (!partner) throw new NotFoundError("Partner profile");
  return partner;
}

const STATUS_LABELS: Record<string, string> = {
  PENDING: "Pending",
  OVERDUE: "Overdue",
  PAID: "Paid",
};

const VAT_RATE = 0.15;

/**
 * Generate invoice number
 * Monthly: ACM-INV-202605-001
 * Custom:  ACM-CINV-202605-001
 */
async function generateInvoiceNumber(
  partnerId: string,
  companyName: string,
  isCustom: boolean,
): Promise<string> {
  const now = new Date();
  const yearMonth = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}`;

  const prefix = companyName
    .replace(/[^a-zA-Z]/g, "")
    .substring(0, 3)
    .toUpperCase();
  if (prefix.length < 2) return isCustom ? "PTR-CINV" : "PTR-INV";

  const typeCode = isCustom ? "CINV" : "INV";
  const pattern = `${prefix}-${typeCode}-${yearMonth}-`;

  const existingCount = await prisma.partnerInvoice.count({
    where: {
      partnerId,
      invoiceNumber: { startsWith: pattern },
    },
  });

  const seq = String(existingCount + 1).padStart(3, "0");
  return `${prefix}-${typeCode}-${yearMonth}-${seq}`;
}

// ============== MONTHLY INVOICES LIST ==============

/**
 * Get all monthly invoices for this partner (paginated, searchable)
 * Columns: PO#, Month, Total Rides, Amount, Due Date, Status, Actions
 */
export const getMonthlyInvoices = asyncWrapper(
  async (req: Request, res: Response) => {
    const partner = await getPartnerForUser(req.user!.id);
    requireOperational(partner.status);

    const { page = "1", limit = "10", search, status } = req.query;

    const where: any = {
      partnerId: partner.id,
      isCustom: false,
    };

    if (status && status !== "all") {
      where.status = status;
    }

    if (search) {
      const s = search as string;
      where.OR = [{ invoiceNumber: { contains: s, mode: "insensitive" } }];
    }

    const skip = (parseInt(page as string) - 1) * parseInt(limit as string);

    const [invoices, total] = await Promise.all([
      prisma.partnerInvoice.findMany({
        where,
        skip,
        take: parseInt(limit as string),
        orderBy: { periodStart: "desc" },
      }),
      prisma.partnerInvoice.count({ where }),
    ]);

    // Status counts for filter badges
    const statusCounts = await prisma.partnerInvoice.groupBy({
      by: ["status"],
      where: { partnerId: partner.id, isCustom: false },
      _count: { id: true },
    });
    const statusCountsObj: Record<string, number> = {};
    statusCounts.forEach((sc) => {
      statusCountsObj[sc.status] = sc._count.id;
    });

    const formattedInvoices = invoices.map((inv) => ({
      id: inv.id,
      invoiceNumber: inv.invoiceNumber,
      month: new Date(inv.periodStart).toLocaleString("default", {
        month: "long",
        year: "numeric",
      }),
      periodStart: inv.periodStart,
      periodEnd: inv.periodEnd,
      bookingCount: inv.bookingCount,
      amount: Number(inv.amount),
      dueDate: inv.dueDate,
      status: inv.status,
      statusLabel: STATUS_LABELS[inv.status] || inv.status,
      // Derived from status enum — Stage 2 dropped the redundant booleans.
      // Kept in the response shape for frontend backwards-compat until
      // Stage 4 updates the partner UI to read `status` directly.
      isPaymentReceived:
        inv.status === "PROOF_UPLOADED" || inv.status === "PAID",
      isConfirmed: inv.status === "PAID",
      isNew: !(inv as any).isViewedByPartner, // <-- NEW: true if partner hasn't opened it yet
      createdAt: inv.createdAt,
    }));

    // Count new (unviewed) invoices
    const newInvoiceCount = await prisma.partnerInvoice.count({
      where: {
        partnerId: partner.id,
        isCustom: false,
        isViewedByPartner: false,
      },
    });

    res.json({
      success: true,
      data: {
        invoices: formattedInvoices,
        newInvoiceCount,
        statusCounts: statusCountsObj,
        pagination: {
          page: parseInt(page as string),
          limit: parseInt(limit as string),
          total,
          totalPages: Math.ceil(total / parseInt(limit as string)),
        },
      },
    });
  },
);

// ============== CUSTOM INVOICES LIST ==============

/**
 * Get all custom date range invoices for this partner
 */
export const getCustomInvoices = asyncWrapper(
  async (req: Request, res: Response) => {
    const partner = await getPartnerForUser(req.user!.id);
    requireOperational(partner.status);

    const { page = "1", limit = "10", search, status } = req.query;

    const where: any = {
      partnerId: partner.id,
      isCustom: true,
    };

    if (status && status !== "all") {
      where.status = status;
    }

    if (search) {
      const s = search as string;
      where.OR = [
        { invoiceNumber: { contains: s, mode: "insensitive" } },
        { dateRangeLabel: { contains: s, mode: "insensitive" } },
      ];
    }

    const skip = (parseInt(page as string) - 1) * parseInt(limit as string);

    const [invoices, total] = await Promise.all([
      prisma.partnerInvoice.findMany({
        where,
        skip,
        take: parseInt(limit as string),
        orderBy: { createdAt: "desc" },
      }),
      prisma.partnerInvoice.count({ where }),
    ]);

    const formattedInvoices = invoices.map((inv) => ({
      id: inv.id,
      invoiceNumber: inv.invoiceNumber,
      dateRangeLabel:
        (inv as any).dateRangeLabel ||
        `${new Date(inv.periodStart).toLocaleDateString()} – ${new Date(inv.periodEnd).toLocaleDateString()}`,
      periodStart: inv.periodStart,
      periodEnd: inv.periodEnd,
      bookingCount: inv.bookingCount,
      amount: Number(inv.amount),
      dueDate: inv.dueDate,
      status: inv.status,
      statusLabel: STATUS_LABELS[inv.status] || inv.status,
      // Derived from status enum — Stage 2 dropped the redundant booleans.
      // Kept in the response shape for frontend backwards-compat until
      // Stage 4 updates the partner UI to read `status` directly.
      isPaymentReceived:
        inv.status === "PROOF_UPLOADED" || inv.status === "PAID",
      isConfirmed: inv.status === "PAID",
      createdAt: inv.createdAt,
    }));

    res.json({
      success: true,
      data: {
        invoices: formattedInvoices,
        pagination: {
          page: parseInt(page as string),
          limit: parseInt(limit as string),
          total,
          totalPages: Math.ceil(total / parseInt(limit as string)),
        },
      },
    });
  },
);

// ============== INVOICE DETAIL ==============

/**
 * Get full invoice detail with booking breakdown
 * Shows: company info, invoice month, status, due date, all bookings with
 * booking no, customer name, route, trip date, amount, sub-total, VAT, total
 */
export const getInvoiceDetail = asyncWrapper(
  async (req: Request, res: Response) => {
    const partner = await getPartnerForUser(req.user!.id);
    requireOperational(partner.status);
    const { invoiceId } = req.params;

    const invoice = await prisma.partnerInvoice.findFirst({
      where: {
        id: invoiceId,
        partnerId: partner.id,
      },
    });

    if (!invoice) throw new NotFoundError("Invoice");

    // Auto-mark as viewed by partner
    if (!(invoice as any).isViewedByPartner) {
      await prisma.partnerInvoice.update({
        where: { id: invoice.id },
        data: {
          isViewedByPartner: true,
          viewedByPartnerAt: new Date(),
        } as any,
      });
    }

    // Get all bookings for this invoice period
    // For monthly invoices: COMPLETED bookings in the period that are NOT custom-invoiced
    // For custom invoices: bookings linked to this invoice via partnerInvoiceId
    let bookings;

    if ((invoice as any).isCustom) {
      // Custom invoice — get bookings linked to this invoice
      bookings = await prisma.booking.findMany({
        where: {
          partnerId: partner.id,
          partnerInvoiceId: invoice.id,
        },
        orderBy: { tripDate: "asc" },
        select: {
          id: true,
          bookingRef: true,
          guestName: true,
          route: true,
          pickupAddress: true,
          dropoffAddress: true,
          tripDate: true,
          tripTime: true,
          vehicleClass: true,
          basePrice: true,
          vatAmount: true,
          totalPrice: true,
          status: true,
        },
      });
    } else {
      // Monthly invoice — get COMPLETED bookings in the period not custom-invoiced
      bookings = await prisma.booking.findMany({
        where: {
          partnerId: partner.id,
          status: "COMPLETED",
          tripDate: {
            gte: invoice.periodStart,
            lte: invoice.periodEnd,
          },
          isCustomInvoiced: false,
        },
        orderBy: { tripDate: "asc" },
        select: {
          id: true,
          bookingRef: true,
          guestName: true,
          route: true,
          pickupAddress: true,
          dropoffAddress: true,
          tripDate: true,
          tripTime: true,
          vehicleClass: true,
          basePrice: true,
          vatAmount: true,
          totalPrice: true,
          status: true,
        },
      });
    }

    // Calculate totals from booking data
    const subTotal = bookings.reduce((sum, b) => sum + Number(b.basePrice), 0);
    const totalVat = bookings.reduce((sum, b) => sum + Number(b.vatAmount), 0);
    const grandTotal = bookings.reduce(
      (sum, b) => sum + Number(b.totalPrice),
      0,
    );

    // Check if any bookings in this period were custom-invoiced (for monthly invoices)
    let customInvoicedInfo = null;
    if (!(invoice as any).isCustom) {
      const customInvoicedBookings = await prisma.booking.findMany({
        where: {
          partnerId: partner.id,
          status: "COMPLETED",
          tripDate: {
            gte: invoice.periodStart,
            lte: invoice.periodEnd,
          },
          isCustomInvoiced: true,
        },
        select: {
          id: true,
          bookingRef: true,
          totalPrice: true,
          customInvoicedAt: true,
          partnerInvoiceId: true,
        },
      });

      if (customInvoicedBookings.length > 0) {
        const customTotal = customInvoicedBookings.reduce(
          (sum, b) => sum + Number(b.totalPrice),
          0,
        );
        // Get the custom invoice numbers
        const customInvoiceIds = [
          ...new Set(
            customInvoicedBookings
              .map((b) => b.partnerInvoiceId)
              .filter(Boolean),
          ),
        ];
        const customInvoices = await prisma.partnerInvoice.findMany({
          where: { id: { in: customInvoiceIds as string[] } },
          select: { invoiceNumber: true, createdAt: true },
        });

        customInvoicedInfo = {
          count: customInvoicedBookings.length,
          totalAmount: customTotal,
          invoices: customInvoices.map((ci) => ({
            invoiceNumber: ci.invoiceNumber,
            generatedOn: ci.createdAt,
          })),
          message: `${customInvoicedBookings.length} booking(s) totaling SAR ${customTotal.toFixed(2)} from this period were already billed on custom invoice(s): ${customInvoices.map((ci) => ci.invoiceNumber).join(", ")}`,
        };
      }
    }

    res.json({
      success: true,
      data: {
        invoice: {
          id: invoice.id,
          invoiceNumber: invoice.invoiceNumber,
          isCustom: (invoice as any).isCustom,
          dateRangeLabel: (invoice as any).dateRangeLabel || null,
          month: new Date(invoice.periodStart).toLocaleString("default", {
            month: "long",
            year: "numeric",
          }),
          periodStart: invoice.periodStart,
          periodEnd: invoice.periodEnd,
          bookingCount: invoice.bookingCount,
          amount: Number(invoice.amount),
          dueDate: invoice.dueDate,
          status: invoice.status,
          statusLabel: STATUS_LABELS[invoice.status] || invoice.status,
          // Same derive-from-status pattern as above; paymentReceivedAt
          // now sourced from paymentProofUploadedAt (the new field that
          // stores when partner uploaded the proof). confirmedAt was
          // never removed — it stays as the timestamp admin clicked PAID.
          isPaymentReceived:
            invoice.status === "PROOF_UPLOADED" || invoice.status === "PAID",
          paymentReceivedAt: invoice.paymentProofUploadedAt,
          isConfirmed: invoice.status === "PAID",
          confirmedAt: invoice.confirmedAt,
          createdAt: invoice.createdAt,
        },
        partner: {
          companyName: partner.companyName,
          crNumber: partner.crNumber || "—",
          vatNumber: partner.vatNumber || "—",
          address: partner.address || "—",
          contactPerson: partner.contactPerson || "—",
          contactPhone: partner.contactPhone || "—",
        },
        bookings: bookings.map((b) => ({
          id: b.id,
          bookingRef: b.bookingRef,
          guestName: b.guestName || "—",
          route: b.route || `${b.pickupAddress} → ${b.dropoffAddress}`,
          tripDate: b.tripDate,
          tripTime: b.tripTime,
          vehicleClass: b.vehicleClass,
          basePrice: Number(b.basePrice),
          vatAmount: Number(b.vatAmount),
          totalPrice: Number(b.totalPrice),
          status: b.status,
        })),
        totals: {
          subTotal: Math.round(subTotal * 100) / 100,
          vatAmount: Math.round(totalVat * 100) / 100,
          grandTotal: Math.round(grandTotal * 100) / 100,
        },
        customInvoicedInfo,
      },
    });
  },
);

// ============== GENERATE CUSTOM DATE RANGE INVOICE ==============

/**
 * Partner generates a custom invoice for a specific date range
 * Bookings in this range are flagged so they're excluded from the monthly cycle
 * Admin is notified
 */
export const generateCustomInvoice = asyncWrapper(
  async (req: Request, res: Response) => {
    const partner = await getPartnerForUser(req.user!.id);
    await requireApprovedAndDocsValid(partner);

    const { startDate, endDate } = req.body;

    if (!startDate || !endDate) {
      throw new BadRequestError("startDate and endDate are required");
    }

    const start = new Date(startDate);
    const end = new Date(endDate);
    end.setHours(23, 59, 59);

    if (start > end) {
      throw new BadRequestError("startDate must be before endDate");
    }

    // Check for future dates
    if (start > new Date()) {
      throw new BadRequestError("Cannot generate invoice for future dates");
    }

    // Get COMPLETED bookings in this range that are NOT already custom-invoiced
    const bookings = await prisma.booking.findMany({
      where: {
        partnerId: partner.id,
        status: "COMPLETED",
        tripDate: { gte: start, lte: end },
        isCustomInvoiced: false,
      },
      select: {
        id: true,
        totalPrice: true,
        basePrice: true,
        vatAmount: true,
      },
    });

    if (bookings.length === 0) {
      throw new BadRequestError(
        "No completed bookings found in this date range that haven't already been invoiced",
      );
    }

    const totalAmount = bookings.reduce(
      (sum, b) => sum + Number(b.totalPrice),
      0,
    );

    const dateRangeLabel = `${start.toLocaleDateString("en-SA", { day: "2-digit", month: "short", year: "numeric" })} – ${end.toLocaleDateString("en-SA", { day: "2-digit", month: "short", year: "numeric" })}`;

    // Generate invoice number (CINV prefix for custom)
    const invoiceNumber = await generateInvoiceNumber(
      partner.id,
      partner.companyName,
      true,
    );

    // Create the custom invoice + flag bookings in a transaction
    const [invoice] = await prisma.$transaction([
      // Create the invoice
      prisma.partnerInvoice.create({
        data: {
          invoiceNumber,
          partnerId: partner.id,
          amount: totalAmount,
          bookingCount: bookings.length,
          periodStart: start,
          periodEnd: end,
          generationType: "CUSTOM",
          dueDate: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000), // 5 days from now
          status: "PENDING",
          isCustom: true,
          isViewedByPartner: true,
          viewedByPartnerAt: new Date(),
          dateRangeLabel,
          createdByUserId: req.user!.id,
        } as any,
      }),
      // Flag all bookings as custom-invoiced (must use raw for the bulk update with invoice ID)
      ...bookings.map((b) =>
        prisma.booking.update({
          where: { id: b.id },
          data: {
            isCustomInvoiced: true,
            customInvoicedAt: new Date(),
          } as any,
        }),
      ),
    ]);

    // Link bookings to the invoice (second pass since we need the invoice ID)
    await prisma.booking.updateMany({
      where: {
        id: { in: bookings.map((b) => b.id) },
      },
      data: {
        partnerInvoiceId: invoice.id,
      } as any,
    });

    // Notify admin
    const adminUsers = await prisma.user.findMany({
      where: { role: "ADMIN", isActive: true },
      select: { id: true },
    });

    if (adminUsers.length > 0) {
      await prisma.notification.createMany({
        data: adminUsers.map((admin) => ({
          userId: admin.id,
          title: "Custom Invoice Generated by Partner",
          message: `${partner.companyName} generated a custom invoice ${invoiceNumber} for ${dateRangeLabel} — ${bookings.length} bookings totaling SAR ${totalAmount.toFixed(2)}`,
          type: "PARTNER_CUSTOM_INVOICE",
          data: {
            invoiceId: invoice.id,
            invoiceNumber,
            partnerId: partner.id,
            amount: totalAmount,
          },
        })),
      });
    }

    // Audit log
    await prisma.auditLog.create({
      data: {
        userId: req.user!.id,
        action: "PARTNER_CUSTOM_INVOICE_GENERATED",
        entity: "PartnerInvoice",
        entityId: invoice.id,
        changes: {
          invoiceNumber,
          dateRange: dateRangeLabel,
          bookingCount: bookings.length,
          amount: totalAmount,
        },
      },
    });

    res.status(201).json({
      success: true,
      message: `Custom invoice ${invoiceNumber} generated for ${dateRangeLabel}`,
      data: {
        id: invoice.id,
        invoiceNumber: invoice.invoiceNumber,
        dateRangeLabel,
        bookingCount: invoice.bookingCount,
        amount: Number(invoice.amount),
        dueDate: invoice.dueDate,
        status: invoice.status,
      },
    });
  },
);

// ============== EXPORT INVOICE CSV ==============

/**
 * Download invoice data as CSV
 */
export const exportInvoiceCsv = asyncWrapper(
  async (req: Request, res: Response) => {
    const partner = await getPartnerForUser(req.user!.id);
    requireOperational(partner.status);
    const { invoiceId } = req.params;

    const invoice = await prisma.partnerInvoice.findFirst({
      where: { id: invoiceId, partnerId: partner.id },
    });
    if (!invoice) throw new NotFoundError("Invoice");

    // Get bookings for this invoice
    let bookings;
    if ((invoice as any).isCustom) {
      bookings = await prisma.booking.findMany({
        where: { partnerId: partner.id, partnerInvoiceId: invoice.id },
        orderBy: { tripDate: "asc" },
        select: {
          bookingRef: true,
          guestName: true,
          guestPhone: true,
          guestEmail: true,
          route: true,
          pickupAddress: true,
          dropoffAddress: true,
          tripDate: true,
          tripTime: true,
          vehicleClass: true,
          basePrice: true,
          vatAmount: true,
          totalPrice: true,
          status: true,
        },
      });
    } else {
      bookings = await prisma.booking.findMany({
        where: {
          partnerId: partner.id,
          status: "COMPLETED",
          tripDate: { gte: invoice.periodStart, lte: invoice.periodEnd },
          isCustomInvoiced: false,
        },
        orderBy: { tripDate: "asc" },
        select: {
          bookingRef: true,
          guestName: true,
          guestPhone: true,
          guestEmail: true,
          route: true,
          pickupAddress: true,
          dropoffAddress: true,
          tripDate: true,
          tripTime: true,
          vehicleClass: true,
          basePrice: true,
          vatAmount: true,
          totalPrice: true,
          status: true,
        },
      });
    }

    const headers = [
      "Booking No",
      "Guest Name",
      "Phone",
      "Email",
      "Route",
      "Trip Date",
      "Trip Time",
      "Vehicle Class",
      "Base Price (SAR)",
      "VAT (SAR)",
      "Total (SAR)",
      "Status",
    ];

    const rows = bookings.map((b) => [
      b.bookingRef,
      b.guestName || "",
      b.guestPhone || "",
      b.guestEmail || "",
      b.route || `${b.pickupAddress} → ${b.dropoffAddress}`,
      new Date(b.tripDate).toLocaleDateString(),
      b.tripTime,
      b.vehicleClass,
      Number(b.basePrice).toFixed(2),
      Number(b.vatAmount).toFixed(2),
      Number(b.totalPrice).toFixed(2),
      b.status,
    ]);

    // Add totals row
    const subTotal = bookings.reduce((s, b) => s + Number(b.basePrice), 0);
    const totalVat = bookings.reduce((s, b) => s + Number(b.vatAmount), 0);
    const grandTotal = bookings.reduce((s, b) => s + Number(b.totalPrice), 0);
    rows.push([]);
    rows.push([
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      "Sub-Total",
      subTotal.toFixed(2),
      "",
      "",
      "",
    ]);
    rows.push([
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      "VAT (15%)",
      "",
      totalVat.toFixed(2),
      "",
      "",
    ]);
    rows.push([
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      "Grand Total",
      "",
      "",
      grandTotal.toFixed(2),
      "",
    ]);

    const csvContent = [
      `Invoice: ${invoice.invoiceNumber}`,
      `Partner: ${partner.companyName}`,
      `Period: ${new Date(invoice.periodStart).toLocaleDateString()} – ${new Date(invoice.periodEnd).toLocaleDateString()}`,
      `Status: ${STATUS_LABELS[invoice.status] || invoice.status}`,
      "",
      headers.join(","),
      ...rows.map((row) =>
        row.map !== undefined
          ? (row as any[])
              .map((cell: any) => `"${String(cell).replace(/"/g, '""')}"`)
              .join(",")
          : "",
      ),
    ].join("\n");

    res.setHeader("Content-Type", "text/csv");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="${invoice.invoiceNumber}.csv"`,
    );
    res.send(csvContent);
  },
);

// ============== DOWNLOAD INVOICE PDF (HTML) ==============

/**
 * Generate printable invoice HTML (partner uses browser print-to-PDF)
 */
export const downloadInvoicePdf = asyncWrapper(
  async (req: Request, res: Response) => {
    const partner = await getPartnerForUser(req.user!.id);
    requireOperational(partner.status);
    const { invoiceId } = req.params;

    const invoice = await prisma.partnerInvoice.findFirst({
      where: { id: invoiceId, partnerId: partner.id },
    });
    if (!invoice) throw new NotFoundError("Invoice");

    // Get bookings
    let bookings;
    if ((invoice as any).isCustom) {
      bookings = await prisma.booking.findMany({
        where: { partnerId: partner.id, partnerInvoiceId: invoice.id },
        orderBy: { tripDate: "asc" },
        select: {
          bookingRef: true,
          guestName: true,
          route: true,
          pickupAddress: true,
          dropoffAddress: true,
          tripDate: true,
          tripTime: true,
          vehicleClass: true,
          basePrice: true,
          vatAmount: true,
          totalPrice: true,
        },
      });
    } else {
      bookings = await prisma.booking.findMany({
        where: {
          partnerId: partner.id,
          status: "COMPLETED",
          tripDate: { gte: invoice.periodStart, lte: invoice.periodEnd },
          isCustomInvoiced: false,
        },
        orderBy: { tripDate: "asc" },
        select: {
          bookingRef: true,
          guestName: true,
          route: true,
          pickupAddress: true,
          dropoffAddress: true,
          tripDate: true,
          tripTime: true,
          vehicleClass: true,
          basePrice: true,
          vatAmount: true,
          totalPrice: true,
        },
      });
    }

    const subTotal = bookings.reduce((s, b) => s + Number(b.basePrice), 0);
    const totalVat = bookings.reduce((s, b) => s + Number(b.vatAmount), 0);
    const grandTotal = bookings.reduce((s, b) => s + Number(b.totalPrice), 0);

    const periodLabel = (invoice as any).isCustom
      ? (invoice as any).dateRangeLabel ||
        `${new Date(invoice.periodStart).toLocaleDateString()} – ${new Date(invoice.periodEnd).toLocaleDateString()}`
      : new Date(invoice.periodStart).toLocaleString("default", {
          month: "long",
          year: "numeric",
        });

    const html = buildInvoiceHtml(invoice, partner, bookings, {
      subTotal,
      totalVat,
      grandTotal,
      periodLabel,
    });

    res.json({
      success: true,
      data: {
        invoiceNumber: invoice.invoiceNumber,
        html,
        meta: {
          fileName: `${invoice.invoiceNumber}.pdf`,
          title: `Invoice — ${invoice.invoiceNumber}`,
          partner: partner.companyName,
        },
      },
    });
  },
);

// ============== AUTO-GENERATE MONTHLY INVOICES (called by cron) ==============

/**
 * Generate monthly invoices for all approved partners
 * Should be called by a cron job on the 1st of every month
 * Endpoint: POST /api/v1/partner/invoices/generate-monthly (admin-only or cron)
 */
export const generateMonthlyInvoices = asyncWrapper(
  async (req: Request, res: Response) => {
    // This should ideally be called by a cron job or admin trigger
    const now = new Date();
    const prevMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const prevMonthEnd = new Date(
      now.getFullYear(),
      now.getMonth(),
      0,
      23,
      59,
      59,
    );
    const dueDate = new Date(now.getFullYear(), now.getMonth(), 5); // 5th of current month

    // Get all approved partners
    const partners = await prisma.partner.findMany({
      where: { status: "APPROVED" },
      select: { id: true, companyName: true, userId: true },
    });

    const results: any[] = [];

    for (const partner of partners) {
      // Check if invoice already exists for this period
      const existing = await prisma.partnerInvoice.findFirst({
        where: {
          partnerId: partner.id,
          periodStart: prevMonthStart,
          periodEnd: prevMonthEnd,
          isCustom: false,
        },
      });

      if (existing) {
        results.push({
          partner: partner.companyName,
          status: "SKIPPED",
          reason: "Invoice already exists",
        });
        continue;
      }

      // Get COMPLETED bookings for previous month that are NOT custom-invoiced
      const bookings = await prisma.booking.findMany({
        where: {
          partnerId: partner.id,
          status: "COMPLETED",
          tripDate: { gte: prevMonthStart, lte: prevMonthEnd },
          isCustomInvoiced: false,
        },
        select: { id: true, totalPrice: true },
      });

      if (bookings.length === 0) {
        results.push({
          partner: partner.companyName,
          status: "SKIPPED",
          reason: "No completed bookings",
        });
        continue;
      }

      const totalAmount = bookings.reduce(
        (sum, b) => sum + Number(b.totalPrice),
        0,
      );

      const invoiceNumber = await generateInvoiceNumber(
        partner.id,
        partner.companyName,
        false,
      );

      const invoice = await prisma.partnerInvoice.create({
        data: {
          invoiceNumber,
          partnerId: partner.id,
          amount: totalAmount,
          bookingCount: bookings.length,
          periodStart: prevMonthStart,
          periodEnd: prevMonthEnd,
          generationType: "MONTHLY",
          dueDate,
          status: "PENDING",
          isCustom: false,
        } as any,
      });

      // Link bookings to this invoice
      await prisma.booking.updateMany({
        where: { id: { in: bookings.map((b) => b.id) } },
        data: { partnerInvoiceId: invoice.id } as any,
      });

      // Notify admin
      const adminUsers = await prisma.user.findMany({
        where: { role: "ADMIN", isActive: true },
        select: { id: true },
      });

      if (adminUsers.length > 0) {
        await prisma.notification.createMany({
          data: adminUsers.map((admin) => ({
            userId: admin.id,
            title: "Monthly Invoice Generated",
            message: `${partner.companyName} — ${invoiceNumber}: ${bookings.length} rides, SAR ${totalAmount.toFixed(2)} due by ${dueDate.toLocaleDateString()}`,
            type: "PARTNER_MONTHLY_INVOICE",
            data: {
              invoiceId: invoice.id,
              invoiceNumber,
              partnerId: partner.id,
            },
          })),
        });
      }

      results.push({
        partner: partner.companyName,
        status: "CREATED",
        invoiceNumber,
        amount: totalAmount,
        bookingCount: bookings.length,
      });
    }

    res.json({
      success: true,
      message: `Processed ${partners.length} partners`,
      data: { results },
    });
  },
);

// ============== UPLOAD PAYMENT PROOF ==============

/**
 * POST /api/v1/partner/invoices/:id/upload-proof
 *
 * Partner uploads bank-transfer proof for an invoice. Status flips
 * PENDING/OVERDUE → PROOF_UPLOADED. Admin gets notified to review
 * and confirm.
 *
 * Required body: { proofUrl, proofFileName? }
 *
 * Gating: status APPROVED or SUSPENDED. SUSPENDED is the recovery
 * path — partner missed the 5th, got auto-suspended on the 6th,
 * pays the bank, comes here to upload proof so admin can verify
 * and unsuspend them. Other operational statuses (INVITED,
 * ONBOARDING, PENDING_REVIEW, CHANGES_REQUESTED) can't reach this
 * point — they don't have invoices to pay.
 */
export const uploadPaymentProof = asyncWrapper(
  async (req: Request, res: Response) => {
    const partner = await getPartnerForUser(req.user!.id);

    // Allow APPROVED + SUSPENDED. Skip the requireApprovedAndDocsValid
    // helper since that rejects SUSPENDED.
    if (partner.status !== "APPROVED" && partner.status !== "SUSPENDED") {
      throw new BadRequestError(
        "Only approved or suspended partners can upload payment proof.",
      );
    }

    const { id } = req.params;
    const { proofUrl, proofFileName } = req.body as {
      proofUrl?: string;
      proofFileName?: string;
    };

    if (!proofUrl || typeof proofUrl !== "string" || proofUrl.trim() === "") {
      throw new BadRequestError("proofUrl is required");
    }

    const invoice = await prisma.partnerInvoice.findFirst({
      where: { id, partnerId: partner.id },
    });
    if (!invoice) throw new NotFoundError("Invoice");

    if (invoice.status === "PAID") {
      throw new BadRequestError("This invoice is already marked as paid.");
    }
    if (invoice.status === "PROOF_UPLOADED") {
      throw new BadRequestError(
        "Payment proof has already been uploaded. Admin is reviewing it.",
      );
    }
    if (invoice.status !== "PENDING" && invoice.status !== "OVERDUE") {
      throw new BadRequestError(
        `Cannot upload proof for invoice in status "${invoice.status}".`,
      );
    }

    const updated = await prisma.partnerInvoice.update({
      where: { id },
      data: {
        status: "PROOF_UPLOADED",
        paymentProofUrl: proofUrl.trim(),
        paymentProofFileName: proofFileName?.trim() || null,
        paymentProofUploadedAt: new Date(),
      },
    });

    // Audit trail — partner doing this action.
    await prisma.auditLog.create({
      data: {
        userId: req.user!.id,
        action: "PARTNER_PAYMENT_PROOF_UPLOADED",
        entity: "PartnerInvoice",
        entityId: id,
        changes: {
          invoiceNumber: invoice.invoiceNumber,
          amount: Number(invoice.amount),
          partner: partner.companyName,
          proofUrl: proofUrl.trim(),
        },
      },
    });

    // Notify admin via the payment-notifications helper (centralized
    // wording, type tags). Keeps the controller free of inline message
    // strings.
    const { notifyAdminOfPartnerProofUpload } =
      await import("../../lib/payment-notifications");
    await notifyAdminOfPartnerProofUpload(id);

    res.json({
      success: true,
      message: "Payment proof uploaded. Admin will review and confirm shortly.",
      data: {
        id: updated.id,
        invoiceNumber: updated.invoiceNumber,
        status: updated.status,
        paymentProofUrl: updated.paymentProofUrl,
        paymentProofFileName: updated.paymentProofFileName,
        paymentProofUploadedAt: updated.paymentProofUploadedAt,
      },
    });
  },
);

// ============== INVOICE HTML BUILDER ==============

function buildInvoiceHtml(
  invoice: any,
  partner: any,
  bookings: any[],
  totals: {
    subTotal: number;
    totalVat: number;
    grandTotal: number;
    periodLabel: string;
  },
): string {
  const bookingRows = bookings
    .map(
      (b, i) => `
    <tr>
      <td>${i + 1}</td>
      <td>${b.bookingRef}</td>
      <td>${b.guestName || "—"}</td>
      <td>${b.route || `${b.pickupAddress} → ${b.dropoffAddress}`}</td>
      <td>${new Date(b.tripDate).toLocaleDateString()}</td>
      <td>${b.vehicleClass}</td>
      <td class="amount">${Number(b.totalPrice).toFixed(2)}</td>
    </tr>`,
    )
    .join("");

  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Invoice — ${invoice.invoiceNumber}</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: 'Segoe UI', Arial, sans-serif; color: #1a1a1a; padding: 40px; max-width: 900px; margin: 0 auto; font-size: 13px; }
    .header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 30px; border-bottom: 3px solid #c8a961; padding-bottom: 20px; }
    .logo { font-size: 28px; font-weight: 800; color: #c8a961; }
    .logo span { color: #333; }
    .inv-info { text-align: right; }
    .inv-info h2 { font-size: 22px; color: #333; margin-bottom: 4px; }
    .inv-info p { font-size: 12px; color: #666; }
    .meta-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin-bottom: 24px; }
    .meta-box { background: #f8f8f8; padding: 16px; border-radius: 8px; }
    .meta-box h4 { font-size: 11px; color: #c8a961; text-transform: uppercase; letter-spacing: 1px; margin-bottom: 8px; }
    .meta-box p { font-size: 13px; margin-bottom: 4px; }
    .meta-box .label { color: #999; font-size: 11px; }
    table { width: 100%; border-collapse: collapse; margin-top: 16px; }
    th { text-align: left; font-size: 11px; color: #999; text-transform: uppercase; padding: 10px 8px; border-bottom: 2px solid #e5e5e5; }
    td { padding: 8px; border-bottom: 1px solid #f0f0f0; font-size: 12px; }
    .amount { text-align: right; }
    .totals-section { margin-top: 20px; display: flex; justify-content: flex-end; }
    .totals-table { width: 280px; }
    .totals-table td { padding: 6px 8px; font-size: 13px; }
    .totals-table .grand td { border-top: 2px solid #c8a961; font-weight: 700; font-size: 16px; color: #c8a961; }
    .status-badge { display: inline-block; padding: 4px 12px; border-radius: 20px; font-size: 11px; font-weight: 600; }
    .status-PENDING { background: #fef3c7; color: #92400e; }
    .status-OVERDUE { background: #fee2e2; color: #991b1b; }
    .status-PAID { background: #d1fae5; color: #065f46; }
    .custom-badge { display: inline-block; padding: 2px 8px; background: #ede9fe; color: #5b21b6; border-radius: 4px; font-size: 10px; font-weight: 600; margin-left: 8px; }
    .footer { margin-top: 40px; padding-top: 16px; border-top: 1px solid #e5e5e5; font-size: 11px; color: #999; text-align: center; }
    @media print { body { padding: 20px; } }
  </style>
</head>
<body>
  <div class="header">
    <div>
      <div class="logo">LUX<span>DRIVE</span></div>
      <p style="font-size: 12px; color: #666; margin-top: 4px;">Premium Chauffeur Services</p>
    </div>
    <div class="inv-info">
      <h2>Invoice</h2>
      <p><strong>${invoice.invoiceNumber}</strong>${(invoice as any).isCustom ? '<span class="custom-badge">CUSTOM</span>' : ""}</p>
      <p>Period: ${totals.periodLabel}</p>
      <p>Status: <span class="status-badge status-${invoice.status}">${STATUS_LABELS[invoice.status] || invoice.status}</span></p>
      <p>Due: ${new Date(invoice.dueDate).toLocaleDateString()}</p>
    </div>
  </div>

  <div class="meta-grid">
    <div class="meta-box">
      <h4>Billed To</h4>
      <p><strong>${partner.companyName}</strong></p>
      <p>${partner.address || ""}</p>
      <p><span class="label">CR:</span> ${partner.crNumber || "—"} &nbsp; <span class="label">VAT:</span> ${partner.vatNumber || "—"}</p>
      <p><span class="label">Contact:</span> ${partner.contactPerson || "—"} — ${partner.contactPhone || "—"}</p>
    </div>
    <div class="meta-box">
      <h4>Invoice Summary</h4>
      <p><span class="label">Invoice No:</span> ${invoice.invoiceNumber}</p>
      <p><span class="label">Total Rides:</span> ${bookings.length}</p>
      <p><span class="label">Amount:</span> <strong>SAR ${totals.grandTotal.toFixed(2)}</strong></p>
      <p><span class="label">Generated:</span> ${new Date(invoice.createdAt).toLocaleDateString()}</p>
    </div>
  </div>

  <h3 style="font-size: 14px; color: #333; margin-bottom: 8px;">Booking Details</h3>
  <table>
    <thead>
      <tr>
        <th>#</th>
        <th>Booking No</th>
        <th>Customer</th>
        <th>Route</th>
        <th>Trip Date</th>
        <th>Vehicle</th>
        <th class="amount">Amount (SAR)</th>
      </tr>
    </thead>
    <tbody>
      ${bookingRows}
    </tbody>
  </table>

  <div class="totals-section">
    <table class="totals-table">
      <tr><td>Sub-Total</td><td class="amount">${totals.subTotal.toFixed(2)}</td></tr>
      <tr><td>VAT (15%)</td><td class="amount">${totals.totalVat.toFixed(2)}</td></tr>
      <tr class="grand"><td>Grand Total</td><td class="amount">SAR ${totals.grandTotal.toFixed(2)}</td></tr>
    </table>
  </div>

  <div class="footer">
    <p>LuxDrive — Premium Chauffeur Services, Kingdom of Saudi Arabia</p>
    <p>This is a system-generated invoice. Payment is due by ${new Date(invoice.dueDate).toLocaleDateString()}.</p>
  </div>
</body>
</html>`;
}
