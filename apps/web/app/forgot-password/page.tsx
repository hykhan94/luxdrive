"use client";

// ============================================
// apps/web/app/forgot-password/page.tsx
// Public — request a password reset email.
// ============================================
//
// On submit, calls Better Auth's forget-password endpoint via
// authApi.forgetPassword(). Better Auth returns a generic success even
// for unknown emails (anti-enumeration). We surface a consistent
// "check your inbox" message regardless of whether the email actually
// exists in our system — both for UX and for security.
//
// If the email DOES exist, sendResetPassword callback in lib/auth.ts
// fires Resend with the reset link.

import { useState, FormEvent } from "react";
import Link from "next/link";
import { Mail, Loader2, ArrowLeft, CheckCircle } from "lucide-react";
import { EmailInput } from "@/components/ui/form-fields";
import { authApi, ApiError } from "@/lib/api";
import Logo from "@/components/shared/logo";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError("");

    if (!email.trim()) {
      setError("Email is required.");
      return;
    }

    setSubmitting(true);
    try {
      await authApi.forgetPassword(email.trim());
      // Always show the success state, even on (theoretical) failure
      // for non-existent emails — prevents enumeration.
      setSent(true);
    } catch (err) {
      // Genuine network/server errors do get surfaced — these aren't
      // "user not found" responses, they're "service down".
      setError(
        err instanceof ApiError
          ? err.message
          : "Could not send reset email. Please try again.",
      );
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#0a0a0a] text-white p-6">
      <div className="w-full max-w-md">
        {/* Brand — Logo component renders the LUX/DRIVE wordmark in
            the project's chosen typography (Outfit) and pairs it with
            the Cormorant italic tagline. Linked to home so the user
            has a non-modal way out. */}
        <div className="flex justify-center mb-8">
          <Logo size="lg" showTagline />
        </div>

        <div className="bg-[#0f0f0f] border border-neutral-800 rounded-2xl p-8">
          {!sent ? (
            <>
              <h2 className="text-xl font-medium text-white mb-1">
                Reset your password
              </h2>
              <p className="text-sm text-neutral-500 mb-6">
                Enter the email you use for LuxDrive and we&apos;ll send you a
                reset link.
              </p>

              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label className="block text-xs text-neutral-500 mb-1.5 uppercase tracking-wide">
                    Email
                  </label>
                  <EmailInput
                    value={email}
                    onChange={setEmail}
                    label=""
                    required
                  />
                </div>

                {error && (
                  <div className="p-3 bg-red-500/10 border border-red-500/30 rounded-lg text-red-400 text-xs">
                    {error}
                  </div>
                )}

                <button
                  type="submit"
                  disabled={submitting}
                  className="w-full py-3 bg-[#C9A961] text-black font-medium rounded-lg hover:bg-[#C9A961]/90 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {submitting ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Sending…
                    </>
                  ) : (
                    "Send Reset Link"
                  )}
                </button>
              </form>
            </>
          ) : (
            // ===== Success state =====
            // Same copy regardless of whether the email exists — we
            // don't want this page to function as an email-enumerator.
            <div className="text-center py-2">
              <div className="inline-flex items-center justify-center w-14 h-14 rounded-full bg-green-500/10 border border-green-500/30 mb-5">
                <CheckCircle className="w-7 h-7 text-green-400" />
              </div>
              <h2 className="text-xl font-medium text-white mb-2">
                Check your inbox
              </h2>
              <p className="text-sm text-neutral-400 leading-relaxed mb-2">
                If an account exists for{" "}
                <span className="text-neutral-200">{email}</span>, we&apos;ve
                sent a password reset link.
              </p>
              <p className="text-xs text-neutral-500 leading-relaxed">
                The link expires in 1 hour. Check your spam folder if you
                don&apos;t see it within a few minutes.
              </p>
            </div>
          )}
        </div>

        {/* Back to sign in */}
        <Link
          href="/"
          className="mt-6 flex items-center justify-center gap-2 text-sm text-neutral-500 hover:text-neutral-300 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to sign in
        </Link>
      </div>
    </div>
  );
}
