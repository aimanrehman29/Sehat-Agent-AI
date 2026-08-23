/**
 * Prisma database client singleton.
 *
 * Uses the standard pattern of caching the client on `globalThis`
 * to prevent multiple instances during Next.js hot-reloading in development.
 */

import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
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
    log:
      process.env.NODE_ENV === "development"
        ? ["query", "error", "warn"]
        : ["error"],
  });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
