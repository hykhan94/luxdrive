// ============================================
// apps/server/prisma/seed-minimal.ts
//
// Bare-minimum seed for a fresh cloud DB. Creates three users with
// login credentials — one each of ADMIN / VENDOR / PARTNER — and
// NOTHING ELSE. No Vendor row, no Partner row, no vehicles, no
// drivers, no bookings.
//
// Why this script exists separately from the full prisma/seed.ts:
// the full seed creates sample companies, vehicles, drivers, and
// bookings, which is great for local dev but pollutes the real
// production database with fake data. This minimal version is for
// initial cloud bootstrap — just enough to log in.
//
// IMPORTANT: VENDOR and PARTNER users created here have NO related
// Vendor/Partner rows. Logging into the vendor or partner portal
// with these accounts will fail because the controllers expect a
// vendor/partner record. Either:
//   (a) only use these accounts to confirm authentication works
//   (b) create the Vendor/Partner rows through the admin portal
//       onboarding flow after first login
//   (c) edit this script to add bare-minimum Vendor/Partner shells
//
// Run:
//   cd apps/server
//   yarn tsx prisma/seed-minimal.ts
//
// (Make sure DATABASE_URL in .env points at the cloud DB and the
// Cloud SQL Auth Proxy is running before you do.)
// ============================================

import "dotenv/config";
import { PrismaClient } from "../generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter });

// Edit these credentials BEFORE running the script. Passwords used
// here will be the actual login passwords for production users — pick
// strong ones, and change them via the app's "change password" flow
// after first login if you don't want them sitting in source control.
//
// Phone numbers are required by the schema. KSA format: +9665XXXXXXXX
const usersToSeed = [
  {
    email: "admin@luxdriveksa.com",
    password: "ChangeMe!Admin2026",
    name: "LuxDrive Admin",
    firstName: "LuxDrive",
    lastName: "Admin",
    phone: "+966500000001",
    role: "ADMIN" as const,
  },
  {
    email: "vendor@luxdriveksa.com",
    password: "ChangeMe!Vendor2026",
    name: "LuxDrive Vendor",
    firstName: "LuxDrive",
    lastName: "Vendor",
    phone: "+966500000002",
    role: "VENDOR" as const,
  },
  {
    email: "partner@luxdriveksa.com",
    password: "ChangeMe!Partner2026",
    name: "LuxDrive Partner",
    firstName: "LuxDrive",
    lastName: "Partner",
    phone: "+966500000003",
    role: "PARTNER" as const,
  },
];

async function main() {
  console.log("🌱 Seeding minimal credentials...\n");

  // Better Auth uses scrypt-based password hashing. The library
  // exposes it directly so we can write the same hash format Better
  // Auth would produce during a normal sign-up. Without this the
  // login endpoint would reject every seeded password as invalid.
  const { hashPassword } = await import("better-auth/crypto");

  for (const u of usersToSeed) {
    const hashedPassword = await hashPassword(u.password);

    // upsert so the script is idempotent — running it twice doesn't
    // crash on duplicate email, it just updates nothing on the User
    // and refreshes the password on the Account.
    const user = await prisma.user.upsert({
      where: { email: u.email },
      update: {},
      create: {
        email: u.email,
        name: u.name,
        firstName: u.firstName,
        lastName: u.lastName,
        phone: u.phone,
        role: u.role,
        emailVerified: true, // skip email-verification flow for seeded users
      },
    });

    // Better Auth stores the password hash on the Account table,
    // not on User. One User → many Accounts (one per provider).
    // For email/password the providerId is "credential" and the
    // accountId equals the user.id by convention.
    await prisma.account.upsert({
      where: {
        providerId_accountId: {
          providerId: "credential",
          accountId: user.id,
        },
      },
      update: {
        password: hashedPassword, // refresh on re-run
      },
      create: {
        userId: user.id,
        providerId: "credential",
        accountId: user.id,
        password: hashedPassword,
      },
    });

    console.log(`✅ ${u.role.padEnd(8)}  ${user.email}`);
  }

  console.log("\n🎉 Done. Three login-only credentials ready.\n");
  console.log("Next steps:");
  console.log(
    "  - Admin can log in to /dashboard/admin and start onboarding real",
  );
  console.log("    vendors/partners via the proper flows.");
  console.log(
    "  - The placeholder vendor@/partner@ accounts will fail to load",
  );
  console.log("    their portals until you add Vendor/Partner rows for them");
  console.log("    (or delete them and use the proper onboarding flow).");
}

main()
  .catch((e) => {
    console.error("❌ Seed failed:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
