// ============================================
// !!! DESTINATION PATH: apps/server/src/utils/helpers/booking-modification.helpers.ts
// ============================================
// Shared helpers for the booking modification / cancellation feature:
//   1. Trip start-instant combiner (tripDate + tripTime → one instant)
//   2. Configurable lead-time gate (reads BookingPolicyConfig)
//   3. Before/after diff builder (powers the cross-portal change panel)
//
// These are deliberately framework-free (except the policy reader, which
// needs the client) so controllers on all three portals share one source
// of truth for "how far ahead of the trip is it?" and "what changed?".

import { prisma } from "../../lib/prisma";

// ------------------------------------------------------------------
// 1. Trip start instant
// ------------------------------------------------------------------
// Bookings store `tripDate` (a DateTime — only the calendar date is
// meaningful) plus `tripTime` (a "HH:MM" string). LuxDrive operates in
// KSA (Asia/Riyadh, UTC+3, no DST), so we attach the HH:MM to the trip's
// calendar date as KSA local time and return the corresponding UTC
// instant. Centralised here so every lead-time check interprets the
// pair identically.
const KSA_OFFSET_HOURS = 3;
const MS_PER_HOUR = 3_600_000;

export function tripStartInstant(tripDate: Date, tripTime: string): Date {
  const [hStr, mStr] = (tripTime || "00:00").split(":");
  const h = Number.parseInt(hStr ?? "0", 10) || 0;
  const m = Number.parseInt(mStr ?? "0", 10) || 0;

  // Take the calendar Y-M-D from tripDate in UTC (tripDate is stored at
  // UTC midnight of the trip day), attach HH:MM as KSA local time, then
  // shift back to a UTC instant.
  const utcMidnight = Date.UTC(
    tripDate.getUTCFullYear(),
    tripDate.getUTCMonth(),
    tripDate.getUTCDate(),
    0,
    0,
    0,
    0,
  );
  const ksaLocalMs = utcMidnight + h * MS_PER_HOUR + m * 60_000;
  return new Date(ksaLocalMs - KSA_OFFSET_HOURS * MS_PER_HOUR);
}

export function hoursUntilTrip(
  tripDate: Date,
  tripTime: string,
  now: Date = new Date(),
): number {
  return (tripStartInstant(tripDate, tripTime).getTime() - now.getTime()) / MS_PER_HOUR;
}

// ------------------------------------------------------------------
// 2. Configurable lead-time policy
// ------------------------------------------------------------------
export type PolicyAction =
  | "partnerChange"
  | "vendorChange"
  | "partnerCancel"
  | "vendorCancel";

type BookingPolicy = {
  partnerChangeCutoffHours: number;
  vendorChangeCutoffHours: number;
  partnerCancelCutoffHours: number;
  vendorCancelCutoffHours: number;
};

const CUTOFF_FIELD: Record<PolicyAction, keyof BookingPolicy> = {
  partnerChange: "partnerChangeCutoffHours",
  vendorChange: "vendorChangeCutoffHours",
  partnerCancel: "partnerCancelCutoffHours",
  vendorCancel: "vendorCancelCutoffHours",
};

// Returns the singleton policy row, lazily seeding it with the 12h
// defaults on first read so the app never depends on a manual insert.
export async function getBookingPolicy(): Promise<BookingPolicy> {
  const existing = await prisma.bookingPolicyConfig.findFirst();
  if (existing) return existing;
  return prisma.bookingPolicyConfig.create({ data: {} });
}

export async function getCutoffHours(action: PolicyAction): Promise<number> {
  const policy = await getBookingPolicy();
  return policy[CUTOFF_FIELD[action]];
}

export interface LeadTimeResult {
  allowed: boolean;
  cutoffHours: number;
  hoursRemaining: number;
}

// Is the actor still within the window to change / cancel this trip?
// Admin callers bypass this entirely (they have no cutoff) — this is only
// for partner- and vendor-initiated actions.
export async function checkLeadTime(
  action: PolicyAction,
  tripDate: Date,
  tripTime: string,
  now: Date = new Date(),
): Promise<LeadTimeResult> {
  const cutoffHours = await getCutoffHours(action);
  const hoursRemaining = hoursUntilTrip(tripDate, tripTime, now);
  return { allowed: hoursRemaining >= cutoffHours, cutoffHours, hoursRemaining };
}

// ------------------------------------------------------------------
// 3. Before/after diff builder
// ------------------------------------------------------------------
// JSON-safe primitive — keeps FieldDiff assignable to Prisma's Json
// input type so it can be stored on BookingModification.changedFields and
// Notification.data without casts leaking `unknown` into the column.
export type JsonPrimitive = string | number | boolean | null;

export interface FieldDiff {
  field: string;
  label: string;
  from: JsonPrimitive;
  to: JsonPrimitive;
}

// The booking fields a partner/admin may modify, with display labels.
// The controllers whitelist against this so an edit can never touch a
// field outside the intended set, and the labels render identically on
// every portal's change panel.
export const BOOKING_MODIFIABLE_FIELDS: Record<string, string> = {
  tripType: "Trip type",
  city: "City",
  route: "Route",
  hours: "Hours",
  hourlyDuration: "Hourly duration",
  pickupAddress: "Pickup location",
  dropoffAddress: "Drop-off location",
  tripDate: "Trip date",
  tripTime: "Trip time",
  flightNumber: "Flight number",
  terminalNo: "Terminal number",
  terminalLocation: "Terminal location",
  vehicleClass: "Vehicle class",
  passengers: "Passengers",
  luggage: "Luggage",
  childSeat: "Child seat",
  totalPrice: "Total price",
  notes: "Notes",
};

// Normalise Prisma Decimal / Date to comparable, serialisable primitives
// so the diff compares (and stores) clean JSON values.
function normalise(v: unknown): JsonPrimitive {
  if (v == null) return null;
  if (
    typeof v === "object" &&
    v !== null &&
    typeof (v as { toNumber?: unknown }).toNumber === "function"
  ) {
    return (v as { toNumber: () => number }).toNumber(); // Prisma Decimal
  }
  if (v instanceof Date) return v.toISOString();
  // Remaining modifiable-field values are already string/number/boolean.
  if (
    typeof v === "string" ||
    typeof v === "number" ||
    typeof v === "boolean"
  ) {
    return v;
  }
  return String(v);
}

function valuesEqual(a: unknown, b: unknown): boolean {
  return JSON.stringify(normalise(a)) === JSON.stringify(normalise(b));
}

// Build the { field, label, from, to }[] describing exactly what changed
// between the current row and an incoming patch. Only fields present in
// the patch AND whose value actually changed are included. The result is
// stored on BookingModification.changedFields and rendered as the
// before/after panel on the admin, partner, and vendor portals.
export function buildBookingDiff(
  before: Record<string, unknown>,
  patch: Record<string, unknown>,
  labels: Record<string, string> = BOOKING_MODIFIABLE_FIELDS,
): FieldDiff[] {
  const diff: FieldDiff[] = [];
  for (const key of Object.keys(patch)) {
    const from = before[key];
    const to = patch[key];
    if (!valuesEqual(from, to)) {
      diff.push({
        field: key,
        label: labels[key] ?? key,
        from: normalise(from),
        to: normalise(to),
      });
    }
  }
  return diff;
}

// True when a change to any of these fields could invalidate an already-
// assigned vendor's driver/vehicle (class → capacity/category mismatch;
// city → coverage). Used to escalate the vendor "please reassign" prompt.
const ASSIGNMENT_AFFECTING_FIELDS = new Set(["vehicleClass", "city"]);

export function diffAffectsAssignment(diff: FieldDiff[]): boolean {
  return diff.some((d) => ASSIGNMENT_AFFECTING_FIELDS.has(d.field));
}
