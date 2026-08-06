import "dotenv/config";
import { PrismaClient } from "../../generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const connectionString = process.env.DATABASE_URL!;

// ------------------------------------------------------------------
// Soft-delete guard for bookings.
//
// Bookings carry a `deletedAt` timestamp, set when an admin approves a
// partner deletion request. The row is RETAINED (invoice / payout FK
// integrity, audit trail, analytics consistency) but must never surface
// in normal reads. Rather than append `deletedAt: null` to the ~165
// booking-read call sites by hand — the exact place soft-delete leaks
// creep in — this client extension injects it into every top-level
// booking read.
//
// findUnique / findUniqueOrThrow can't accept a non-unique filter in
// their `where`, so they delegate to findFirst / findFirstOrThrow on the
// base client (which already carries the same row shape).
//
// SCOPE: this covers TOP-LEVEL booking reads only. Nested relation reads
// (e.g. `partner.findUnique({ include: { bookings: true } })`) are NOT
// intercepted by a query extension — those handful of sites filter
// `deletedAt: null` explicitly in their own `include`/`select` where.
// ------------------------------------------------------------------
function createPrismaClient() {
  const adapter = new PrismaPg({ connectionString });
  const base = new PrismaClient({ adapter });

  const notDeleted = { deletedAt: null };

  return base.$extends({
    query: {
      booking: {
        findMany({ args, query }) {
          args.where = { ...args.where, ...notDeleted };
          return query(args);
        },
        findFirst({ args, query }) {
          args.where = { ...args.where, ...notDeleted };
          return query(args);
        },
        findFirstOrThrow({ args, query }) {
          args.where = { ...args.where, ...notDeleted };
          return query(args);
        },
        count({ args, query }) {
          args.where = { ...args.where, ...notDeleted };
          return query(args);
        },
        aggregate({ args, query }) {
          args.where = { ...args.where, ...notDeleted };
          return query(args);
        },
        groupBy({ args, query }) {
          args.where = { ...args.where, ...notDeleted };
          return query(args);
        },
        // Delegated to findFirst on the base client — see note above.
        findUnique({ args }) {
          return base.booking.findFirst({
            ...args,
            where: { ...args.where, ...notDeleted },
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
          } as any);
        },
        findUniqueOrThrow({ args }) {
          return base.booking.findFirstOrThrow({
            ...args,
            where: { ...args.where, ...notDeleted },
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
          } as any);
        },
      },
    },
  });
}

type ExtendedPrismaClient = ReturnType<typeof createPrismaClient>;

const globalForPrisma = globalThis as unknown as {
  prisma: ExtendedPrismaClient | undefined;
};

export const prisma = globalForPrisma.prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
