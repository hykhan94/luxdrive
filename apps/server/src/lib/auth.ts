import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { prisma } from "./prisma";
import { sendPasswordResetEmail } from "./email";

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
  trustedOrigins: ["http://localhost:3000", "http://localhost:5000"],
  advanced: {
    disableCSRFCheck: process.env.NODE_ENV !== "production",
  },
});
