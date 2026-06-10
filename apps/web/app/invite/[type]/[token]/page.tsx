"use client";

// ============================================
// apps/web/app/invite/[type]/[token]/page.tsx
// Public invitation acceptance — welcome animation + password form.
// ============================================
//
// Route: /invite/vendor/<token>  OR  /invite/partner/<token>
//
// Flow:
//   1. On mount, GET /api/v1/invitation/:type/:token validates the token
//      and returns { companyName, email }.
//   2. If invalid/expired/used, show the matching error state.
//   3. If valid, run the headlight-reveal animation, then show the
//      password setup form pre-filled with companyName + email.
//   4. On submit, POST /api/v1/invitation/:type/:token/accept with the
//      password + name. Backend creates the credential, signs the user
//      in (session cookie), returns redirectTo. We push the router.

import { useEffect, useState, FormEvent } from "react";
import { useParams } from "next/navigation";
import {
  Loader2,
  Lock,
  Eye,
  EyeOff,
  User,
  Phone,
  AlertTriangle,
  Mail,
  CheckCircle,
} from "lucide-react";
import { invitationApi, ApiError } from "@/lib/api";
import { useNotification } from "@/lib/notification-context";
import Logo from "@/components/shared/logo";
import { PhoneInput, EmailInput } from "@/components/ui/form-fields";

// ============== TYPES ==============

interface InvitationData {
  type: "vendor" | "partner";
  companyName: string;
  email: string;
  expiresAt: string | null;
}

type LoadState =
  | { kind: "loading" }
  | { kind: "ready"; data: InvitationData }
  | { kind: "error"; code: string; message: string };

export default function InviteAcceptPage() {
  const params = useParams<{ type: string; token: string }>();
  const { showNotification } = useNotification();

  const type = params.type as "vendor" | "partner";
  const token = params.token;

  const [state, setState] = useState<LoadState>({ kind: "loading" });

  // The reveal animation runs *after* we know the token is valid —
  // showing it for a forged token would be a lie and waste 2.5s of
  // someone's life. So we gate the animation on state.kind === "ready".
  const [animationStage, setAnimationStage] = useState<
    "headlights" | "branding" | "form"
  >("headlights");

  // Form state
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState("");

  // ============== LOAD INVITATION ==============

  useEffect(() => {
    if (!type || !token) return;
    if (type !== "vendor" && type !== "partner") {
      setState({
        kind: "error",
        code: "BAD_TYPE",
        message: "Invalid invitation link.",
      });
      return;
    }

    let mounted = true;
    (async () => {
      try {
        const res = await invitationApi.get(type, token);
        if (!mounted) return;
        setState({ kind: "ready", data: res.data });
      } catch (err) {
        if (!mounted) return;
        if (err instanceof ApiError) {
          const code = (err.data as string) || "INVALID";
          setState({ kind: "error", code, message: err.message });
        } else {
          setState({
            kind: "error",
            code: "NETWORK",
            message: "Could not reach the invitation service. Try again.",
          });
        }
      }
    })();
    return () => {
      mounted = false;
    };
  }, [type, token]);

  // ============== ANIMATION SEQUENCING ==============
  //
  // Three stages timed by setTimeout. Cleared if the user clicks to
  // skip — we honor reduced-motion preference by collapsing to a 200ms
  // fade.

  useEffect(() => {
    if (state.kind !== "ready") return;

    const reducedMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;

    if (reducedMotion) {
      // Skip the cinematic — go straight to form after a beat.
      const t = setTimeout(() => setAnimationStage("form"), 250);
      return () => clearTimeout(t);
    }

    // Headlights sweeping in → 1.0s
    const t1 = setTimeout(() => setAnimationStage("branding"), 1000);
    // Branding settles → form fades in → 2.2s total
    const t2 = setTimeout(() => setAnimationStage("form"), 2200);

    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
    };
  }, [state.kind]);

  // Click-to-skip — fast-forward to the form
  const skipAnimation = () => {
    if (state.kind === "ready" && animationStage !== "form") {
      setAnimationStage("form");
    }
  };

  // ============== SUBMIT ==============

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setFormError("");

    if (state.kind !== "ready") return;
    if (!firstName.trim() || !lastName.trim()) {
      setFormError("First name and last name are required.");
      return;
    }
    if (password.length < 8) {
      setFormError("Password must be at least 8 characters.");
      return;
    }
    if (password !== confirmPassword) {
      setFormError("Passwords do not match.");
      return;
    }

    setSubmitting(true);
    try {
      const res = await invitationApi.accept(type, token, {
        password,
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        phone: phone.trim() || undefined,
      });

      showNotification(
        "success",
        `Welcome to LuxDrive, ${state.data.companyName}!`,
      );

      // Backend established a session via auto sign-in (Set-Cookie in
      // the accept response). We use a hard navigation rather than
      // router.push because:
      //   1. The auth context was initialized when this page mounted,
      //      before the session existed. router.push keeps that stale
      //      context alive — the destination dashboard would see
      //      isAuthenticated=false and bounce to login OR render a
      //      blank page that only resolves on a manual refresh.
      //   2. A full document load re-runs AuthProvider's mount-time
      //      session check WITH the cookie present, so the dashboard
      //      mounts already-authenticated.
      // The momentary white flash from window.location is an
      // acceptable trade for never seeing the "doesn't load until I
      // refresh" bug again.
      const redirect =
        res.data?.redirectTo ||
        (type === "vendor"
          ? "/dashboard/vendor?tab=profile"
          : "/dashboard/partner?tab=profile");
      window.location.href = redirect;
    } catch (err) {
      setFormError(
        err instanceof ApiError
          ? err.message
          : "Could not complete registration. Please try again.",
      );
      setSubmitting(false);
    }
  };

  // ============== RENDER ==============

  if (state.kind === "loading") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#0a0a0a]">
        <Loader2 className="w-8 h-8 text-[#C9A961] animate-spin" />
      </div>
    );
  }

  if (state.kind === "error") {
    return <InvitationErrorScreen code={state.code} message={state.message} />;
  }

  // state.kind === "ready"
  return (
    <div
      className="min-h-screen bg-[#0a0a0a] text-white relative overflow-hidden flex items-center justify-center p-6"
      onClick={skipAnimation}
    >
      {/* ===== Headlight beams =====
          Two conic gradients positioned off-screen left and right,
          sweep inward via a CSS transform on the wrapper, then converge.
          We DON'T use background-image on the body itself — instead
          dedicated divs so we can fade/transform them independently
          from the branding layer above. */}
      <div
        className={`absolute inset-0 pointer-events-none transition-opacity duration-1000 ${
          animationStage === "form" ? "opacity-0" : "opacity-100"
        }`}
        aria-hidden
      >
        <div
          className="absolute top-1/2 -translate-y-1/2 w-[80vw] h-[80vw] left-[-40vw] beam-sweep-left"
          style={{
            background:
              "radial-gradient(ellipse at center, rgba(201,169,97,0.35) 0%, rgba(201,169,97,0.12) 30%, transparent 60%)",
            filter: "blur(40px)",
          }}
        />
        <div
          className="absolute top-1/2 -translate-y-1/2 w-[80vw] h-[80vw] right-[-40vw] beam-sweep-right"
          style={{
            background:
              "radial-gradient(ellipse at center, rgba(201,169,97,0.35) 0%, rgba(201,169,97,0.12) 30%, transparent 60%)",
            filter: "blur(40px)",
          }}
        />
        {/* The gold horizon line — only visible briefly between
            headlights closing and branding fading in. */}
        <div
          className={`absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 h-px bg-gradient-to-r from-transparent via-[#C9A961] to-transparent transition-all duration-700 ${
            animationStage === "headlights" ? "w-0" : "w-[60vw]"
          }`}
        />
      </div>

      {/* ===== Centered content stack ===== */}
      <div className="relative w-full max-w-md z-10">
        {/* Brand block — slides up + scales into final position
            when animation enters "branding" stage. We center the Logo
            component (which already pairs the wordmark with the
            Cormorant tagline) and add the welcome label above + a
            divider + the company name below. */}
        <div
          className={`text-center transition-all duration-700 ${
            animationStage === "headlights"
              ? "opacity-0 translate-y-4 scale-95"
              : "opacity-100 translate-y-0 scale-100"
          } ${animationStage === "form" ? "mb-8" : "mb-0"}`}
        >
          <p className="text-xs tracking-[0.3em] uppercase text-neutral-500 mb-4">
            Welcome to
          </p>
          <div className="flex justify-center">
            <Logo size="xl" showTagline linkTo={null} />
          </div>
          <div className="h-px w-16 mx-auto bg-[#C9A961]/40 mt-6 mb-4" />
          <p className="text-lg text-white font-light">
            {state.data.companyName}
          </p>
          <p className="text-sm text-neutral-500 mt-1">
            You&apos;ve been invited as a{" "}
            <span className="text-neutral-300 capitalize">{type}</span>
          </p>
        </div>

        {/* Form block — fades in once animation stage is "form".
            We keep it mounted but hidden via opacity to avoid layout
            shift during the transition. */}
        <div
          className={`transition-all duration-500 ${
            animationStage === "form"
              ? "opacity-100 translate-y-0 pointer-events-auto"
              : "opacity-0 translate-y-3 pointer-events-none"
          }`}
        >
          <form
            onSubmit={handleSubmit}
            onClick={(e) => e.stopPropagation()}
            className="bg-[#0f0f0f] border border-neutral-800 rounded-2xl p-6 space-y-4 mt-6"
          >
            {/* Email — read-only, just shows recipient who they are */}
            <div>
              <label className="block text-xs text-neutral-500 mb-1.5 uppercase tracking-wide">
                Email
              </label>
              <EmailInput
                value={state.data.email}
                onChange={() => {}}
                label=""
                disabled
              />
            </div>

            {/* Name fields side-by-side on >=sm */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-neutral-500 mb-1.5 uppercase tracking-wide">
                  First Name
                </label>
                <div className="relative">
                  <User className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-500" />
                  <input
                    type="text"
                    value={firstName}
                    onChange={(e) => setFirstName(e.target.value)}
                    required
                    autoFocus
                    placeholder="First"
                    className="w-full pl-11 pr-3 py-2.5 bg-neutral-900 border border-neutral-800 rounded-lg text-white text-sm placeholder-neutral-600 focus:outline-none focus:border-[#C9A961] transition-colors"
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs text-neutral-500 mb-1.5 uppercase tracking-wide">
                  Last Name
                </label>
                <input
                  type="text"
                  value={lastName}
                  onChange={(e) => setLastName(e.target.value)}
                  required
                  placeholder="Last"
                  className="w-full px-3 py-2.5 bg-neutral-900 border border-neutral-800 rounded-lg text-white text-sm placeholder-neutral-600 focus:outline-none focus:border-[#C9A961] transition-colors"
                />
              </div>
            </div>

            {/* Phone — optional */}
            <div>
              <label className="block text-xs text-neutral-500 mb-1.5 uppercase tracking-wide">
                Phone{" "}
                <span className="text-neutral-600 normal-case">(optional)</span>
              </label>
              <PhoneInput value={phone} onChange={setPhone} label="" />
            </div>

            {/* Password */}
            <div>
              <label className="block text-xs text-neutral-500 mb-1.5 uppercase tracking-wide">
                Password
              </label>
              <div className="relative">
                <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-500" />
                <input
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  placeholder="At least 8 characters"
                  className="w-full pl-11 pr-12 py-2.5 bg-neutral-900 border border-neutral-800 rounded-lg text-white text-sm placeholder-neutral-600 focus:outline-none focus:border-[#C9A961] transition-colors"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-neutral-500 hover:text-neutral-300"
                  aria-label={showPassword ? "Hide password" : "Show password"}
                >
                  {showPassword ? (
                    <EyeOff className="w-4 h-4" />
                  ) : (
                    <Eye className="w-4 h-4" />
                  )}
                </button>
              </div>
            </div>

            {/* Confirm password */}
            <div>
              <label className="block text-xs text-neutral-500 mb-1.5 uppercase tracking-wide">
                Confirm Password
              </label>
              <div className="relative">
                <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-500" />
                <input
                  type={showPassword ? "text" : "password"}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  required
                  placeholder="Re-enter password"
                  className="w-full pl-11 pr-4 py-2.5 bg-neutral-900 border border-neutral-800 rounded-lg text-white text-sm placeholder-neutral-600 focus:outline-none focus:border-[#C9A961] transition-colors"
                />
              </div>
            </div>

            {formError && (
              <div className="p-3 bg-red-500/10 border border-red-500/30 rounded-lg text-red-400 text-xs">
                {formError}
              </div>
            )}

            <button
              type="submit"
              disabled={submitting}
              className="w-full py-3 bg-[#C9A961] text-black font-medium rounded-lg hover:bg-[#C9A961]/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {submitting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Setting up your account…
                </>
              ) : (
                "Create Account & Continue"
              )}
            </button>

            <p className="text-[11px] text-neutral-600 text-center leading-relaxed pt-1">
              By continuing you agree to LuxDrive&apos;s Terms of Service and
              Privacy Policy.
            </p>
          </form>
        </div>
      </div>

      {/* ===== Animation keyframes =====
          Keep all motion in inline <style> so the file is self-contained
          and we don't pollute globals.css with one-off route animations.
          Both keyframes use cubic-bezier ease-out so the beams accelerate
          in then settle — feels mechanical, not bouncy. */}
      <style jsx>{`
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
        .beam-sweep-left {
          animation: sweepInLeft 1.2s cubic-bezier(0.16, 1, 0.3, 1) forwards;
        }
        .beam-sweep-right {
          animation: sweepInRight 1.2s cubic-bezier(0.16, 1, 0.3, 1) forwards;
        }
      `}</style>
    </div>
  );
}

// ============== ERROR STATES ==============
//
// Three distinct error UIs — bad token, expired, already used — each
// with copy that points the user at the right next step.

function InvitationErrorScreen({
  code,
  message,
}: {
  code: string;
  message: string;
}) {
  const { title, body, hint, icon, tone } = (() => {
    switch (code) {
      case "INVITATION_EXPIRED":
        return {
          title: "Invitation Expired",
          body: message,
          hint: "Invitations expire 72 hours after they're sent. Ask the admin who invited you to send a fresh link.",
          icon: AlertTriangle,
          tone: "amber" as const,
        };
      case "INVITATION_ALREADY_USED":
        return {
          title: "Already Accepted",
          body: message,
          hint: "If this is your account, sign in with the email and password you set previously.",
          icon: CheckCircle,
          tone: "green" as const,
        };
      default:
        return {
          title: "Invitation Not Found",
          body:
            message ||
            "We couldn't find an invitation matching this link. The URL may be incomplete or incorrect.",
          hint: "Double-check the link in your email, or ask the admin who invited you for a fresh one.",
          icon: AlertTriangle,
          tone: "red" as const,
        };
    }
  })();

  const Icon = icon;
  const toneClasses = {
    amber: "text-amber-400 bg-amber-500/10 border-amber-500/30",
    green: "text-green-400 bg-green-500/10 border-green-500/30",
    red: "text-red-400 bg-red-500/10 border-red-500/30",
  }[tone];

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#0a0a0a] text-white p-6">
      <div className="max-w-md w-full bg-[#0f0f0f] border border-neutral-800 rounded-2xl p-8 text-center">
        <div
          className={`inline-flex items-center justify-center w-14 h-14 rounded-full border ${toneClasses} mb-5`}
        >
          <Icon className="w-7 h-7" />
        </div>
        <h1 className="text-xl font-medium text-white mb-2">{title}</h1>
        <p className="text-sm text-neutral-400 mb-4 leading-relaxed">{body}</p>
        <p className="text-xs text-neutral-500 leading-relaxed mb-6">{hint}</p>
        <a
          href="/"
          className="inline-block w-full py-2.5 bg-neutral-900 border border-neutral-700 rounded-lg text-neutral-300 text-sm hover:border-neutral-600 transition-colors"
        >
          Return to Home
        </a>
      </div>
    </div>
  );
}
