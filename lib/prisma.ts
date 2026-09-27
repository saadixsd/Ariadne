import "server-only";

import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

async function createClient() {
  if (process.env.NODE_ENV === "development") {
    const { createNodeSqliteAdapter } = await import("@/lib/node-sqlite");
    const { resolve } = await import("node:path");
    return new PrismaClient({
      adapter: createNodeSqliteAdapter(resolve(process.cwd(), "prisma/dev.db")),
    });
  }

  const { getCloudflareContext } = await import("@opennextjs/cloudflare");
  const { PrismaD1 } = await import("@prisma/adapter-d1");
  const { createRequire } = await import("node:module");
  const { PrismaClient: WorkerPrisma } = createRequire(import.meta.url)("@prisma/client/wasm") as {
    PrismaClient: typeof PrismaClient;
  };
  const { env } = await getCloudflareContext({ async: true });
  if (!env.DB) throw new Error("D1 binding DB is missing");
  return new WorkerPrisma({ adapter: new PrismaD1(env.DB) });
}

// One client per isolate. Workerd does not implement AsyncLocalStorage.enterWith(),
// and calling it crashes every signed-in page. D1's binding is safe to share here.
export async function getPrisma() {
  if (!globalForPrisma.prisma) globalForPrisma.prisma = await createClient();
  return globalForPrisma.prisma;
}

export const prisma: PrismaClient = new Proxy({} as PrismaClient, {
  get(_target, prop, receiver) {
    const client = globalForPrisma.prisma;
    if (!client) throw new Error("Database client is not open yet");
    const value = Reflect.get(client, prop, receiver) as unknown;
    return typeof value === "function" ? (value as (...args: unknown[]) => unknown).bind(client) : value;
  },
});
