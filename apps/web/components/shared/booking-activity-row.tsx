"use client";

import React from "react";
import {
  Clock,
  CircleDollarSign,
  UserPlus,
  BellRing,
  CheckCircle2,
  Car,
  RefreshCw,
  XCircle,
  PlayCircle,
  FilePenLine,
} from "lucide-react";

/*
 * A single, quiet "activity-forward" booking row shared by the partner,
 * vendor and admin list views. The design goal: strip the busy multi-badge
 * row down to (1) a status spine you can triage by color, (2) the guest /
 * booking identity, (3) ONE plain-language line saying what just happened,
 * and (4) a lifecycle track showing how far along the booking is. Anything
 * unseen gets a soft gold glow + a pulsing dot so new activity pulls the eye.
 */

export type ActivityTone =
  | "action"
  | "active"
  | "positive"
  | "muted"
  | "danger";

const TONE: Record<ActivityTone, { spine: string; text: string }> = {
  action: { spine: "bg-amber-400", text: "text-amber-300" },
  active: { spine: "bg-luxury-gold", text: "text-luxury-gold" },
  positive: { spine: "bg-emerald-400", text: "text-emerald-300" },
  muted: { spine: "bg-neutral-600", text: "text-gray-400" },
  danger: { spine: "bg-red-500", text: "text-red-400" },
};

export interface BookingActivityRowProps {
  name: string;
  reference?: string;
  subline?: string;
  icon?: React.ReactNode;
  activityLabel: string;
  activityTime?: string | null;
  tone?: ActivityTone;
  money?: string | null;
  waitLabel?: string | null;
  lifecycleStep?: number; // 1-based index of the current stage (0 = none)
  lifecycleTotal?: number;
  unseen?: boolean;
  onClick?: () => void;
}

/*
 * What the per-portal derive helpers return: everything the row needs
 * except the fields the caller supplies (name / subline / onClick). Keeping
 * activityLabel required here is what lets `{...deriveXActivity(b)}` spread
 * cleanly into <BookingActivityRow> without TS widening it to string|undefined.
 */
export type DerivedActivity = Omit<
  BookingActivityRowProps,
  "name" | "subline" | "onClick"
>;

export function BookingActivityRow({
  name,
  reference,
  subline,
  icon,
  activityLabel,
  activityTime,
  tone = "muted",
  money,
  waitLabel,
  lifecycleStep = 0,
  lifecycleTotal = 4,
  unseen,
  onClick,
}: BookingActivityRowProps) {
  const t = TONE[tone];
  return (
    <button
      type="button"
      onClick={onClick}
      className={`group relative flex w-full items-stretch overflow-hidden rounded-2xl border bg-neutral-900 text-left transition-colors ${
        unseen
          ? "border-luxury-gold/30 shadow-[inset_3px_0_20px_-6px_rgba(201,169,97,0.5)]"
          : "border-neutral-800 hover:border-neutral-700"
      }`}
    >
      <span className={`w-[3px] shrink-0 ${t.spine}`} />
      <span className="min-w-0 flex-1 px-4 py-3">
        <span className="flex items-center">
          {unseen && (
            <span className="mr-2 h-[7px] w-[7px] shrink-0 animate-pulse rounded-full bg-luxury-gold" />
          )}
          <span className="truncate text-sm font-medium text-white">
            {name}
          </span>
          {reference && (
            <span className="ml-2 shrink-0 font-mono text-[11px] text-neutral-500">
              {reference}
            </span>
          )}
        </span>
        {subline && (
          <span className="mt-0.5 block truncate text-xs text-gray-500">
            {subline}
          </span>
        )}
        <span className={`mt-2 flex items-center gap-1.5 text-xs ${t.text}`}>
          {icon}
          <span className="truncate">{activityLabel}</span>
          {activityTime && (
            <span className="shrink-0 text-neutral-600">· {activityTime}</span>
          )}
        </span>
      </span>
      <span className="flex shrink-0 flex-col items-end justify-between py-3 pl-2 pr-4">
        {waitLabel ? (
          <span className="text-xs text-amber-400">{waitLabel}</span>
        ) : money ? (
          <span className="font-mono text-sm font-medium text-white">
            {money}
          </span>
        ) : (
          <span />
        )}
        {lifecycleTotal > 0 && (
          <span className="mt-2.5 flex gap-1">
            {Array.from({ length: lifecycleTotal }).map((_, i) => {
              const done = i < lifecycleStep - 1;
              const cur = i === lifecycleStep - 1;
              return (
                <span
                  key={i}
                  className={`h-1.5 w-1.5 rounded-full ${
                    done
                      ? "bg-luxury-gold"
                      : cur
                        ? "bg-luxury-gold ring-2 ring-luxury-gold/20"
                        : "bg-neutral-700"
                  }`}
                />
              );
            })}
          </span>
        )}
      </span>
    </button>
  );
}

// ── Relative time ("just now", "5m", "2h", "3d") ───────────────────────
export function relativeTime(iso?: string | Date | null): string | null {
  if (!iso) return null;
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return null;
  const s = Math.round((Date.now() - then) / 1000);
  if (s < 45) return "just now";
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h`;
  const d = Math.round(h / 24);
  if (d < 7) return `${d}d`;
  return `${Math.round(d / 7)}w`;
}

const SM = { className: "h-3.5 w-3.5" };

// ── Partner activity language ──────────────────────────────────────────
export function derivePartnerActivity(b: any): DerivedActivity {
  const money =
    b.totalPrice > 0 ? `SAR ${b.totalPrice.toLocaleString()}` : null;
  const time = relativeTime(b.lastActivityAt);
  const unseen = !!b.hasUnseenUpdate;
  const edited = (b.modificationCount ?? 0) > 0;
  const base = { reference: b.bookingRef, activityTime: time, unseen, money };
  switch (b.status) {
    case "AWAITING_PRICING":
      return {
        ...base,
        money: null,
        waitLabel: "Awaiting pricing",
        tone: "action",
        icon: <Clock {...SM} />,
        activityLabel: "Awaiting pricing",
        lifecycleStep: 1,
      };
    case "PENDING":
    case "ASSIGNMENT_OFFERED":
    case "ASSIGNMENT_RE_OFFERED":
      return {
        ...base,
        tone: "active",
        icon: edited ? <FilePenLine {...SM} /> : <Car {...SM} />,
        activityLabel: edited
          ? `Updated ×${b.modificationCount}`
          : "Arranging your driver & vehicle",
        lifecycleStep: 2,
      };
    case "CONFIRMED":
      return {
        ...base,
        tone: "positive",
        icon: <CheckCircle2 {...SM} />,
        activityLabel: money ? `Confirmed at ${money}` : "Confirmed",
        lifecycleStep: 3,
      };
    case "IN_PROGRESS":
      return {
        ...base,
        tone: "positive",
        icon: <PlayCircle {...SM} />,
        activityLabel: "Trip in progress",
        lifecycleStep: 4,
      };
    case "COMPLETED":
      return {
        ...base,
        tone: "muted",
        icon: <CheckCircle2 {...SM} />,
        activityLabel: "Completed",
        lifecycleStep: 4,
      };
    case "CANCELLED":
      return {
        ...base,
        money: null,
        tone: "danger",
        icon: <XCircle {...SM} />,
        activityLabel: "Cancelled",
        lifecycleStep: 0,
      };
    default:
      return {
        ...base,
        tone: "muted",
        activityLabel: b.statusLabel || b.status,
        lifecycleStep: 1,
      };
  }
}

// ── Vendor activity language ───────────────────────────────────────────
export function deriveVendorActivity(b: any): DerivedActivity {
  const money =
    b.vendorPayoutAmount != null
      ? `SAR ${Number(b.vendorPayoutAmount).toLocaleString()}`
      : null;
  const time = relativeTime(b.lastActivityAt);
  const unseen = !!b.hasUnseenUpdate;
  const base = { reference: b.bookingRef, activityTime: time, unseen, money };
  if (b.isActionable) {
    const revised = b.status === "ASSIGNMENT_RE_OFFERED";
    return {
      ...base,
      tone: "action",
      icon: <BellRing {...SM} />,
      activityLabel: revised
        ? "Revised offer — respond now"
        : "New offer — respond now",
      lifecycleStep: 1,
      lifecycleTotal: 3,
    };
  }
  if (b.hasPendingChange) {
    return {
      ...base,
      tone: "action",
      icon: <FilePenLine {...SM} />,
      activityLabel: "Change awaiting your review",
      lifecycleStep: 2,
      lifecycleTotal: 3,
    };
  }
  switch (b.status) {
    case "CONFIRMED":
      return {
        ...base,
        tone: "positive",
        icon: <CheckCircle2 {...SM} />,
        activityLabel: "Confirmed",
        lifecycleStep: 2,
        lifecycleTotal: 3,
      };
    case "IN_PROGRESS":
      return {
        ...base,
        tone: "positive",
        icon: <PlayCircle {...SM} />,
        activityLabel: "Trip in progress",
        lifecycleStep: 3,
        lifecycleTotal: 3,
      };
    case "COMPLETED":
      return {
        ...base,
        tone: "muted",
        icon: <CheckCircle2 {...SM} />,
        activityLabel: "Completed",
        lifecycleStep: 3,
        lifecycleTotal: 3,
      };
    case "CANCELLED":
      return {
        ...base,
        money: null,
        tone: "danger",
        icon: <XCircle {...SM} />,
        activityLabel: "Cancelled",
        lifecycleStep: 0,
        lifecycleTotal: 3,
      };
    default:
      return {
        ...base,
        tone: "active",
        icon: <Clock {...SM} />,
        activityLabel: b.statusLabel || "Awaiting offer",
        lifecycleStep: 1,
        lifecycleTotal: 3,
      };
  }
}

// ── Admin activity language (richest: uses attentionReason) ────────────
export function deriveAdminActivity(b: any): DerivedActivity {
  const money =
    b.amount != null && Number(b.amount) > 0
      ? `SAR ${Number(b.amount).toLocaleString()}`
      : null;
  const time = relativeTime(b.lastActivityAt);
  const unseen = !!b.isUnread;
  const reason = b.attentionReason as string | undefined;
  const base = { reference: b.bookingRef, activityTime: time, unseen, money };
  if (b.awaitingReassignment)
    return {
      ...base,
      tone: "action",
      icon: <RefreshCw {...SM} />,
      activityLabel: "Awaiting reassignment",
      lifecycleStep: 2,
    };
  switch (b.status) {
    case "AWAITING_PRICING":
      return {
        ...base,
        money: null,
        waitLabel: "Needs pricing",
        tone: "action",
        icon: <CircleDollarSign {...SM} />,
        activityLabel: reason || "New booking — needs pricing",
        lifecycleStep: 1,
      };
    case "PENDING":
      return {
        ...base,
        tone: "action",
        icon: <UserPlus {...SM} />,
        activityLabel: reason || "Priced — assign a vendor",
        lifecycleStep: 2,
      };
    case "ASSIGNMENT_OFFERED":
    case "ASSIGNMENT_RE_OFFERED":
      return {
        ...base,
        tone: "active",
        icon: <Clock {...SM} />,
        activityLabel: "Offer sent — awaiting vendor",
        lifecycleStep: 2,
      };
    case "CONFIRMED":
      return {
        ...base,
        tone: "positive",
        icon: <CheckCircle2 {...SM} />,
        activityLabel: "Confirmed",
        lifecycleStep: 3,
      };
    case "IN_PROGRESS":
      return {
        ...base,
        tone: "positive",
        icon: <PlayCircle {...SM} />,
        activityLabel: "Trip in progress",
        lifecycleStep: 4,
      };
    case "COMPLETED":
      return {
        ...base,
        tone: "muted",
        icon: <CheckCircle2 {...SM} />,
        activityLabel: "Completed",
        lifecycleStep: 4,
      };
    case "CANCELLED":
      return {
        ...base,
        money: null,
        tone: "danger",
        icon: <XCircle {...SM} />,
        activityLabel: "Cancelled",
        lifecycleStep: 0,
      };
    default:
      return {
        ...base,
        tone: "muted",
        activityLabel: reason || b.statusDisplay || b.status,
        lifecycleStep: 1,
      };
  }
}

export default BookingActivityRow;
