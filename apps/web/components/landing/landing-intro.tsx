"use client";

// ============================================
// components/landing-intro.tsx
//
// Full-screen cinematic brand reveal that plays once per browser
// session on the public landing page.
//
// Architecture note (important):
// The ENTIRE entrance — beam sweep, horizon stretch, brand fade-up —
// is driven by CSS @keyframes with `animation-delay`, NOT by React
// state transitions. This is deliberate. Earlier versions used
// setTimeout to advance a React state machine (enter → branding →
// outro), which had an intermittent failure mode: if anything
// interrupted the timer (Strict Mode's double effect-invocation in
// dev, HMR, tab visibility throttling, fast refresh), the brand
// block would never appear. The user would see the beams settled in
// the corners and a stuck black screen.
//
// CSS animations are immune to that whole class of bug — once the
// element is in the DOM, the browser owns the timeline. We only use
// React state for one thing: the outro trigger, which can fall back
// to a hard cut if its timer fails.
//
// Phases:
//   playing  → beams + horizon + brand block all rendered, CSS
//              animations handle the staggered entrance and the hold
//   exiting  → exit class added, everything fades together
//   gone     → unmounted
// ============================================

import { useEffect, useState } from "react";
import Logo from "../shared/logo";

type Phase = "playing" | "exiting" | "gone";

// Bump suffix to force replay for returning visitors after a redesign.
const SEEN_KEY = "luxdrive-intro-seen-v6";

// How long the intro is visible before the outro starts. This is the
// sum of the CSS animation delays (beam sweep ~1.1s, brand reveal
// after that, ~0.7s for the brand to settle, plus 1.4s hold).
const VISIBLE_MS = 3200;

// Outro duration — single coordinated fade-out for the whole overlay.
const OUTRO_MS = 800;

export default function LandingIntro() {
  // Phase initializes to "playing" — NOT "init" — so that SSR renders
  // the overlay into the initial HTML payload. Without this, the
  // landing page paints first and the overlay only mounts after
  // hydration, producing a visible "main page → intro → main page"
  // flash on first visit.
  //
  // Returning visitors: the overlay is still in the SSR'd HTML (the
  // server has no knowledge of sessionStorage), BUT an inline script
  // in app/layout.tsx runs synchronously before <body> paints and
  // adds data-intro-seen="1" to <html>. A CSS rule in the same layout
  // (also inline) hides the overlay based on that attribute. By the
  // time the browser paints, the overlay is gone — no flash.
  // React hydration then continues normally; the useEffect below
  // reads sessionStorage and dismounts the now-hidden overlay.
  const [phase, setPhase] = useState<Phase>("playing");

  // ============== INIT (mount only) ==============
  // Single useEffect with empty deps so it runs exactly once on
  // mount. Reads sessionStorage, checks reduced-motion, then either
  // skips to "gone" or schedules the outro + unmount.
  useEffect(() => {
    let shouldPlay = true;
    try {
      shouldPlay = sessionStorage.getItem(SEEN_KEY) !== "1";
    } catch {
      // sessionStorage throws in private/iframe mode — fall through
    }

    let reducedMotion = false;
    try {
      reducedMotion = window.matchMedia(
        "(prefers-reduced-motion: reduce)",
      ).matches;
    } catch {}

    if (!shouldPlay || reducedMotion) {
      try {
        sessionStorage.setItem(SEEN_KEY, "1");
      } catch {}
      setPhase("gone");
      return;
    }

    // Play the intro. Two timers, both fire-and-forget — but even if
    // they fail, the worst case is that the overlay stays up until
    // the user clicks to skip. There's no "stuck black screen"
    // failure mode any more because the entrance animations are CSS,
    // not state-driven.
    setPhase("playing");
    const tOutro = setTimeout(() => setPhase("exiting"), VISIBLE_MS);
    const tGone = setTimeout(() => {
      try {
        sessionStorage.setItem(SEEN_KEY, "1");
      } catch {}
      setPhase("gone");
    }, VISIBLE_MS + OUTRO_MS);

    return () => {
      clearTimeout(tOutro);
      clearTimeout(tGone);
    };
  }, []);

  // ============== CLICK TO SKIP ==============
  // Any tap during the intro fast-forwards to the exit. Two-step:
  // immediately start the fade, then unmount after the fade duration.
  const skip = () => {
    if (phase === "exiting" || phase === "gone") return;
    setPhase("exiting");
    setTimeout(() => {
      try {
        sessionStorage.setItem(SEEN_KEY, "1");
      } catch {}
      setPhase("gone");
    }, OUTRO_MS);
  };

  // Only "gone" produces no output now. "init" no longer exists —
  // the initial phase is "playing" so the overlay is in the SSR
  // payload from the first frame.
  if (phase === "gone") return null;

  const isExiting = phase === "exiting";

  return (
    <div
      id="landing-intro-overlay"
      role="presentation"
      onClick={skip}
      className={`fixed inset-0 z-[9999] bg-[#0a0a0a] flex items-center justify-center overflow-hidden cursor-pointer transition-opacity ease-out ${
        isExiting ? "opacity-0 pointer-events-none" : "opacity-100"
      }`}
      style={{ transitionDuration: `${OUTRO_MS}ms` }}
    >
      {/* ===== Headlight beams =====
          Sweep in via CSS keyframes, no React state involvement. */}
      <div className="absolute inset-0 pointer-events-none" aria-hidden>
        <div
          className="absolute top-1/2 -translate-y-1/2 w-[80vw] h-[80vw] left-[-40vw] beam-sweep-left"
          style={{
            background:
              "radial-gradient(ellipse at center, rgba(201,169,97,0.4) 0%, rgba(201,169,97,0.15) 30%, transparent 60%)",
            filter: "blur(40px)",
          }}
        />
        <div
          className="absolute top-1/2 -translate-y-1/2 w-[80vw] h-[80vw] right-[-40vw] beam-sweep-right"
          style={{
            background:
              "radial-gradient(ellipse at center, rgba(201,169,97,0.4) 0%, rgba(201,169,97,0.15) 30%, transparent 60%)",
            filter: "blur(40px)",
          }}
        />
        {/* Horizon line — CSS animation handles the stretch */}
        <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 h-px bg-gradient-to-r from-transparent via-[#C9A961] to-transparent horizon-stretch" />
      </div>

      {/* ===== Brand block =====
          ALWAYS rendered. CSS animation handles the fade-up after
          a 1100ms delay. This is the critical change from the prior
          version — the brand block no longer waits on a React state
          transition to become visible. If JS hangs, the browser still
          animates it in via the CSS timeline. */}
      <div
        className={`relative z-10 text-center px-6 brand-fade-up ${
          isExiting ? "brand-exit" : ""
        }`}
      >
        <p className="text-[10px] sm:text-xs tracking-[0.25em] sm:tracking-[0.3em] uppercase text-neutral-500 mb-3 sm:mb-4">
          Welcome to
        </p>
        <div className="flex justify-center">
          <Logo size="xl" showTagline linkTo={null} />
        </div>
        <div className="h-px w-12 sm:w-16 mx-auto bg-[#C9A961]/40 mt-5 sm:mt-6 mb-3 sm:mb-4" />

        <div className="flex flex-wrap items-center justify-center gap-x-2 sm:gap-x-3 gap-y-1 text-[10px] sm:text-[11px] tracking-[0.22em] sm:tracking-[0.35em] uppercase text-neutral-400">
          <span>Makkah</span>
          <span className="text-neutral-600">·</span>
          <span>Madinah</span>
          <span className="text-neutral-600">·</span>
          <span>Jeddah</span>
          <span className="text-neutral-600">·</span>
          <span>Riyadh</span>
        </div>

        <p className="font-cormorant italic text-xs sm:text-sm text-neutral-500 mt-3">
          The art of arrival
        </p>
      </div>

      {/* ===== Skip hint ===== */}
      <div
        className="absolute bottom-6 sm:bottom-10 left-1/2 -translate-x-1/2 text-[9px] sm:text-[10px] tracking-[0.25em] uppercase text-neutral-600 skip-hint"
        style={{ paddingBottom: "env(safe-area-inset-bottom, 0px)" }}
        aria-hidden
      >
        Tap to continue
      </div>

      <style jsx>{`
        /* ============== ENTRANCE KEYFRAMES ============== */

        @keyframes sweepInLeft {
          0% {
            transform: translateX(-30vw) translateY(-50%);
            opacity: 0;
          }
          40% {
            opacity: 1;
          }
          100% {
            transform: translateX(20vw) translateY(-50%);
            opacity: 1;
          }
        }
        @keyframes sweepInRight {
          0% {
            transform: translateX(30vw) translateY(-50%);
            opacity: 0;
          }
          40% {
            opacity: 1;
          }
          100% {
            transform: translateX(-20vw) translateY(-50%);
            opacity: 1;
          }
        }
        @keyframes horizonStretch {
          0% {
            width: 0;
            opacity: 0;
          }
          100% {
            width: 60vw;
            opacity: 1;
          }
        }
        @keyframes brandFadeUp {
          0% {
            opacity: 0;
            transform: translateY(16px) scale(0.95);
          }
          100% {
            opacity: 1;
            transform: translateY(0) scale(1);
          }
        }
        @keyframes hintFadeIn {
          0%,
          50% {
            opacity: 0;
          }
          100% {
            opacity: 1;
          }
        }

        /* ============== ENTRANCE TIMELINE ==============
           All animations have an absolute timeline anchored at t=0
           (component mount). Delays sequence them:
             0.0s  beams start sweeping in
             1.1s  beam sweep ends; horizon starts stretching
             1.1s  brand block starts fading up (same time as horizon)
             1.8s  brand reveal settled, hold begins
             ~2.5s skip hint becomes visible

           The 1.2s beam animation, the 700ms horizon stretch, and the
           700ms brand fade-up all USE forwards so they hold their
           final state until the exit class overrides them. */

        .beam-sweep-left {
          animation: sweepInLeft 1.2s cubic-bezier(0.16, 1, 0.3, 1) forwards;
        }
        .beam-sweep-right {
          animation: sweepInRight 1.2s cubic-bezier(0.16, 1, 0.3, 1) forwards;
        }
        .horizon-stretch {
          width: 0;
          opacity: 0;
          animation: horizonStretch 700ms ease-out 1100ms forwards;
        }
        .brand-fade-up {
          opacity: 0;
          animation: brandFadeUp 700ms ease-out 1100ms forwards;
        }
        .skip-hint {
          opacity: 0;
          animation: hintFadeIn 1200ms ease-out 1400ms forwards;
        }

        /* ============== EXIT ==============
           When the exit class is applied (driven by React state),
           animations are cancelled and replaced with transitions
           from the current visible state to the exit state. The
           !important is necessary to override the entrance
           animation's 'forwards' state.
           (Don't put backticks in this comment — they close the
           styled-jsx template literal early and TypeScript starts
           parsing the CSS as JavaScript.) */

        .brand-exit {
          animation: none !important;
          opacity: 0 !important;
          transform: scale(0.96) !important;
          transition:
            opacity ${OUTRO_MS}ms ease-out,
            transform ${OUTRO_MS}ms ease-out !important;
        }
      `}</style>
    </div>
  );
}
