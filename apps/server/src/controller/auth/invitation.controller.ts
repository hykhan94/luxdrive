// ============================================
// apps/server/src/controller/auth/invitation.controller.ts
// Public endpoints for vendor/partner invitation acceptance.
// ============================================
//
// Flow:
//   1. Admin invites someone (creates placeholder User + Vendor/Partner
//      with status INVITED + invitationToken). Email sent via Resend.
//   2. Recipient clicks the link → frontend calls `GET /auth/invitation/:type/:token`
//      → returns { companyName, email, valid } so the welcome page can
//      show the recipient who's being invited.
//   3. Recipient sets password → frontend calls `POST /auth/invitation/:type/:token/accept`
//      with { password, firstName, lastName, phone? }.
//   4. Backend: hashes the password via Better Auth's hashPassword util,
//      updates the existing placeholder User's profile fields, inserts
//      a credential Account row attached to that user, transitions the
//      Vendor/Partner status to ONBOARDING, and signs the user in.
//   5. Token cleared so it can't be replayed.
//
// IMPORTANT design note on user handling:
//   The placeholder user created at admin-invite time is NOT replaced
//   on acceptance. Both Vendor.user and Partner.user are wired with
//   `onDelete: Cascade` — deleting the user would wipe the vendor/
//   partner record too. Instead we keep that user row and just attach
//   a credential Account to it. The user table maps 1:1 with auth
//   identity; the credential table holds the password hash.

import { Request, Response } from "express";
import { prisma } from "../../lib/prisma";
import { auth } from "../../lib/auth";
import { hashPassword } from "better-auth/crypto";
import { asyncWrapper } from "../../utils/asyncWrapper";
import { BadRequestError, NotFoundError } from "../../utils/AppError";

// ============== GET /auth/invitation/:type/:token ==============
//
// Returns the invitation context (who is being invited, by what name)
// so the welcome page can render personalized copy. No auth required.
//
// Distinguishes three failure modes so the frontend can show
// appropriate copy:
//   - 404 "invitation not found" → bad token (typo/forged)
//   - 410 "expired" → token valid but past 72h window
//   - 409 "already used" → recipient already accepted (or admin
//     re-sent and the old token was invalidated)

export const getInvitation = asyncWrapper(
  async (req: Request, res: Response) => {
    const { type, token } = req.params;

    if (type !== "vendor" && type !== "partner") {
      throw new BadRequestError("Invalid invitation type");
    }

    // Look up the invitation by token. Vendor and partner records each
    // have invitationToken @unique, so a single findFirst is fast and
    // returns at most one row.
    const record =
      type === "vendor"
        ? await prisma.vendor.findUnique({
            where: { invitationToken: token },
            select: {
              companyName: true,
              status: true,
              invitationExpiresAt: true,
              user: { select: { email: true } },
            },
          })
        : await prisma.partner.findUnique({
            where: { invitationToken: token },
            select: {
              companyName: true,
              status: true,
              invitationExpiresAt: true,
              contactEmail: true,
              user: { select: { email: true } },
            },
          });

    if (!record) {
      throw new NotFoundError("Invitation");
    }

    // Already accepted — token wasn't cleared but status moved on.
    // We treat anything past INVITED as "already used" since the
    // password-setting step only happens once on the INVITED → ONBOARDING
    // transition.
    if (record.status !== "INVITED") {
      res.status(409).json({
        success: false,
        code: "INVITATION_ALREADY_USED",
        message:
          "This invitation has already been accepted. Sign in with your existing credentials.",
      });
      return;
    }

    // Expired — past the 72h window. Admin needs to re-send.
    if (record.invitationExpiresAt && new Date() > record.invitationExpiresAt) {
      res.status(410).json({
        success: false,
        code: "INVITATION_EXPIRED",
        message:
          "This invitation has expired. Please contact the admin who invited you for a fresh link.",
      });
      return;
    }

    const recipientEmail =
      type === "partner"
        ? (record as any).contactEmail || record.user.email
        : record.user.email;

    res.json({
      success: true,
      data: {
        type,
        companyName: record.companyName,
        email: recipientEmail,
        expiresAt: record.invitationExpiresAt,
      },
    });
  },
);

// ============== POST /auth/invitation/:type/:token/accept ==============
//
// Sets the password (via Better Auth) and transitions status to
// ONBOARDING. Returns a session token so the frontend can redirect
// straight into the portal without an extra sign-in round trip.

export const acceptInvitation = asyncWrapper(
  async (req: Request, res: Response) => {
    const { type, token } = req.params;
    const { password, firstName, lastName, phone } = req.body;

    if (type !== "vendor" && type !== "partner") {
      throw new BadRequestError("Invalid invitation type");
    }
    if (!password || password.length < 8) {
      throw new BadRequestError("Password must be at least 8 characters long");
    }
    if (!firstName || !lastName) {
      throw new BadRequestError("First name and last name are required");
    }

    // ===== Look up the invitation + placeholder user =====
    const record =
      type === "vendor"
        ? await prisma.vendor.findUnique({
            where: { invitationToken: token },
            include: { user: true },
          })
        : await prisma.partner.findUnique({
            where: { invitationToken: token },
            include: { user: true },
          });

    if (!record) {
      throw new NotFoundError("Invitation");
    }
    if (record.status !== "INVITED") {
      throw new BadRequestError("This invitation has already been accepted.");
    }
    if (record.invitationExpiresAt && new Date() > record.invitationExpiresAt) {
      throw new BadRequestError(
        "This invitation has expired. Contact admin for a fresh link.",
      );
    }

    const userId = record.user.id;
    const email =
      type === "partner"
        ? (record as any).contactEmail || record.user.email
        : record.user.email;
    const companyName = record.companyName;
    const role = type === "vendor" ? "VENDOR" : "PARTNER";

    // Guard against a token being accepted twice if a credential
    // Account already exists. Two callers racing on the same token
    // each pass the "INVITED" check above, but only one should win
    // here. The unique constraint on (providerId, accountId) catches
    // the loser at the DB layer; we surface it as a friendly error.
    const existingCredential = await prisma.account.findFirst({
      where: { userId, providerId: "credential" },
      select: { id: true },
    });
    if (existingCredential) {
      throw new BadRequestError(
        "This invitation has already been accepted. Try signing in instead.",
      );
    }

    // ===== Step 1: hash the password =====
    // Better Auth's `hashPassword` uses node:crypto scrypt under the
    // hood and produces a hash in the exact format Better Auth's
    // verifyPassword expects, so future sign-ins will validate
    // correctly against this stored value.
    const passwordHash = await hashPassword(password);

    // ===== Step 2: update the existing user + attach credential =====
    // Wrapped in a transaction so we never end up with a user updated
    // but no credential row (which would leave them unable to sign in
    // even though the invitation is consumed).
    let updatedUserId: string;
    try {
      const result = await prisma.$transaction(async (tx) => {
        // Update the placeholder user's profile fields. Email and role
        // were already set at invite time; we add the name + phone the
        // recipient just entered, and mark email verified since the
        // invitation click IS the verification.
        const updatedUser = await tx.user.update({
          where: { id: userId },
          data: {
            name: `${firstName} ${lastName}`,
            firstName,
            lastName,
            phone: phone || null,
            emailVerified: true,
            role, // re-affirm in case it was set to a default earlier
          },
        });

        // Attach the credential Account. Better Auth's credential
        // provider stores the password hash here. The shape
        // (providerId='credential', accountId=userId) mirrors what
        // signUpEmail would have written.
        await tx.account.create({
          data: {
            userId,
            providerId: "credential",
            accountId: userId,
            password: passwordHash,
          },
        });

        return updatedUser;
      });
      updatedUserId = result.id;
    } catch (err: any) {
      console.error(
        `[acceptInvitation] credential attach failed for ${email}:`,
        err.message,
      );
      throw new BadRequestError(
        "Could not set password. Please try again or request a fresh invitation.",
      );
    }

    // ===== Step 3: flip vendor/partner status + clear token =====
    // Also seed the contact-info columns. The person accepting the
    // invitation IS the natural initial Contact Person — copying their
    // name, phone, and email here saves them from typing it again in
    // Company Details. They can change it later if a different person
    // should be the company contact (billing, ops, etc.).
    //
    // Field-by-field rationale:
    //   contactPerson  ← "First Last" from the acceptance form
    //   contactPhone   ← optional phone they entered (may be null)
    //   contactEmail   ← the invitation email, which is where admin
    //                    reached them
    //
    // Vendor + Partner are now symmetric: both have a contactEmail
    // column separate from User.email (auth login). That separation
    // matters in B2B — login and operational contact emails diverge
    // in real businesses.
    //
    // Done outside the transaction above because Better Auth's signIn
    // call below needs the credential row visible — if these were in
    // the same transaction the signIn would race the commit. The cost
    // of NOT being atomic here is low: if this step fails, the
    // consistent state is "user has password but partner still
    // INVITED", which the recipient can recover from by signing in
    // and having admin re-run the status flip manually.
    const fullName = `${firstName} ${lastName}`;
    if (type === "vendor") {
      await prisma.vendor.update({
        where: { id: record.id },
        data: {
          status: "ONBOARDING",
          invitationToken: null, // burn the token — single-use
          // Only seed if not already filled — handles the (rare) case
          // of admin pre-populating contact info on the placeholder
          // before the recipient accepts. We don't want to overwrite
          // an explicit admin-set value with the acceptance form data.
          contactPerson: record.contactPerson ?? fullName,
          contactPhone: record.contactPhone ?? (phone || null),
          contactEmail: (record as any).contactEmail ?? email,
        },
      });
      await prisma.vendorInvitationLog.create({
        data: {
          vendorId: record.id,
          email,
          companyName,
          action: "ACCEPTED",
          sentByUserId: updatedUserId,
          sentByName: fullName,
        },
      });
    } else {
      await prisma.partner.update({
        where: { id: record.id },
        data: {
          status: "ONBOARDING",
          invitationToken: null,
          contactPerson: (record as any).contactPerson ?? fullName,
          contactPhone: (record as any).contactPhone ?? (phone || null),
          contactEmail: (record as any).contactEmail ?? email,
        },
      });
      await prisma.partnerInvitationLog.create({
        data: {
          partnerId: record.id,
          email,
          companyName,
          action: "ACCEPTED",
          sentByUserId: updatedUserId,
          sentByName: fullName,
        },
      });
    }

    // ===== Step 4: create a session so the frontend can land
    //              straight in the portal =====
    // Better Auth's signInEmail validates the password against the
    // credential row we just inserted and issues a session. We
    // forward the set-cookie header so the frontend is signed in
    // immediately on redirect.
    try {
      const signInResponse = await auth.api.signInEmail({
        body: { email, password },
        asResponse: true,
      });
      const setCookie = signInResponse.headers.get("set-cookie");
      if (setCookie) res.setHeader("Set-Cookie", setCookie);
    } catch (signInErr) {
      // Non-fatal — if sign-in fails the frontend can redirect to the
      // login page and the user can sign in manually. Their
      // credential is already saved.
      console.warn(
        `[acceptInvitation] auto sign-in failed for ${email}, user will sign in manually`,
      );
    }

    res.json({
      success: true,
      message: "Welcome to LuxDrive",
      data: {
        type,
        userId: updatedUserId,
        companyName,
        email,
        // Frontend uses this to pick the right portal redirect.
        // Append ?tab=profile so the dashboard opens directly on the
        // profile section — the only thing a freshly-onboarded
        // user can actually act on. Without this they land on the
        // generic dashboard with locked panels and toast prompts.
        redirectTo:
          type === "vendor"
            ? "/dashboard/vendor?tab=profile"
            : "/dashboard/partner?tab=profile",
      },
    });
  },
);
