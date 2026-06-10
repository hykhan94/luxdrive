// ============================================
// apps/server/src/controller/auth/me.controller.ts
//
// Tiny helper endpoint that returns the role-appropriate avatar URL
// for the currently-signed-in user. The navbar (and any other surface
// that wants to render "the right image for this user") fetches from
// here once the session is established.
//
// Why this exists separately from Better Auth's /api/auth/get-session:
// Better Auth's session endpoint returns the User table row as-is. It
// has a single `image` field, and only customer/admin/sales/ops users
// typically populate it (via OAuth profile pics or direct upload).
// For vendor and partner users the "avatar" is conceptually their
// company logo, which lives on Vendor.logoUrl / Partner.logoUrl — not
// on User.image. Without this endpoint, vendors and partners would
// always see the generic User icon in the navbar even though they
// have a company logo uploaded.
//
// Three responsibilities the navbar can't do alone:
//   1. Pick the right field per role (user.image vs vendor.logoUrl
//      vs partner.logoUrl)
//   2. Mint a signed read URL — the DB columns store raw GCS object
//      paths; the browser can't load those directly
//   3. Keep the choice server-side so any future role/storage changes
//      ripple out via a single edit
//
// Response shape: { success: true, data: { avatarUrl: string | null } }
// avatarUrl is null when the user has no image set for their role —
// the navbar shows the generic User icon in that case.
// ============================================

import { Request, Response } from "express";
import { prisma } from "../../lib/prisma";
import { asyncWrapper } from "../../utils/asyncWrapper";
import { getReadUrl } from "../../lib/gcs";

export const getMyAvatar = asyncWrapper(async (req: Request, res: Response) => {
  const userId = req.user!.id;
  const role = req.user!.role;

  let rawPath: string | null = null;

  if (role === "VENDOR") {
    // Vendor's avatar = their company logo. One row per vendor user,
    // looked up by userId. Select only the field we need.
    const vendor = await prisma.vendor.findUnique({
      where: { userId },
      select: { logoUrl: true },
    });
    rawPath = vendor?.logoUrl ?? null;
  } else if (role === "PARTNER") {
    // Partner's avatar = their company logo. Same shape as vendor.
    const partner = await prisma.partner.findUnique({
      where: { userId },
      select: { logoUrl: true },
    });
    rawPath = partner?.logoUrl ?? null;
  } else {
    // CUSTOMER / ADMIN / SALES / OPERATIONS / FINANCE all use the
    // user.image field. May be a GCS object path (uploaded by user),
    // a full URL from OAuth (Google/Apple), or null.
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { image: true },
    });
    rawPath = user?.image ?? null;
  }

  // Sign the URL so the browser can actually load it. getReadUrl
  // is a no-op for full URLs that aren't our GCS paths (e.g. OAuth
  // profile pic URLs from Google), so OAuth-sourced images pass
  // through unchanged.
  const avatarUrl = await getReadUrl(rawPath);

  res.json({
    success: true,
    data: { avatarUrl },
  });
});
