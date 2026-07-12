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
// Two visual systems live here on purpose:
//
//   EXTERNAL SHELL (`renderExternalShell`) — for emails going to
//   customers, partners, vendors, prospects. Editorial: LUX/DRIVE
//   wordmark, gold hairline, Playfair-styled title (Georgia fallback),
//   real social icons, and a proper "follow us" footer. Anything the
//   recipient sees as a first impression uses this.
//
//   ADMIN SHELL (`renderAdminShell`) — for internal ops notifications
//   going to info@luxdriveksa.com. Utility: compact one-line header,
//   monospaced booking ref, dense two-column details table, no social
//   row, single-line footer. Optimised for the admin scanning the
//   inbox and triaging — the subject line does most of the work.
//
// Both use the same brand palette (dark card, gold accents) so they read
// as LuxDrive, but they behave differently for the two audiences.
//
// Env vars:
//   RESEND_API_KEY           — Resend secret (re_...). Missing → dev noop.
//   EMAIL_FROM               — Sender for external mail. e.g. "LuxDrive <no-reply@luxdriveksa.com>"
//   EMAIL_REPLY_TO           — Optional default reply-to.
//   FRONTEND_URL             — Base URL used in CTA links (invitation, reset, etc.)
//   ADMIN_NOTIFICATION_EMAIL — Recipient for internal ops emails. e.g. "info@luxdriveksa.com"
//   BOOKINGS_EMAIL_FROM      — Optional override for admin emails.
//                              Defaults to "LuxDrive Bookings <bookings@luxdriveksa.com>"
//                              if unset. Falls back to EMAIL_FROM if that too is unset.
//   EMAIL_ASSETS_BASE_URL    — Where the social icons (PNG) are hosted.
//                              e.g. "https://luxdriveksa.com/email-assets".
//                              Unset → social row silently omitted.
//   LUXDRIVE_WEBSITE_URL     — Public website URL shown/linked in footers.
//                              Defaults to "https://luxdriveksa.com".
//   LUXDRIVE_SUPPORT_EMAIL   — Support/contact email shown/linked in footers.
//                              Defaults to "info@luxdriveksa.com".
//   LUXDRIVE_SUPPORT_PHONE   — Support/contact phone shown/linked in footers.
//                              Defaults to "+966545559510" (WhatsApp support line).

console.log(
  "[email-debug] EMAIL_ASSETS_BASE_URL:",
  JSON.stringify(process.env.EMAIL_ASSETS_BASE_URL),
);

import { Resend } from "resend";

const apiKey = process.env.RESEND_API_KEY;
const resend = apiKey ? new Resend(apiKey) : null;

const DEFAULT_FROM =
  process.env.EMAIL_FROM || "LuxDrive <onboarding@resend.dev>";
const DEFAULT_REPLY_TO = process.env.EMAIL_REPLY_TO;
const FRONTEND_URL = process.env.FRONTEND_URL || "http://localhost:3000";

const ADMIN_NOTIFICATION_EMAIL = process.env.ADMIN_NOTIFICATION_EMAIL;
const BOOKINGS_FROM =
  process.env.BOOKINGS_EMAIL_FROM ||
  process.env.EMAIL_FROM ||
  "LuxDrive Bookings <onboarding@resend.dev>";

// Public-facing brand contact info — surfaced in email footers, contact
// form copy, and anywhere the email body references how a recipient can
// reach us. Kept in env so a rebrand or channel migration (say, swapping
// to a different support number for a specific region) can happen
// without a code change.
const LUXDRIVE_WEBSITE_URL =
  process.env.LUXDRIVE_WEBSITE_URL || "https://luxdriveksa.com";
const LUXDRIVE_SUPPORT_EMAIL =
  process.env.LUXDRIVE_SUPPORT_EMAIL || "info@luxdriveksa.com";
const LUXDRIVE_SUPPORT_PHONE =
  process.env.LUXDRIVE_SUPPORT_PHONE || "+966545559510";

// Human-readable versions computed once at module load. `websiteHost`
// strips the scheme so the footer link text reads "luxdriveksa.com"
// while the href keeps the full "https://…" URL. `supportPhonePretty`
// spaces the number the way KSA convention displays it: "+966 54 555 9510".
const LUXDRIVE_WEBSITE_HOST = LUXDRIVE_WEBSITE_URL.replace(
  /^https?:\/\//,
  "",
).replace(/\/$/, "");
const LUXDRIVE_SUPPORT_PHONE_PRETTY = LUXDRIVE_SUPPORT_PHONE.replace(
  /^(\+\d{3})(\d{2})(\d{3})(\d{4})$/,
  "$1 $2 $3 $4",
);

// ============== LOW-LEVEL SEND ==============

interface SendEmailParams {
  to: string | string[];
  subject: string;
  html: string;
  text?: string;
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

// ============== SOCIAL LINKS (external emails only) ==============
//
// Kept as a constant so if a handle changes we edit one line, not seven
// templates. Icons are hosted on your own domain — see the block comment
// in renderExternalShell for why.

const SOCIALS = [
  {
    name: "Instagram",
    url: "https://www.instagram.com/luxakari/",
    icon: "instagram",
  },
  {
    name: "Facebook",
    url: "https://www.facebook.com/luxakarihospitalitygroup",
    icon: "facebook",
  },
  {
    name: "TikTok",
    url: "https://www.tiktok.com/@luxakarihospitalitygroup",
    icon: "tiktok",
  },
  {
    name: "YouTube",
    url: "https://www.youtube.com/@Luxakari",
    icon: "youtube",
  },
  {
    name: "LinkedIn",
    url: "https://www.linkedin.com/showcase/luxdriveksa/",
    icon: "linkedin",
  },
  { name: "WhatsApp", url: "https://wa.me/966545559510", icon: "whatsapp" },
];

// Icon base URL. Icons must be hosted publicly (Gmail's image proxy
// requires this) and NOT behind auth. Self-hosted PNGs live in the
// frontend at apps/web/public/email-assets/<icon>.png, so once the
// frontend is deployed they're reachable at
// https://luxdriveksa.com/email-assets/<icon>.png.
//
// FALLBACK: if EMAIL_ASSETS_BASE_URL isn't set (e.g. local dev) we
// silently degrade to hiding the social row — better than showing broken
// image icons. Set the env var in production so socials render.
const EMAIL_ASSETS_BASE_URL = process.env.EMAIL_ASSETS_BASE_URL;

function renderSocialRow(): string {
  if (!EMAIL_ASSETS_BASE_URL) return "";
  const cells = SOCIALS.map(
    (s) => `
      <td style="padding:0 5px;">
        <a href="${s.url}" style="text-decoration:none;">
          <img src="${EMAIL_ASSETS_BASE_URL}/${s.icon}.png" width="24" height="24" alt="${s.name}" style="display:block;border:0;" />
        </a>
      </td>`,
  ).join("");
  return `
    <tr>
      <td align="center" style="padding:20px 44px 4px;">
        <div style="font-size:11px;letter-spacing:2px;text-transform:uppercase;color:#7a7a7a;margin-bottom:14px;">Follow LuxDrive</div>
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;">
          <tr>${cells}</tr>
        </table>
      </td>
    </tr>`;
}

// ============== EXTERNAL SHELL ==============
//
// Used for: contact form, invitation, password reset, approval — anything
// a partner/vendor/customer reads.
//
// CSS is inlined because Gmail strips <style> from <head>. Tables are
// used for layout because Outlook desktop still renders with the Word
// engine, which does not support flexbox or grid. Yes, in 2026.

function renderExternalShell(opts: {
  preheader: string;
  eyebrow: string;
  eyebrowColor?: string; // gold (default), emerald, red — matches template intent
  title: string;
  subtitle?: string;
  bodyHtml: string;
  footerNote?: string;
}): string {
  const {
    preheader,
    eyebrow,
    eyebrowColor = "#C9A961",
    title,
    subtitle,
    bodyHtml,
    footerNote,
  } = opts;

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${title}</title>
    <!-- Playfair loads in Apple Mail + Gmail-web when fonts are allowed.
         Outlook Desktop ignores it entirely and falls back to Georgia,
         which is close enough visually that it reads as intentional. -->
    <link rel="preconnect" href="https://fonts.googleapis.com" />
    <link href="https://fonts.googleapis.com/css2?family=Playfair+Display:wght@400;500&display=swap" rel="stylesheet" />
  </head>
  <body style="margin:0;padding:0;background-color:#0a0a0a;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#e5e5e5;">
    <div style="display:none;font-size:1px;color:#0a0a0a;line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;">${preheader}</div>

    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background-color:#0a0a0a;">
      <tr><td align="center" style="padding:40px 20px;">
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="640" style="max-width:640px;background-color:#111111;border:1px solid #1f1f1f;border-radius:14px;overflow:hidden;">

          <!-- Header: LUX/DRIVE wordmark matching site logo -->
          <tr><td align="center" style="padding:36px 40px 28px;background-color:#0f0f0f;">
            <div style="font-family:'Segoe UI',Helvetica,Arial,sans-serif;font-weight:800;font-size:30px;letter-spacing:4px;line-height:1;">
              <span style="color:#ffffff;">LUX</span><span style="color:#C9A961;">DRIVE</span>
            </div>
            <div style="margin-top:8px;font-family:Georgia,'Times New Roman',serif;font-style:italic;font-size:12px;color:#8a8a8a;letter-spacing:0.5px;">by Luxakari Hospitality Group</div>
          </td></tr>

          <!-- Gold hairline separator -->
          <tr><td style="height:1px;background-color:#C9A961;line-height:1px;font-size:0;">&nbsp;</td></tr>

          <!-- Eyebrow: color-codes the email type -->
          <tr><td style="padding:32px 44px 0;">
            <div style="font-size:11px;letter-spacing:3px;text-transform:uppercase;color:${eyebrowColor};font-weight:600;">${eyebrow}</div>
          </td></tr>

          <!-- Title (serif, editorial) -->
          <tr><td style="padding:8px 44px 4px;">
            <h1 style="margin:0;font-family:'Playfair Display',Georgia,'Times New Roman',serif;font-weight:500;font-size:28px;line-height:1.25;color:#ffffff;letter-spacing:-0.3px;">${title}</h1>
            ${subtitle ? `<p style="margin:6px 0 0;color:#9a9a9a;font-size:14px;">${subtitle}</p>` : ""}
          </td></tr>

          <!-- Body -->
          <tr><td style="padding:28px 44px 8px;color:#e5e5e5;font-size:15px;line-height:1.7;">
            ${bodyHtml}
          </td></tr>

          <tr><td style="padding:16px 44px 4px;"><div style="height:1px;background-color:#1c1c1c;font-size:0;line-height:1px;">&nbsp;</div></td></tr>

          ${renderSocialRow()}

          <!-- Footer: contact line + copyright. No ShaikhTech. -->
          <tr><td style="padding:22px 44px 32px;text-align:center;">
            <p style="margin:0;font-size:12.5px;color:#7a7a7a;line-height:1.7;">
              <a href="${LUXDRIVE_WEBSITE_URL}" style="color:#C9A961;text-decoration:none;">${LUXDRIVE_WEBSITE_HOST}</a>
              &nbsp;&nbsp;·&nbsp;&nbsp;<a href="mailto:${LUXDRIVE_SUPPORT_EMAIL}" style="color:#9a9a9a;text-decoration:none;">${LUXDRIVE_SUPPORT_EMAIL}</a>
              &nbsp;&nbsp;·&nbsp;&nbsp;<a href="tel:${LUXDRIVE_SUPPORT_PHONE}" style="color:#9a9a9a;text-decoration:none;">${LUXDRIVE_SUPPORT_PHONE_PRETTY}</a>
            </p>
            <p style="margin:10px 0 0;font-size:11px;color:#5a5a5a;letter-spacing:0.5px;">&copy; ${new Date().getFullYear()} LuxDrive by Luxakari Hospitality Group. All rights reserved.</p>
            ${footerNote ? `<p style="margin:8px 0 0;font-size:10px;color:#4a4a4a;">${footerNote}</p>` : ""}
          </td></tr>

        </table>
      </td></tr>
    </table>
  </body>
</html>`;
}

// ============== ADMIN SHELL ==============
//
// Used for: booking created, accepted, rejected — anything landing in
// info@luxdriveksa.com. Utility-first: compact header, dense two-column
// details, single CTA, one-line footer. NO social row, no branded copy.

function renderAdminShell(opts: {
  preheader: string;
  eventLabel: string; // "New Booking", "Accepted", "Rejected", etc.
  eventLabelColor?: string; // gray (default), emerald, red
  bookingRef: string; // "LUX-202607-042"
  subtitle: string; // "Created by X · awaiting Y", "Accepted by X"
  alertBlockHtml?: string; // optional prominent block (used for rejection reason)
  detailsRows: Array<{
    label: string;
    value: string;
    valueColor?: string;
    valueWeight?: number;
  }>;
  ctaLabel: string;
  ctaUrl: string;
}): string {
  const {
    preheader,
    eventLabel,
    eventLabelColor = "#7a7a7a",
    bookingRef,
    subtitle,
    alertBlockHtml,
    detailsRows,
    ctaLabel,
    ctaUrl,
  } = opts;

  const rows = detailsRows
    .map((r, i) => {
      const isLast = i === detailsRows.length - 1;
      const border = isLast ? "" : "border-bottom:1px solid #1a1a1a;";
      const valueColor = r.valueColor || "#f0f0f0";
      const valueWeight = r.valueWeight ? `font-weight:${r.valueWeight};` : "";
      return `
      <tr style="${border}">
        <td style="padding:9px 0;color:#7a7a7a;width:110px;">${r.label}</td>
        <td style="padding:9px 0;color:${valueColor};${valueWeight}">${r.value}</td>
      </tr>`;
    })
    .join("");

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${bookingRef}</title>
  </head>
  <body style="margin:0;padding:0;background-color:#0a0a0a;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#e5e5e5;">
    <div style="display:none;font-size:1px;color:#0a0a0a;line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;">${preheader}</div>

    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background-color:#0a0a0a;">
      <tr><td align="center" style="padding:20px;">
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="620" style="max-width:620px;background-color:#111111;border:1px solid #1c1c1c;border-radius:8px;overflow:hidden;">

          <!-- Compact single-line header -->
          <tr><td style="padding:14px 28px;background-color:#0d0d0d;border-bottom:1px solid #1c1c1c;">
            <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="border-collapse:collapse;">
              <tr>
                <td style="font-family:'Segoe UI',Helvetica,Arial,sans-serif;font-weight:800;font-size:15px;letter-spacing:2.5px;line-height:1;">
                  <span style="color:#ffffff;">LUX</span><span style="color:#C9A961;">DRIVE</span><span style="color:#5a5a5a;font-weight:400;letter-spacing:1px;font-size:11px;margin-left:10px;">ADMIN</span>
                </td>
                <td align="right" style="font-size:10px;letter-spacing:2px;text-transform:uppercase;color:${eventLabelColor};font-weight:600;">${eventLabel}</td>
              </tr>
            </table>
          </td></tr>

          <!-- Booking ref as monospaced title + subtitle -->
          <tr><td style="padding:24px 28px 4px;">
            <div style="font-family:'Segoe UI Mono',Consolas,'Courier New',monospace;font-size:22px;font-weight:600;color:#ffffff;letter-spacing:0.5px;">${bookingRef}</div>
            <div style="margin-top:4px;color:#8a8a8a;font-size:13px;">${subtitle}</div>
          </td></tr>

          ${
            alertBlockHtml
              ? `<tr><td style="padding:16px 28px 4px;">${alertBlockHtml}</td></tr>`
              : ""
          }

          <!-- Details table: dense two-column, no card chrome -->
          <tr><td style="padding:${alertBlockHtml ? "16px" : "20px"} 28px 4px;">
            <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="border-collapse:collapse;font-size:13.5px;">
              ${rows}
            </table>
          </td></tr>

          <!-- CTA: compact button -->
          <tr><td style="padding:20px 28px 24px;">
            <a href="${ctaUrl}" style="display:inline-block;padding:10px 22px;background-color:#C9A961;color:#0a0a0a;text-decoration:none;font-weight:700;border-radius:6px;font-size:13px;letter-spacing:0.3px;">${ctaLabel} →</a>
          </td></tr>

          <!-- Ultra-minimal footer -->
          <tr><td style="padding:12px 28px;background-color:#0d0d0d;border-top:1px solid #1c1c1c;">
            <div style="font-size:10.5px;color:#5a5a5a;letter-spacing:0.3px;">
              LuxDrive booking system · <a href="mailto:${LUXDRIVE_SUPPORT_EMAIL}" style="color:#7a7a7a;text-decoration:none;">${LUXDRIVE_SUPPORT_EMAIL}</a>
            </div>
          </td></tr>

        </table>
      </td></tr>
    </table>
  </body>
</html>`;
}

// ============== TEMPLATE HELPERS ==============

// HTML-escape user-supplied content. Four substitutions cover email use
// cases; we deliberately don't import a full sanitizer to keep this
// self-contained.
function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// ============== TEMPLATE: VENDOR / PARTNER INVITATION ==============

export async function sendInvitationEmail(opts: {
  to: string;
  companyName: string;
  type: "partner" | "vendor";
  inviteToken: string;
  expiresInHours?: number;
}): Promise<SendEmailResult> {
  const {
    to,
    companyName,
    type: role,
    inviteToken,
    expiresInHours = 168, // 7 days
  } = opts;

  const inviteUrl = `${FRONTEND_URL}/onboarding/${role}?token=${encodeURIComponent(inviteToken)}`;
  const safeCompany = escapeHtml(companyName);
  const expiresInDays = Math.round(expiresInHours / 24);

  const bodyHtml = `
    <p style="margin:0 0 16px;">Dear <span style="color:#C9A961;">${safeCompany}</span>,</p>
    <p style="margin:0 0 16px;">
      We&rsquo;re pleased to invite you to join <strong style="color:#ffffff;">LuxDrive</strong> as a ${role}. LuxDrive is Luxakari Hospitality Group&rsquo;s luxury chauffeur platform serving Riyadh, Jeddah, Makkah, and Madinah.
    </p>
    <p style="margin:0 0 16px;">
      Accepting this invitation gives you access to your ${role} portal, where you can complete your company profile, upload compliance documents, and ${role === "partner" ? "start booking rides for your guests" : "manage your fleet and drivers"}.
    </p>

    <div style="margin:32px 0;text-align:center;">
      <a href="${inviteUrl}" style="display:inline-block;padding:14px 36px;background-color:#C9A961;color:#0a0a0a;text-decoration:none;font-weight:700;border-radius:10px;font-size:15px;letter-spacing:0.5px;">Accept Invitation</a>
    </div>

    <p style="margin:0 0 8px;font-size:13px;color:#8a8a8a;line-height:1.6;">
      This invitation link expires in <span style="color:#C9A961;">${expiresInDays} days</span>. If it expires, please contact us and we&rsquo;ll issue a fresh link.
    </p>
    <p style="margin:8px 0 0;font-size:12px;color:#6a6a6a;line-height:1.5;">
      If the button above doesn&rsquo;t work, copy this link into your browser:<br/>
      <span style="color:#8a8a8a;word-break:break-all;">${inviteUrl}</span>
    </p>
  `;

  return sendEmail({
    to,
    subject: `You&rsquo;re invited to join LuxDrive as a ${role}`,
    html: renderExternalShell({
      preheader: `Join LuxDrive as a ${role} — invitation expires in ${expiresInDays} days`,
      eyebrow: "Invitation",
      title: "You&rsquo;re invited to join LuxDrive",
      subtitle: `as a ${role} on the platform`,
      bodyHtml,
    }),
    text: `Dear ${companyName},

You are invited to join LuxDrive as a ${role}.

Accept your invitation:
${inviteUrl}

This link expires in ${expiresInDays} days.

— LuxDrive by Luxakari Hospitality Group`,
  });
}

// ============== TEMPLATE: PASSWORD RESET ==============

export async function sendPasswordResetEmail(opts: {
  to: string;
  resetUrl: string;
  userName?: string;
  expiresInMinutes?: number;
}): Promise<SendEmailResult> {
  const { to, resetUrl, userName, expiresInMinutes = 60 } = opts;
  const greeting = userName ? `Hello ${escapeHtml(userName)},` : "";

  const bodyHtml = `
    ${greeting ? `<p style="margin:0 0 12px;">${greeting}</p>` : ""}
    <p style="margin:0 0 16px;">A password reset was requested for your LuxDrive account. If this was you, click the button below to set a new password.</p>

    <div style="margin:32px 0;text-align:center;">
      <a href="${resetUrl}" style="display:inline-block;padding:14px 36px;background-color:#C9A961;color:#0a0a0a;text-decoration:none;font-weight:700;border-radius:10px;font-size:15px;letter-spacing:0.5px;">Reset Password</a>
    </div>

    <p style="margin:0 0 16px;font-size:13px;color:#8a8a8a;line-height:1.6;">
      This link expires in <span style="color:#C9A961;">${expiresInMinutes} minutes</span>.
    </p>

    <div style="margin-top:24px;padding:14px 18px;background-color:#0d0d0d;border-left:2px solid #dc2626;border-radius:6px;">
      <p style="margin:0;font-size:13px;color:#e5e5e5;line-height:1.6;">
        <strong style="color:#ffffff;">Didn&rsquo;t request this?</strong> You can safely ignore this email &mdash; your password will remain unchanged. If you keep seeing these emails, please contact us.
      </p>
    </div>
  `;

  return sendEmail({
    to,
    subject: "Reset your LuxDrive password",
    html: renderExternalShell({
      preheader: `Reset your password — link expires in ${expiresInMinutes} minutes`,
      eyebrow: "Security",
      title: "Reset your password",
      subtitle: `Requested for ${escapeHtml(to)}`,
      bodyHtml,
    }),
    text: `A password reset was requested for your LuxDrive account.

Reset your password:
${resetUrl}

This link expires in ${expiresInMinutes} minutes.

Didn't request this? You can safely ignore this email — your password will remain unchanged.

— LuxDrive`,
  });
}

// ============== TEMPLATE: ACCOUNT APPROVED ==============

export async function sendApprovalEmail(opts: {
  to: string;
  companyName: string;
  role: "partner" | "vendor";
}): Promise<SendEmailResult> {
  const { to, companyName, role } = opts;
  const dashboardUrl = `${FRONTEND_URL}/dashboard/${role}`;
  const safeCompany = escapeHtml(companyName);

  const bodyHtml = `
    <p style="margin:0 0 16px;">Dear <span style="color:#C9A961;">${safeCompany}</span>,</p>
    <p style="margin:0 0 16px;">
      We&rsquo;re pleased to confirm that your LuxDrive ${role} account has been approved. Your profile has passed our compliance review and you may now use all portal features.
    </p>
    <p style="margin:0 0 22px;">
      We look forward to a successful partnership. Should you need any assistance, our team is available through the channels below.
    </p>

    <div style="margin:32px 0;text-align:center;">
      <a href="${dashboardUrl}" style="display:inline-block;padding:14px 36px;background-color:#C9A961;color:#0a0a0a;text-decoration:none;font-weight:700;border-radius:10px;font-size:15px;letter-spacing:0.5px;">Open Your Dashboard</a>
    </div>
  `;

  return sendEmail({
    to,
    subject: `Welcome to LuxDrive — your account is approved`,
    html: renderExternalShell({
      preheader: `Your LuxDrive ${role} account has been approved`,
      eyebrow: "Welcome",
      title: "Your account is approved",
      subtitle: "You may now access your portal in full",
      bodyHtml,
    }),
    text: `Dear ${companyName},

Your LuxDrive ${role} account has been approved. You can now access your dashboard:
${dashboardUrl}

— LuxDrive by Luxakari Hospitality Group`,
  });
}

// ============== TEMPLATE: CONTACT FORM SUBMISSION ==============

export async function sendContactFormEmail(opts: {
  to: string;
  replyTo: string;
  submitterName: string;
  submitterEmail: string;
  submitterPhone: string | null;
  subjectLabel: string;
  message: string;
}): Promise<SendEmailResult> {
  const {
    to,
    replyTo,
    submitterName,
    submitterEmail,
    submitterPhone,
    subjectLabel,
    message,
  } = opts;

  const safeName = escapeHtml(submitterName);
  const safeMessage = escapeHtml(message).replace(/\n/g, "<br/>");
  const safeLabel = escapeHtml(subjectLabel);

  const bodyHtml = `
    <p style="margin:0 0 22px;color:#c0c0c0;font-size:14.5px;">
      A prospective client has reached out through the contact form on ${LUXDRIVE_WEBSITE_HOST}. Their details are below &mdash; reply to this email to respond directly.
    </p>

    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="border-collapse:collapse;background-color:#0d0d0d;border:1px solid #1c1c1c;border-radius:10px;">
      <tr><td style="padding:18px 22px;">
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="border-collapse:collapse;">
          <tr>
            <td style="padding:6px 0;color:#7a7a7a;font-size:12px;letter-spacing:1px;text-transform:uppercase;width:110px;">Name</td>
            <td style="padding:6px 0;color:#f0f0f0;font-size:14.5px;">${safeName}</td>
          </tr>
          <tr>
            <td style="padding:6px 0;color:#7a7a7a;font-size:12px;letter-spacing:1px;text-transform:uppercase;">Email</td>
            <td style="padding:6px 0;color:#f0f0f0;font-size:14.5px;">
              <a href="mailto:${submitterEmail}" style="color:#C9A961;text-decoration:none;">${escapeHtml(submitterEmail)}</a>
            </td>
          </tr>
          ${
            submitterPhone
              ? `<tr>
            <td style="padding:6px 0;color:#7a7a7a;font-size:12px;letter-spacing:1px;text-transform:uppercase;">Phone</td>
            <td style="padding:6px 0;color:#f0f0f0;font-size:14.5px;">${escapeHtml(submitterPhone)}</td>
          </tr>`
              : ""
          }
        </table>
      </td></tr>
    </table>

    <div style="margin-top:24px;">
      <div style="color:#7a7a7a;font-size:12px;letter-spacing:1px;text-transform:uppercase;margin-bottom:10px;">Message</div>
      <div style="color:#d4d4d4;font-size:15px;line-height:1.75;padding:18px 22px;background-color:#0d0d0d;border-left:2px solid #C9A961;border-radius:6px;">${safeMessage}</div>
    </div>

    <p style="margin:28px 0 0;font-size:13.5px;color:#9a9a9a;line-height:1.6;">
      Reply directly to this email to respond &mdash; your reply goes straight to <span style="color:#C9A961;">${safeName}</span>.
    </p>
  `;

  return sendEmail({
    to,
    replyTo,
    subject: `[Contact] ${subjectLabel} — from ${submitterName}`,
    html: renderExternalShell({
      preheader: `New contact form submission from ${submitterName} (${subjectLabel})`,
      eyebrow: "Contact Enquiry",
      title: "New Contact Form Submission",
      subtitle: safeLabel,
      bodyHtml,
      footerNote: `This message was submitted via the contact form on ${LUXDRIVE_WEBSITE_HOST}.`,
    }),
    text: `New Contact Form Submission — ${subjectLabel}

Name: ${submitterName}
Email: ${submitterEmail}${submitterPhone ? `\nPhone: ${submitterPhone}` : ""}

Message:
${message}

Reply directly to this email to respond.`,
  });
}

// ============== ADMIN TEMPLATES (booking notifications) ==============
//
// These fire on booking events (create, accept, reject) to the admin
// inbox. Called fire-and-forget from controllers — a failed email must
// NEVER block a booking flow, so callers wrap in .catch() and log.
//
// All three skip entirely if ADMIN_NOTIFICATION_EMAIL is unset (dev
// environments don't need to spam a real inbox; production must set it).

export interface BookingSummaryForEmail {
  bookingRef: string;
  guestName?: string | null;
  guestPhone?: string | null;
  partnerCompanyName?: string | null;
  vendorCompanyName?: string | null;
  driverName?: string | null;
  driverPhone?: string | null;
  vehicleLabel?: string | null; // "Mercedes E-Class · ABC 1234" — pre-formatted
  vehicleClass?: string | null; // "Business Sedan"
  passengers?: number | null;
  pickupAddress?: string | null;
  dropoffAddress?: string | null;
  tripDate: Date | string;
  tripTime?: string | null; // "14:30"
  totalPrice?: number | string | null; // number or preformatted
  currency?: string; // defaults SAR
}

// Format Date + "HH:mm" into "15 Jul 2026 · 14:30"
function formatTripDateTime(date: Date | string, time?: string | null): string {
  const d = date instanceof Date ? date : new Date(date);
  const day = d.getUTCDate();
  const month = d.toLocaleString("en-GB", { month: "short", timeZone: "UTC" });
  const year = d.getUTCFullYear();
  const t = time ? ` · ${time}` : "";
  return `${day} ${month} ${year}${t}`;
}

// Format "KKIA T1 → Ritz-Carlton Riyadh" for subject + details.
// Truncates each side to keep the subject line readable.
function formatRoute(pickup?: string | null, dropoff?: string | null): string {
  const p = (pickup || "").split(",")[0].trim() || "—";
  const d = (dropoff || "").split(",")[0].trim() || "—";
  return `${p} → ${d}`;
}

// Format SAR-style money. Accepts a number or a preformatted string;
// preformatted strings pass through so callers can pre-quantize Decimals.
function formatMoney(
  amount?: number | string | null,
  currency = "SAR",
): string {
  if (amount === null || amount === undefined) return "—";
  if (typeof amount === "string") return amount;
  return `${currency} ${amount.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function skipIfNoAdminEmail(fn: string): SendEmailResult | null {
  if (!ADMIN_NOTIFICATION_EMAIL) {
    console.warn(`[email] ${fn} skipped — ADMIN_NOTIFICATION_EMAIL not set`);
    return { ok: true, id: "no-admin-email-config" };
  }
  return null;
}

// ============== TEMPLATE: BOOKING CREATED (admin) ==============

export async function sendBookingCreatedAdminEmail(
  booking: BookingSummaryForEmail,
): Promise<SendEmailResult> {
  const skipped = skipIfNoAdminEmail("sendBookingCreatedAdminEmail");
  if (skipped) return skipped;

  const partner = booking.partnerCompanyName || "a partner";
  const route = formatRoute(booking.pickupAddress, booking.dropoffAddress);
  const priceLabel = formatMoney(booking.totalPrice, booking.currency);
  const ctaUrl = `${FRONTEND_URL}/dashboard/admin?tab=bookings&ref=${encodeURIComponent(booking.bookingRef)}`;

  const detailsRows: Array<{
    label: string;
    value: string;
    valueColor?: string;
    valueWeight?: number;
  }> = [
    {
      label: "Guest",
      value: escapeHtml(
        `${booking.guestName || "—"}${booking.guestPhone ? " · " + booking.guestPhone : ""}`,
      ),
    },
    { label: "Route", value: escapeHtml(route) },
    {
      label: "Trip date",
      value: escapeHtml(formatTripDateTime(booking.tripDate, booking.tripTime)),
    },
    {
      label: "Vehicle",
      value: escapeHtml(
        `${booking.vehicleClass || "—"}${booking.passengers ? ` · ${booking.passengers} passenger${booking.passengers === 1 ? "" : "s"}` : ""}`,
      ),
    },
    {
      label: "Total",
      value: escapeHtml(priceLabel),
      valueColor: "#C9A961",
      valueWeight: 700,
    },
  ];

  return sendEmail({
    to: ADMIN_NOTIFICATION_EMAIL!,
    from: BOOKINGS_FROM,
    subject: `[LuxDrive] ${booking.bookingRef} · New · ${priceLabel} · ${route}`,
    html: renderAdminShell({
      preheader: `New booking created by ${partner} — ${route}, ${priceLabel}`,
      eventLabel: "New Booking",
      bookingRef: booking.bookingRef,
      subtitle: `Created by <span style="color:#C9A961;">${escapeHtml(partner)}</span> · awaiting vendor assignment`,
      detailsRows,
      ctaLabel: "View in Admin",
      ctaUrl,
    }),
    text: `NEW BOOKING — ${booking.bookingRef}

Partner: ${partner}
Guest: ${booking.guestName || "—"}${booking.guestPhone ? " (" + booking.guestPhone + ")" : ""}
Route: ${route}
Trip date: ${formatTripDateTime(booking.tripDate, booking.tripTime)}
Vehicle: ${booking.vehicleClass || "—"}${booking.passengers ? ` (${booking.passengers} passengers)` : ""}
Total: ${priceLabel}

View: ${ctaUrl}`,
  });
}

// ============== TEMPLATE: BOOKING ACCEPTED (admin) ==============

export async function sendBookingAcceptedAdminEmail(
  booking: BookingSummaryForEmail,
): Promise<SendEmailResult> {
  const skipped = skipIfNoAdminEmail("sendBookingAcceptedAdminEmail");
  if (skipped) return skipped;

  const vendor = booking.vendorCompanyName || "a vendor";
  const tripDateStr = formatTripDateTime(booking.tripDate, booking.tripTime);
  const ctaUrl = `${FRONTEND_URL}/dashboard/admin?tab=bookings&ref=${encodeURIComponent(booking.bookingRef)}`;

  const detailsRows: Array<{
    label: string;
    value: string;
    valueColor?: string;
    valueWeight?: number;
  }> = [
    { label: "Vendor", value: escapeHtml(vendor) },
    ...(booking.driverName
      ? [
          {
            label: "Driver",
            value: escapeHtml(
              booking.driverName +
                (booking.driverPhone ? " · " + booking.driverPhone : ""),
            ),
          },
        ]
      : []),
    ...(booking.vehicleLabel
      ? [{ label: "Vehicle", value: escapeHtml(booking.vehicleLabel) }]
      : []),
    ...(booking.partnerCompanyName
      ? [{ label: "Partner", value: escapeHtml(booking.partnerCompanyName) }]
      : []),
    {
      label: "Route",
      value: escapeHtml(
        formatRoute(booking.pickupAddress, booking.dropoffAddress),
      ),
    },
    { label: "Trip date", value: escapeHtml(tripDateStr) },
  ];

  return sendEmail({
    to: ADMIN_NOTIFICATION_EMAIL!,
    from: BOOKINGS_FROM,
    subject: `[LuxDrive] ${booking.bookingRef} · Accepted by ${vendor} · ${tripDateStr}`,
    html: renderAdminShell({
      preheader: `${booking.bookingRef} accepted by ${vendor}`,
      eventLabel: "✓ Accepted",
      eventLabelColor: "#10b981",
      bookingRef: booking.bookingRef,
      subtitle: `Accepted by <span style="color:#C9A961;">${escapeHtml(vendor)}</span>`,
      detailsRows,
      ctaLabel: "View in Admin",
      ctaUrl,
    }),
    text: `BOOKING ACCEPTED — ${booking.bookingRef}

Vendor: ${vendor}
${booking.driverName ? `Driver: ${booking.driverName}${booking.driverPhone ? ` (${booking.driverPhone})` : ""}\n` : ""}${booking.vehicleLabel ? `Vehicle: ${booking.vehicleLabel}\n` : ""}${booking.partnerCompanyName ? `Partner: ${booking.partnerCompanyName}\n` : ""}Route: ${formatRoute(booking.pickupAddress, booking.dropoffAddress)}
Trip date: ${tripDateStr}

View: ${ctaUrl}`,
  });
}

// ============== TEMPLATE: BOOKING REJECTED (admin) ==============

// Enum from vendor bookings controller. We render the human-readable
// label rather than the enum key so admins read "Price too low" not
// "PRICE_TOO_LOW".
const REJECTION_REASON_LABELS: Record<string, string> = {
  CAR_DRIVER_UNAVAILABLE: "Car or driver unavailable",
  PRICE_TOO_LOW: "Price too low",
  UNSUITABLE_ROUTE: "Unsuitable route",
};

export async function sendBookingRejectedAdminEmail(
  booking: BookingSummaryForEmail & { rejectionReason: string },
): Promise<SendEmailResult> {
  const skipped = skipIfNoAdminEmail("sendBookingRejectedAdminEmail");
  if (skipped) return skipped;

  const vendor = booking.vendorCompanyName || "a vendor";
  const tripDateStr = formatTripDateTime(booking.tripDate, booking.tripTime);
  const reasonLabel =
    REJECTION_REASON_LABELS[booking.rejectionReason] || booking.rejectionReason;
  const ctaUrl = `${FRONTEND_URL}/dashboard/admin?tab=bookings&ref=${encodeURIComponent(booking.bookingRef)}`;

  // Red-accented reason block sits above the details table.
  const alertBlockHtml = `
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="border-collapse:collapse;background-color:#1a0a0a;border-left:3px solid #ef4444;border-radius:4px;">
      <tr><td style="padding:12px 16px;">
        <div style="color:#a0a0a0;font-size:10px;letter-spacing:2px;text-transform:uppercase;margin-bottom:3px;">Reason</div>
        <div style="color:#ffffff;font-size:14px;font-weight:600;">${escapeHtml(reasonLabel)}</div>
      </td></tr>
    </table>`;

  const detailsRows: Array<{
    label: string;
    value: string;
    valueColor?: string;
    valueWeight?: number;
  }> = [
    ...(booking.partnerCompanyName
      ? [{ label: "Partner", value: escapeHtml(booking.partnerCompanyName) }]
      : []),
    {
      label: "Route",
      value: escapeHtml(
        formatRoute(booking.pickupAddress, booking.dropoffAddress),
      ),
    },
    { label: "Trip date", value: escapeHtml(tripDateStr) },
    ...(booking.vehicleClass
      ? [{ label: "Vehicle", value: escapeHtml(booking.vehicleClass) }]
      : []),
  ];

  return sendEmail({
    to: ADMIN_NOTIFICATION_EMAIL!,
    from: BOOKINGS_FROM,
    subject: `[LuxDrive] ${booking.bookingRef} · Rejected — ${reasonLabel} · Reassign needed`,
    html: renderAdminShell({
      preheader: `${booking.bookingRef} rejected by ${vendor} — ${reasonLabel}`,
      eventLabel: "✕ Rejected",
      eventLabelColor: "#ef4444",
      bookingRef: booking.bookingRef,
      subtitle: `Rejected by <span style="color:#C9A961;">${escapeHtml(vendor)}</span> · needs reassignment`,
      alertBlockHtml,
      detailsRows,
      ctaLabel: "Reassign in Admin",
      ctaUrl,
    }),
    text: `BOOKING REJECTED — ${booking.bookingRef}

Rejected by: ${vendor}
Reason: ${reasonLabel}

${booking.partnerCompanyName ? `Partner: ${booking.partnerCompanyName}\n` : ""}Route: ${formatRoute(booking.pickupAddress, booking.dropoffAddress)}
Trip date: ${tripDateStr}
${booking.vehicleClass ? `Vehicle: ${booking.vehicleClass}\n` : ""}
Reassign: ${ctaUrl}`,
  });
}
