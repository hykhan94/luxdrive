// ============================================
// apps/server/src/controller/partner/suspension.controller.ts
//
// One-endpoint controller: returns the info the deactivated-account screen
// on the partner side needs to render (the reason, the timestamp, and the
// support contact channel). Read-only, doesn't mutate anything, and is
// intentionally reachable by a partner even when status = SUSPENDED (all
// other endpoints under /partner require isActivePartner and 403 on
// suspended sessions).
// ============================================

import { Request, Response } from "express";
import { asyncWrapper } from "../../utils/asyncWrapper";
import { prisma } from "../../lib/prisma";
import { AppError } from "../../utils/AppError";
import { HttpStatus } from "../../utils/httpStatus";

// Support contact channel that appears on the locked screen. Sourced from
// Luxakari's contact profile — currently a single WhatsApp number for all
// deactivated partners. If future ops splits into multiple support desks,
// this can become a per-partner lookup without touching the frontend.
const SUPPORT_WHATSAPP = "+966545559510";
const SUPPORT_EMAIL = "info@luxdriveksa.com";

export const getPartnerSuspensionInfo = asyncWrapper(
  async (req: Request, res: Response) => {
    const partner = await prisma.partner.findUnique({
      where: { userId: req.user!.id },
      select: {
        id: true,
        status: true,
        suspendedAt: true,
        suspensionReason: true,
        companyName: true,
      },
    });

    if (!partner) {
      throw new AppError(
        "Partner profile not found",
        HttpStatus.NOT_FOUND,
        "PARTNER_NOT_FOUND",
      );
    }

    res.json({
      success: true,
      data: {
        isSuspended: partner.status === "SUSPENDED",
        suspendedAt: partner.suspendedAt,
        reason: partner.suspensionReason,
        companyName: partner.companyName,
        support: {
          whatsapp: SUPPORT_WHATSAPP,
          // Deep-link WhatsApp Web/app with a prefilled message the partner
          // can send with one tap. Keeps the flow short: click → chat opens
          // with context already typed.
          whatsappUrl: `https://wa.me/${SUPPORT_WHATSAPP.replace(/\D/g, "")}?text=${encodeURIComponent(
            `Hello, my LuxDrive partner account (${partner.companyName}) has been suspended and I would like to discuss the reason.`,
          )}`,
          email: SUPPORT_EMAIL,
        },
      },
    });
  },
);
