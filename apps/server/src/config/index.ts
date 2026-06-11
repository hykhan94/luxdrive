import dotenv from "dotenv";

dotenv.config();

export const config = {
  port: parseInt(process.env.PORT || "5000", 10),
  nodeEnv: process.env.NODE_ENV || "development",
  isDev: process.env.NODE_ENV !== "production",
  isProd: process.env.NODE_ENV === "production",

  database: {
    url: process.env.DATABASE_URL || "",
  },

  cors: {
    // Comma-separated list of trusted origins. Used by both:
    //   1. The Express CORS middleware (apps/server/src/index.ts)
    //   2. Better Auth's trustedOrigins config (apps/server/src/lib/auth.ts)
    // Each origin must be the EXACT scheme + host (+ port if non-default).
    // No trailing slash. Both .map(trim) so spaces around commas don't break it.
    origins: process.env.CORS_ORIGINS?.split(",").map((s) => s.trim()) || [
      "http://localhost:3000",
    ],
  },

  jwt: {
    secret: process.env.JWT_SECRET || "your-secret-key",
    expiresIn: process.env.JWT_EXPIRES_IN || "7d",
  },
};
