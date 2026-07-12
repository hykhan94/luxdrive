// TODO(shared-profile): Duplicated verbatim from components/partner/profile/unsaved-changes-guard.tsx
// Consolidate into components/shared/profile/ once both partner and vendor
// flows are stable in production (target: after 2 weeks of vendor prod use).

"use client";

// ============================================
// apps/web/components/vendor/profile/unsaved-changes-guard.tsx
// Two-layer "don't lose in-progress work" guard for the profile.
//
//   Layer 2 (tab/window close, refresh): native `beforeunload` prompt.
//   Layer 1 (in-app navigation): intercepts internal link/anchor clicks and
//            shows a confirm modal before letting the SPA route away.
//
// Both layers are inert unless `when` is true, so the panel drives the policy
// (e.g. when there are in-flight autosaves / uploads). Drop it anywhere inside
// the profile subtree: <UnsavedChangesGuard when={...} />.
//
// KNOWN GAP: the browser Back/Forward buttons are NOT intercepted. The App
// Router exposes no navigation-abort event, and the history-rewrite tricks
// that fake one are fragile and can corrupt Next's router state, so they're
// deliberately omitted. `beforeunload` still covers a Back that exits the app
// entirely; for in-SPA Back interception use a dedicated lib
// (e.g. next-navigation-guard).
// ============================================

import * as React from "react";
import { useRouter } from "next/navigation";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

export interface UnsavedChangesGuardProps {
  when: boolean;
  title?: string;
  description?: string;
  confirmLabel?: string;
  cancelLabel?: string;
}

export function UnsavedChangesGuard({
  when,
  title,
  description,
  confirmLabel,
  cancelLabel,
}: UnsavedChangesGuardProps) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const pendingHrefRef = React.useRef<string | null>(null);
  const bypassRef = React.useRef(false);

  // Keep the latest `when` for the long-lived listeners without re-binding them.
  const whenRef = React.useRef(when);
  whenRef.current = when;

  // Layer 2 — native tab close / refresh.
  React.useEffect(() => {
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      if (!whenRef.current) return;
      e.preventDefault();
      e.returnValue = ""; // Chrome requires a returnValue to be set.
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, []);

  // Layer 1 — intercept in-app link/anchor navigation (capture phase).
  React.useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (!whenRef.current || bypassRef.current) return;
      // Let modified clicks, non-primary buttons, and already-handled clicks through.
      if (
        e.defaultPrevented ||
        e.button !== 0 ||
        e.metaKey ||
        e.ctrlKey ||
        e.shiftKey ||
        e.altKey
      ) {
        return;
      }
      const anchor = (e.target as HTMLElement | null)?.closest?.("a");
      if (!anchor) return;
      const href = anchor.getAttribute("href");
      if (
        !href ||
        anchor.target === "_blank" ||
        anchor.hasAttribute("download")
      ) {
        return;
      }

      let url: URL;
      try {
        url = new URL(href, window.location.href);
      } catch {
        return;
      }
      if (url.origin !== window.location.origin) return; // external
      if (url.href === window.location.href) return; // same location
      // in-page hash on the current path — not a real navigation
      if (url.pathname === window.location.pathname && url.hash) return;

      e.preventDefault();
      pendingHrefRef.current = url.pathname + url.search + url.hash;
      setOpen(true);
    };
    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
  }, []);

  const confirmLeave = () => {
    setOpen(false);
    const href = pendingHrefRef.current;
    pendingHrefRef.current = null;
    if (!href) return;
    // router.push is not an anchor click, so the interceptor won't re-catch it;
    // bypass is belt-and-suspenders in case something re-enters synchronously.
    bypassRef.current = true;
    router.push(href);
    setTimeout(() => {
      bypassRef.current = false;
    }, 0);
  };

  const cancelLeave = () => {
    setOpen(false);
    pendingHrefRef.current = null;
  };

  return (
    <AlertDialog
      open={open}
      onOpenChange={(o) => {
        if (!o) cancelLeave();
      }}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title ?? "Leave this page?"}</AlertDialogTitle>
          <AlertDialogDescription>
            {description ??
              "You have changes in progress here. If you leave now, anything still being saved may not be kept."}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={cancelLeave}>
            {cancelLabel ?? "Stay"}
          </AlertDialogCancel>
          <AlertDialogAction onClick={confirmLeave}>
            {confirmLabel ?? "Leave"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
