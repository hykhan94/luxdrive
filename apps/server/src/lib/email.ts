// ============================================
// apps/server/src/lib/email.ts
// LuxDrive email service — Resend wrapper
// ============================================
//
// Single entry point for all transactional email. Templates live next to
// the send function so we keep the from-address, subject line, and HTML
// body together — easier to audit and tweak than scattered per-callsite
// templates.
//
// Resend is configured via two env vars:
//   RESEND_API_KEY — secret key (re_...)
//   EMAIL_FROM     — sender. During dev this is 'LuxDrive <onboarding@resend.dev>',
//                    swap to a verified custom domain for production.
//   EMAIL_REPLY_TO — optional, where replies route (e.g. support@luxdrive.sa)
//   FRONTEND_URL   — base URL the invitation/reset links point at.
//
// If RESEND_API_KEY isn't set, send functions log + return success
// without actually sending so local dev / unit tests don't blow up. The
// production deploy MUST have the key set — verify via /health endpoint
// (suggested follow-up).

import { Resend } from "resend";

const apiKey = process.env.RESEND_API_KEY;
const resend = apiKey ? new Resend(apiKey) : null;

// Default sender. Used when no `from` override is passed.
const DEFAULT_FROM =
  process.env.EMAIL_FROM || "LuxDrive <onboarding@resend.dev>";
const DEFAULT_REPLY_TO = process.env.EMAIL_REPLY_TO;
const FRONTEND_URL = process.env.FRONTEND_URL || "http://localhost:3000";

// ============== LOW-LEVEL SEND ==============
//
// Wraps Resend's sdk in a uniform shape. Returns {ok, id} on success or
// {ok, error} on failure — callers don't need to know the SDK shape.
// Logs at info level on success and error level on failure so the
// outbound mail volume is observable in the server logs.

interface SendEmailParams {
  to: string | string[];
  subject: string;
  html: string;
  text?: string; // plain-text fallback for clients that don't render HTML
  from?: string;
  replyTo?: string;
}

interface SendEmailResult {
  ok: boolean;
  id?: string;
  error?: string;
}

export async function sendEmail(
  params: SendEmailParams,
): Promise<SendEmailResult> {
  if (!resend) {
    console.warn(
      `[email] RESEND_API_KEY not set — skipping send to ${params.to}: "${params.subject}"`,
    );
    return { ok: true, id: "dev-noop" };
  }

  try {
    const result = await resend.emails.send({
      from: params.from || DEFAULT_FROM,
      to: params.to,
      subject: params.subject,
      html: params.html,
      text: params.text,
      replyTo: params.replyTo || DEFAULT_REPLY_TO,
    });

    if (result.error) {
      console.error(`[email] Resend error → ${params.to}:`, result.error);
      return { ok: false, error: result.error.message };
    }

    console.log(
      `[email] sent → ${params.to}: "${params.subject}" (id=${result.data?.id})`,
    );
    return { ok: true, id: result.data?.id };
  } catch (err: any) {
    console.error(`[email] threw → ${params.to}:`, err.message);
    return { ok: false, error: err.message };
  }
}

// ============== SHARED HTML SHELL ==============
//
// One branded shell that all transactional emails plug into. Keeps the
// header/footer/styling consistent — when LuxDrive's brand evolves, we
// update one place.
//
// CSS is inlined because Gmail strips <style> from <head>. Tables are
// used for layout because Outlook desktop still renders with the Word
// engine, which does not support flexbox or grid. Yes, in 2026.

function renderShell(opts: {
  preheader: string; // first ~80 chars Gmail/Outlook shows in the inbox preview
  title: string;
  bodyHtml: string;
  ctaLabel?: string;
  ctaUrl?: string;
  footerNote?: string;
}): string {
  const { preheader, title, bodyHtml, ctaLabel, ctaUrl, footerNote } = opts;
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${title}</title>
  </head>
  <body style="margin:0;padding:0;background-color:#0a0a0a;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#e5e5e5;">
    <!-- Preheader: invisible but Gmail uses it as the inbox preview -->
    <div style="display:none;font-size:1px;color:#0a0a0a;line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;">${preheader}</div>

    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background-color:#0a0a0a;">
      <tr>
        <td align="center" style="padding:40px 20px;">

          <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="600" style="max-width:600px;background-color:#171717;border:1px solid #262626;border-radius:16px;overflow:hidden;">

            <!-- Header -->
            <tr>
              <td style="padding:32px 40px;border-bottom:1px solid #262626;text-align:center;">
                <div style="font-size:24px;font-weight:700;letter-spacing:0.5px;color:#c8a961;">LuxDrive</div>
                <div style="margin-top:4px;font-size:11px;letter-spacing:2px;text-transform:uppercase;color:#737373;">Luxury Mobility · KSA</div>
              </td>
            </tr>

            <!-- Body -->
            <tr>
              <td style="padding:40px;color:#e5e5e5;font-size:15px;line-height:1.6;">
                ${bodyHtml}
                ${
                  ctaUrl && ctaLabel
                    ? `
                <div style="margin:32px 0;text-align:center;">
                  <a href="${ctaUrl}" style="display:inline-block;padding:14px 32px;background-color:#c8a961;color:#0a0a0a;text-decoration:none;font-weight:600;border-radius:10px;font-size:15px;">${ctaLabel}</a>
                </div>
                <p style="font-size:12px;color:#737373;line-height:1.5;margin:24px 0 0;">If the button above doesn't work, copy and paste this link into your browser:<br/><span style="color:#a3a3a3;word-break:break-all;">${ctaUrl}</span></p>
                `
                    : ""
                }
              </td>
            </tr>

            <!-- Footer -->
            <tr>
              <td style="padding:24px 40px 32px;border-top:1px solid #262626;font-size:12px;color:#737373;line-height:1.5;">
                ${footerNote || ""}
                <p style="margin:12px 0 0;">© ${new Date().getFullYear()} LuxDrive · ShaikhTech</p>
              </td>
            </tr>

          </table>

        </td>
      </tr>
    </table>
  </body>
</html>`;
}

// ============== TEMPLATE: VENDOR / PARTNER INVITATION ==============

export async function sendInvitationEmail(opts: {
  to: string;
  companyName: string;
  inviteToken: string;
  type: "vendor" | "partner";
  expiresInHours: number;
}): Promise<SendEmailResult> {
  const { to, companyName, inviteToken, type, expiresInHours } = opts;
  const inviteUrl = `${FRONTEND_URL}/invite/${type}/${inviteToken}`;
  const roleLabel = type === "vendor" ? "Vendor" : "Partner";

  const bodyHtml = `
    <h1 style="margin:0 0 8px;font-size:22px;font-weight:600;color:#fafafa;">Welcome to LuxDrive</h1>
    <p style="margin:0 0 20px;color:#a3a3a3;">${companyName} has been invited to join LuxDrive as a ${roleLabel}.</p>

    <p style="margin:0 0 12px;color:#d4d4d4;">Click the button below to set up your account. You'll create a password and then complete your company profile — once you submit it, our team will review and approve your account.</p>

    <p style="margin:24px 0 0;font-size:13px;color:#a3a3a3;">This invitation expires in <strong style="color:#c8a961;">${expiresInHours} hours</strong>. If it expires before you act, contact the admin who invited you to request a fresh link.</p>
  `;

  return sendEmail({
    to,
    subject: `You're invited to join LuxDrive as a ${roleLabel}`,
    html: renderShell({
      preheader: `${companyName} — your invitation to join LuxDrive`,
      title: "LuxDrive Invitation",
      bodyHtml,
      ctaLabel: "Accept Invitation",
      ctaUrl: inviteUrl,
      footerNote:
        "If you weren't expecting this invitation, you can safely ignore this email — the link will expire on its own.",
    }),
    text: `Welcome to LuxDrive\n\n${companyName} has been invited to join LuxDrive as a ${roleLabel}.\n\nAccept the invitation: ${inviteUrl}\n\nThis link expires in ${expiresInHours} hours.\n\nIf you weren't expecting this, ignore this email.`,
  });
}

// ============== TEMPLATE: PASSWORD RESET ==============

export async function sendPasswordResetEmail(opts: {
  to: string;
  resetUrl: string;
  userName?: string;
}): Promise<SendEmailResult> {
  const { to, resetUrl, userName } = opts;
  const greeting = userName ? `Hi ${userName.split(" ")[0]},` : "Hi,";

  const bodyHtml = `
    <h1 style="margin:0 0 8px;font-size:22px;font-weight:600;color:#fafafa;">Reset your password</h1>
    <p style="margin:0 0 20px;color:#a3a3a3;">${greeting}</p>

    <p style="margin:0 0 12px;color:#d4d4d4;">We received a request to reset your LuxDrive password. Click the button below to choose a new one.</p>

    <p style="margin:24px 0 0;font-size:13px;color:#a3a3a3;">This link expires in <strong style="color:#c8a961;">1 hour</strong>. If you didn't request a password reset, you can safely ignore this email — your password won't change unless you click the link and set a new one.</p>
  `;

  return sendEmail({
    to,
    subject: "Reset your LuxDrive password",
    html: renderShell({
      preheader: "Reset your LuxDrive password",
      title: "Reset Password",
      bodyHtml,
      ctaLabel: "Reset Password",
      ctaUrl: resetUrl,
      footerNote:
        "If you didn't request this, you can safely ignore this email.",
    }),
    text: `${greeting}\n\nWe received a request to reset your LuxDrive password.\n\nReset password: ${resetUrl}\n\nThis link expires in 1 hour. If you didn't request this, ignore this email.`,
  });
}

// ============== TEMPLATE: WELCOME (post-onboarding) ==============
// Not wired in this commit; reserved for the moment admin approves a
// vendor/partner. Keeps all email templates centralized.

export async function sendApprovalEmail(opts: {
  to: string;
  companyName: string;
  portalUrl: string;
  type: "vendor" | "partner";
}): Promise<SendEmailResult> {
  const { to, companyName, portalUrl, type } = opts;
  const roleLabel = type === "vendor" ? "Vendor" : "Partner";

  const bodyHtml = `
    <h1 style="margin:0 0 8px;font-size:22px;font-weight:600;color:#fafafa;">You're approved</h1>
    <p style="margin:0 0 20px;color:#a3a3a3;">${companyName}, your ${roleLabel.toLowerCase()} account has been approved.</p>
    <p style="margin:0 0 12px;color:#d4d4d4;">You now have full access to LuxDrive. Sign in to start ${type === "vendor" ? "managing your fleet and bookings" : "creating bookings for your customers"}.</p>
  `;

  return sendEmail({
    to,
    subject: `Welcome to LuxDrive — ${companyName} is approved`,
    html: renderShell({
      preheader: `${companyName} is now approved on LuxDrive`,
      title: "Approval Confirmation",
      bodyHtml,
      ctaLabel: "Open Portal",
      ctaUrl: portalUrl,
    }),
    text: `${companyName}, your LuxDrive ${roleLabel.toLowerCase()} account has been approved.\n\nOpen portal: ${portalUrl}`,
  });
}
