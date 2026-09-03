/**
 * Prisma database client singleton.
 *
 * Uses the standard pattern of caching the client on `globalThis`
 * to prevent multiple instances during Next.js hot-reloading in development.
 *
 * Also exports `isDbAvailable()` — a lightweight health check that agents
 * call to decide whether to attempt a DB write or skip it immediately,
 * avoiding noisy ECONNREFUSED stack traces on every request when the local
 * PostgreSQL instance is not running.
 */

import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
  dbAvailable: boolean | undefined;
  dbCheckedAt: number | undefined;
};

/**
 * Shared Prisma client instance.
 * Import this wherever you need database access.
 *
 * @example
 * import { prisma } from "@/lib/db";
 * const drug = await prisma.drugRegistry.findUnique({ where: { registrationNo: "..." } });
 */
export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    // When DATABASE_URL is not set (e.g. Vercel deploy without DB configured),
    // use a placeholder URL so the PrismaClient constructor doesn't throw at
    // module import time. isDbAvailable() will return false and agents will
    // gracefully skip all DB operations.
    datasourceUrl: process.env.DATABASE_URL ?? "postgresql://placeholder:placeholder@localhost:5432/placeholder",
    log:
      process.env.NODE_ENV === "development"
        ? ["query", "error", "warn"]
        : ["error"],
  });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}

/**
 * Lightweight DB connectivity check.
 *
 * The result is cached for `DB_CHECK_TTL_MS` milliseconds so that every
 * request does not pay a round-trip penalty.  When the DB is down the check
 * itself times out quickly (1 s) and returns `false`, allowing agents to
 * fall back to mock data without log-spamming full connection stack traces.
 *
 * @returns `true` if PostgreSQL is reachable, `false` otherwise.
 */
const DB_CHECK_TTL_MS = 30_000; // re-probe at most once per 30 s

export async function isDbAvailable(): Promise<boolean> {
  const now = Date.now();

  // Return cached result while it is still fresh
  if (
    globalForPrisma.dbAvailable !== undefined &&
    globalForPrisma.dbCheckedAt !== undefined &&
    now - globalForPrisma.dbCheckedAt < DB_CHECK_TTL_MS
  ) {
    return globalForPrisma.dbAvailable;
  }

  try {
    // $queryRaw is a single cheap round-trip; timeout via AbortSignal
    const result = await Promise.race([
      prisma.$queryRaw`SELECT 1`,
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("DB health-check timeout")), 1_000)
      ),
    ]);

    globalForPrisma.dbAvailable = result !== undefined;
  } catch {
    globalForPrisma.dbAvailable = false;
  }

  globalForPrisma.dbCheckedAt = now;
  return globalForPrisma.dbAvailable ?? false;
}
