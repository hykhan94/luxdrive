"use client";

// ============================================
// apps/web/components/profile/profile-section.tsx
// Shared card shell used by every section of the profile page (Company,
// Bank, Documents, MOU, Team). Guarantees consistent header, spacing, and
// dark-neutral palette. Design derived from the "Business Documents"
// reference: rounded neutral-900 card, luxury-gold icon chip, title + tiny
// subtitle, optional right-slot for a status pill.
// ============================================

import * as React from "react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export interface ProfileSectionProps {
  icon: LucideIcon;
  title: string;
  subtitle?: React.ReactNode;
  right?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}

export function ProfileSection({
  icon: Icon,
  title,
  subtitle,
  right,
  children,
  className,
}: ProfileSectionProps) {
  return (
    <section
      className={cn(
        "rounded-2xl border border-neutral-800 bg-neutral-900/60 p-5 sm:p-6",
        className,
      )}
    >
      <header className="mb-5 flex items-start justify-between gap-3">
        <div className="flex items-start gap-3 min-w-0">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-luxury-gold/30 bg-luxury-gold/10">
            <Icon className="h-5 w-5 text-luxury-gold" />
          </span>
          <div className="min-w-0">
            <h2 className="text-base font-semibold text-white sm:text-lg">
              {title}
            </h2>
            {subtitle && (
              <p className="mt-0.5 text-xs text-gray-400">{subtitle}</p>
            )}
          </div>
        </div>
        {right && <div className="shrink-0">{right}</div>}
      </header>
      {children}
    </section>
  );
}

/** Small status pill for the section header right-slot. */
export function SectionStatusPill({
  tone,
  children,
}: {
  tone: "complete" | "pending" | "attention";
  children: React.ReactNode;
}) {
  const tones = {
    complete: "border-emerald-500/40 bg-emerald-500/10 text-emerald-400",
    pending: "border-neutral-700 bg-neutral-800/80 text-gray-300",
    attention: "border-amber-500/40 bg-amber-500/10 text-amber-400",
  }[tone];
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-medium",
        tones,
      )}
    >
      {children}
    </span>
  );
}
