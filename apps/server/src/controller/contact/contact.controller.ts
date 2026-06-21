// ============================================
// src/controller/contact/contact.controller.ts
//
// Public contact form submission. Unauthenticated endpoint — anyone
// browsing the marketing site can submit. Forwards the message as a
// branded transactional email to the LuxDrive ops inbox, with
// reply-to set to the submitter so admin can reply directly from
// their mail client.
//
// Scope:
//   This file sits inside controller/contact/ alongside any future
//   contact-domain controllers (e.g. inquiry routing, contact log
//   queries, support ticket creation). When we add those, they go
//   next to this one and the route folder mirrors the structure.
//
// Anti-abuse:
//   Server-side length caps + basic format checks prevent the most
//   obvious garbage. Rate-limit middleware can be layered on at the
//   route file when this becomes a target — see contact.route.ts
//   for where to add it.
// ============================================

import { Request, Response } from "express";
import { asyncWrapper } from "../../utils/asyncWrapper";
import { BadRequestError } from "../../utils/AppError";
import { sendContactFormEmail } from "../../lib/email";

// Subject value → human label. Keep in sync with the <select>
// options on the frontend contact page. We accept the raw value
// from the client but render the label in the email body so the
// admin reading it sees "Booking Assistance" not "booking".
const SUBJECT_LABELS: Record<string, string> = {
  general: "General Inquiry",
  booking: "Booking Assistance",
  corporate: "Corporate Services",
  feedback: "Feedback",
};

// Loose RFC-5322 inspired check. Catches typos like "foo@bar" and
// missing TLDs. Strict validation belongs at the SMTP layer — Resend
// will reject bad addresses on send.
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Where the form lands. Routed via Namecheap forwarding (or
// Workspace alias) to whichever inbox the ops team reads — see the
// email infrastructure setup notes. Env-overridable so we can point
// it elsewhere per environment without a code change.
const CONTACT_RECIPIENT = process.env.EMAIL_REPLY_TO as "";

// ============== SUBMIT CONTACT FORM ==============

/**
 * POST /api/v1/contact
 * Body: { name, email, phone?, subject, message }
 * Sends the message to the ops inbox via Resend with replyTo set to
 * the submitter so admin can hit Reply in their mail client.
 */
export const submitContactForm = asyncWrapper(
  async (req: Request, res: Response) => {
    const {
      name,
      email,
      phone,
      subject = "general",
      message,
    } = req.body as {
      name?: string;
      email?: string;
      phone?: string;
      subject?: string;
      message?: string;
    };

    // ============== VALIDATE ==============
    // Trim whitespace before checking — a message of "    " is empty.
    const cleanName = (name || "").trim();
    const cleanEmail = (email || "").trim().toLowerCase();
    const cleanPhone = (phone || "").trim();
    const cleanMessage = (message || "").trim();
    const cleanSubject = (subject || "general").trim();

    if (!cleanName) throw new BadRequestError("Name is required");
    if (!cleanEmail) throw new BadRequestError("Email is required");
    if (!EMAIL_REGEX.test(cleanEmail))
      throw new BadRequestError("Please enter a valid email address");
    if (!cleanMessage) throw new BadRequestError("Message is required");

    // Length caps — protect against pasted novels and obvious
    // garbage payloads. Numbers chosen to comfortably fit any
    // legitimate inquiry while rejecting abuse attempts. Mirror
    // these in the frontend `maxLength` attributes.
    if (cleanName.length > 100)
      throw new BadRequestError("Name is too long (max 100 characters)");
    if (cleanEmail.length > 200) throw new BadRequestError("Email is too long");
    if (cleanPhone.length > 30) throw new BadRequestError("Phone is too long");
    if (cleanMessage.length > 5000)
      throw new BadRequestError("Message is too long (max 5000 characters)");
    if (cleanMessage.length < 10)
      throw new BadRequestError(
        "Message is too short — please describe how we can help",
      );

    // Unknown subject = fall through to "general". Don't 400 on this;
    // a quiet recovery is friendlier than rejecting the submission
    // outright if the frontend gets out of sync with this list.
    const subjectLabel = SUBJECT_LABELS[cleanSubject] || "General Inquiry";

    // ============== SEND EMAIL ==============
    const emailResult = await sendContactFormEmail({
      to: CONTACT_RECIPIENT,
      replyTo: cleanEmail,
      submitterName: cleanName,
      submitterEmail: cleanEmail,
      submitterPhone: cleanPhone || null,
      subjectLabel,
      message: cleanMessage,
    });

    if (!emailResult.ok) {
      console.error(
        `[submitContactForm] Email send failed for ${cleanEmail}: ${emailResult.error}`,
      );
      // Don't expose the underlying email error to the public —
      // give a generic failure message with a fallback channel.
      return res.status(502).json({
        success: false,
        message:
          "We couldn't send your message right now. Please email us directly at info@luxdriveksa.com or call +966 54 555 9510.",
      });
    }

    res.json({
      success: true,
      message: "Message sent. We'll respond within 24 hours.",
      data: { emailSent: true },
    });
  },
);
