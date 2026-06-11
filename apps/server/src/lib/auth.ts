import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { prisma } from "./prisma";
import { sendPasswordResetEmail } from "./email";
import { config } from "../config";

const isProd = process.env.NODE_ENV === "production";

export const auth = betterAuth({
  baseURL: process.env.BETTER_AUTH_URL,
  secret: process.env.BETTER_AUTH_SECRET,
  database: prismaAdapter(prisma, {
    provider: "postgresql",
  }),
  emailAndPassword: {
    enabled: true,
    // Wire password-reset emails through Resend. Better Auth generates
    // the token and signed URL itself; we just deliver it. The `url`
    // arg is already a complete reset link pointing at the frontend
    // (configured via BETTER_AUTH_URL + the client's redirect).
    sendResetPassword: async ({ user, url }) => {
      await sendPasswordResetEmail({
        to: user.email,
        resetUrl: url,
        userName: user.name || undefined,
      });
    },
    // Reset token TTL: 1 hour. Shorter than the invitation TTL (72h)
    // because password resets are higher-stakes — anyone with the link
    // can hijack the account, so we want it to expire fast.
    resetPasswordTokenExpiresIn: 60 * 60,
  },
  user: {
    additionalFields: {
      role: {
        type: "string",
        input: false, // users can't set their own role
        defaultValue: "CUSTOMER",
      },
      phone: {
        type: "string",
        required: false,
      },
      firstName: {
        type: "string",
        required: false,
      },
      lastName: {
        type: "string",
        required: false,
      },
    },
  },
  session: {
    expiresIn: 60 * 60 * 24 * 7,
    updateAge: 60 * 60 * 24,
  },
  // Trusted origins read from the same env-driven list as CORS.
  // In dev: ["http://localhost:3000"] etc.
  // In prod: ["https://luxdriveksa.com", "https://www.luxdriveksa.com"]
  trustedOrigins: config.cors.origins,
  advanced: {
    disableCSRFCheck: !isProd,

    // Cross-subdomain cookies (production only).
    //
    // In production the frontend is at luxdriveksa.com and the backend
    // at api.luxdriveksa.com — different subdomains of the same root.
    // For the session cookie to travel between them we need:
    //   1. Cookie Domain set to the shared parent .luxdriveksa.com
    //      (the leading dot makes it apply to all subdomains)
    //   2. SameSite=None + Secure=true so modern browsers send the
    //      cookie on cross-site requests at all
    //
    // In dev (no COOKIE_DOMAIN env var set) we skip this block and
    // Better Auth uses its safe localhost defaults — cookie scoped to
    // the host, SameSite=Lax, no Secure requirement.
    ...(process.env.COOKIE_DOMAIN && {
      crossSubDomainCookies: {
        enabled: true,
        domain: process.env.COOKIE_DOMAIN,
      },
    }),
    defaultCookieAttributes: {
      sameSite: isProd ? "none" : "lax",
      secure: isProd,
    },
  },
});
