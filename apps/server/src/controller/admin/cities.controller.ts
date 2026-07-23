// ============================================
// apps/server/src/controller/admin/cities.controller.ts
//
// Cities administration — replaces the old TariffManagement panel.
// Admin uses this to add cities where LuxDrive operates, toggle
// ELECTRIC and ULTRA_LUXURY vehicle availability per city, and
// enable / disable / reorder them. City data drives the "which
// cities can partner book in" filter on the partner Book Ride
// panel; the per-city vehicle-class flags also drive the vehicle
// selector on that same form.
// ============================================

import { Request, Response } from "express";
import { prisma } from "../../lib/prisma";
import { asyncWrapper } from "../../utils/asyncWrapper";
import { BadRequestError, NotFoundError } from "../../utils/AppError";

// Normalize a caller-supplied code into the stored form:
//   trims, uppercases, keeps only [A-Z0-9_], and enforces a small
//   sensible length window. Rejects empties. Matches the convention
//   used by the seeded rows (RIYADH, JEDDAH, MAKKAH, MADINAH).
function normalizeCode(raw: unknown): string {
  const s = String(raw ?? "")
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9_]/g, "_");
  if (!s || s.length < 2 || s.length > 32) {
    throw new BadRequestError(
      "City code must be 2-32 characters (letters, digits, or underscores).",
    );
  }
  return s;
}

// ============== LIST ==============

/**
 * GET /api/v1/admin/cities
 * Returns every city (active AND inactive) so admin can manage the
 * full set. Ordered by sortOrder ASC, then name.
 */
export const listCities = asyncWrapper(async (_req: Request, res: Response) => {
  const cities = await prisma.city.findMany({
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
  });
  res.json({ success: true, data: cities });
});

// ============== CREATE ==============

/**
 * POST /api/v1/admin/cities
 * body: { code, name, region?, electricEnabled?, ultraLuxuryEnabled?, sortOrder? }
 *
 * `code` is the stable identifier stored on bookings — should be
 * chosen with care and doesn't change after creation. Uniqueness
 * enforced at DB level via cities_code_key.
 */
export const createCity = asyncWrapper(async (req: Request, res: Response) => {
  const code = normalizeCode(req.body?.code);
  const name = String(req.body?.name ?? "").trim();
  if (!name) throw new BadRequestError("City name is required.");

  const existing = await prisma.city.findUnique({ where: { code } });
  if (existing)
    throw new BadRequestError(`A city with code "${code}" already exists.`);

  // Place at end by default (max sortOrder + 1) so admin's ordering
  // stays predictable when they add without specifying a position.
  const maxOrder = await prisma.city.aggregate({ _max: { sortOrder: true } });
  const sortOrder =
    Number.isFinite(req.body?.sortOrder) && req.body.sortOrder >= 0
      ? Math.round(req.body.sortOrder)
      : (maxOrder._max.sortOrder ?? 0) + 1;

  const city = await prisma.city.create({
    data: {
      code,
      name,
      region: req.body?.region?.trim() || null,
      sortOrder,
      isActive: req.body?.isActive !== false,
      electricEnabled: !!req.body?.electricEnabled,
      ultraLuxuryEnabled: !!req.body?.ultraLuxuryEnabled,
    },
  });

  await prisma.auditLog.create({
    data: {
      userId: req.user!.id,
      action: "CITY_CREATED",
      entity: "City",
      entityId: city.id,
      changes: { code, name },
    },
  });

  res.json({ success: true, data: city });
});

// ============== UPDATE ==============

/**
 * PATCH /api/v1/admin/cities/:id
 * Partial update — name, region, sortOrder, isActive.
 *
 * NOTE: `code` is intentionally NOT editable via this endpoint.
 * Bookings store the code by value, so changing it would leave
 * historic bookings with a dangling reference. If admin truly
 * needs to rename a code, that's a separate migration exercise.
 */
export const updateCity = asyncWrapper(async (req: Request, res: Response) => {
  const { id } = req.params;
  const city = await prisma.city.findUnique({ where: { id } });
  if (!city) throw new NotFoundError("City");

  // `any` here is intentional — Prisma's InputJsonValue type doesn't
  // accept the stricter Record<string, unknown> even though the values
  // are all valid JSON primitives. Cast happens at the .create call.
  const data: Record<string, any> = {};
  if (typeof req.body?.name === "string") {
    const name = req.body.name.trim();
    if (!name) throw new BadRequestError("City name cannot be empty.");
    data.name = name;
  }
  if ("region" in (req.body ?? {})) {
    data.region = req.body.region?.trim() || null;
  }
  if (Number.isFinite(req.body?.sortOrder) && req.body.sortOrder >= 0) {
    data.sortOrder = Math.round(req.body.sortOrder);
  }
  if (typeof req.body?.isActive === "boolean") {
    data.isActive = req.body.isActive;
  }

  if (Object.keys(data).length === 0) {
    return res.json({ success: true, data: city });
  }

  const updated = await prisma.city.update({ where: { id }, data });

  await prisma.auditLog.create({
    data: {
      userId: req.user!.id,
      action: "CITY_UPDATED",
      entity: "City",
      entityId: id,
      changes: data,
    },
  });

  res.json({ success: true, data: updated });
});

// ============== TOGGLES ==============

/**
 * PATCH /api/v1/admin/cities/:id/toggle
 * body: { field: "electricEnabled" | "ultraLuxuryEnabled" | "isActive", value: boolean }
 *
 * Kept as a single dedicated endpoint (rather than PATCH-all-fields)
 * because the panel toggles surface as click-instant switches — no
 * "save" step — and this shape maps 1:1 to that UI. Also cleaner in
 * the audit log ("CITY_TOGGLED electricEnabled → true").
 */
export const toggleCityFlag = asyncWrapper(
  async (req: Request, res: Response) => {
    const { id } = req.params;
    const { field, value } = req.body ?? {};

    const allowed = ["electricEnabled", "ultraLuxuryEnabled", "isActive"];
    if (!allowed.includes(field)) {
      throw new BadRequestError(`field must be one of: ${allowed.join(", ")}.`);
    }
    if (typeof value !== "boolean") {
      throw new BadRequestError("value must be true or false.");
    }

    const city = await prisma.city.findUnique({ where: { id } });
    if (!city) throw new NotFoundError("City");

    const updated = await prisma.city.update({
      where: { id },
      data: { [field]: value },
    });

    await prisma.auditLog.create({
      data: {
        userId: req.user!.id,
        action: "CITY_TOGGLED",
        entity: "City",
        entityId: id,
        changes: { field, from: (city as any)[field], to: value },
      },
    });

    res.json({ success: true, data: updated });
  },
);

// ============== DELETE ==============

/**
 * DELETE /api/v1/admin/cities/:id
 *
 * Refuses to delete a city that any booking still references — the
 * safer default is to mark inactive instead. If admin insists (e.g.
 * a typo they just made, no historic dependency), they can pass
 * ?force=1 to bypass the guard, at which point the city row is
 * removed. Booking rows are NEVER modified by this endpoint.
 */
export const deleteCity = asyncWrapper(async (req: Request, res: Response) => {
  const { id } = req.params;
  const force = req.query.force === "1" || req.query.force === "true";

  const city = await prisma.city.findUnique({ where: { id } });
  if (!city) throw new NotFoundError("City");

  const bookingsReferencing = await prisma.booking.count({
    where: { city: city.code },
  });
  if (bookingsReferencing > 0 && !force) {
    throw new BadRequestError(
      `${bookingsReferencing} booking(s) still reference this city. ` +
        `Mark it inactive instead, or pass ?force=1 to remove anyway.`,
    );
  }

  await prisma.city.delete({ where: { id } });

  await prisma.auditLog.create({
    data: {
      userId: req.user!.id,
      action: "CITY_DELETED",
      entity: "City",
      entityId: id,
      changes: {
        code: city.code,
        name: city.name,
        force,
        bookingsReferencing,
      },
    },
  });

  res.json({ success: true });
});
