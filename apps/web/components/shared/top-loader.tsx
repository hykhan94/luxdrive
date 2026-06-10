"use client";

import { AppProgressBar as ProgressBar } from "next-nprogress-bar";

// ============================================
// Top loading bar
// ============================================
// Shows a thin gold progress bar at the top of the viewport during
// route navigations (the YouTube-style loader). Auto-detects router
// transitions in the Next.js App Router via internal events — no
// manual triggering needed.
//
// Color matches the LuxDrive brand gold (#C9A961). Height kept at 3px
// to be visible without being intrusive. Spinner is disabled in favor
// of the bar alone — cleaner, more editorial.
// ============================================

export function TopLoader() {
  return (
    <ProgressBar
      height="3px"
      color="#C9A961"
      options={{ showSpinner: false }}
      shallowRouting
    />
  );
}
