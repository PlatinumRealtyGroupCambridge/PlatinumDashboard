import { PrismaClient } from "@prisma/client";

// Standard Next.js singleton pattern — avoids exhausting DB connections
// from hot-reloaded module instances in development.
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma = globalForPrisma.prisma ?? new PrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
