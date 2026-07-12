// TODO(shared-profile): Duplicated verbatim from components/partner/profile/saving-indicator.tsx
// Consolidate into components/shared/profile/ once both partner and vendor
// flows are stable in production (target: after 2 weeks of vendor prod use).

"use client";

// ============================================
// apps/web/components/vendor/profile/saving-indicator.tsx
// Per-field autosave status pill: "Saving… / Saved / <error>".
//
// Purely presentational — it renders whatever FieldStatus the
// useFieldAutosave hook hands it. The hook owns the 2s "Saved" TTL (it flips
// the field back to `idle`); this component just fades the "Saved" chip out
// when that happens. Shared by both the vendor and vendor profiles.
// ============================================

import * as React from "react";
import { AlertCircle, Check, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import type { FieldSaveState, FieldStatus } from "@/hooks/use-field-autosave";

export interface SavingIndicatorProps {
  status: FieldStatus;
  className?: string;
}

// Should match the CSS transition duration below.
const FADE_OUT_MS = 220;

export function SavingIndicator({ status, className }: SavingIndicatorProps) {
  const { state, error } = status;

  // Keep the last non-idle content mounted briefly so it can fade out when the
  // hook flips the field back to `idle` after the Saved TTL elapses.
  const [shown, setShown] = React.useState<{
    state: FieldSaveState;
    error?: string;
  } | null>(state === "idle" ? null : { state, error });
  const [visible, setVisible] = React.useState(state !== "idle");

  React.useEffect(() => {
    if (state !== "idle") {
      setShown({ state, error });
      setVisible(true);
      return;
    }
    // fade out, then unmount
    setVisible(false);
    const t = setTimeout(() => setShown(null), FADE_OUT_MS);
    return () => clearTimeout(t);
  }, [state, error]);

  if (!shown || shown.state === "idle") return null;

  const tone =
    shown.state === "saved"
      ? "text-emerald-500"
      : shown.state === "error"
        ? "text-destructive"
        : "text-muted-foreground";

  return (
    <span
      role="status"
      aria-live="polite"
      className={cn(
        "inline-flex items-center gap-1 text-xs font-medium transition-opacity duration-200",
        visible ? "opacity-100" : "opacity-0",
        tone,
        className,
      )}
    >
      {shown.state === "saving" && (
        <>
          <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
          Saving…
        </>
      )}
      {shown.state === "saved" && (
        <>
          <Check className="h-3.5 w-3.5" aria-hidden="true" />
          Saved
        </>
      )}
      {shown.state === "error" && (
        <>
          <AlertCircle className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          <span>{shown.error ?? "Couldn't save"}</span>
        </>
      )}
    </span>
  );
}
