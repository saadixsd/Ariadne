import "server-only";

import { PrismaClient } from "@prisma/client";

type WorkerModules = {
  context: () => { env: CloudflareEnv };
  contextAsync: () => Promise<{ env: CloudflareEnv }>;
  createClient: (env: CloudflareEnv) => PrismaClient;
};

const globalForPrisma = globalThis as unknown as {
  prisma?: PrismaClient;
  prismaWorker?: WorkerModules;
  prismaPerRequest?: WeakMap<object, PrismaClient>;
};

async function createDevClient() {
  const { createNodeSqliteAdapter } = await import("@/lib/node-sqlite");
  const { resolve } = await import("node:path");
  return new PrismaClient({
    adapter: createNodeSqliteAdapter(resolve(process.cwd(), "prisma/dev.db")),
  });
}

async function loadWorkerModules(): Promise<WorkerModules> {
  const { getCloudflareContext } = await import("@opennextjs/cloudflare");
  const { PrismaD1 } = await import("@prisma/adapter-d1");
  const { createRequire } = await import("node:module");
  const { PrismaClient: WorkerPrisma } = createRequire(import.meta.url)("@prisma/client/wasm") as {
    PrismaClient: typeof PrismaClient;
  };
  return {
    context: () => getCloudflareContext(),
    contextAsync: () => getCloudflareContext({ async: true }),
    createClient(env) {
      if (!env.DB) throw new Error("D1 binding DB is missing");
      return new WorkerPrisma({ adapter: new PrismaD1(env.DB) });
    },
  };
}

/*
  On Workers the client is per REQUEST, never per isolate. One isolate serves many
  requests at once, and a shared PrismaClient shares its findUnique batcher and query
  engine: production D1 logs show two requests' session lookups merged into a single
  query (`tokenHash IN (?,?)`). That query runs inside ONE request's I/O context, and
  Workers cancel a request's pending I/O and continuations when that request ends, so
  the other request can be left waiting forever and is killed as hung before it has
  written anything, then the next ones on that isolate fail too.

  The key is OpenNext's per-request context object (a fresh `{ env, ctx, cf }` for every
  request via AsyncLocalStorage.run), held in a WeakMap so the client is dropped with
  the request. No AsyncLocalStorage.enterWith() (workerd does not implement it). Local
  `next dev` keeps one node:sqlite client for the process.
*/
function requestClient(worker: WorkerModules, context: { env: CloudflareEnv }): PrismaClient {
  const clients = (globalForPrisma.prismaPerRequest ??= new WeakMap());
  let client = clients.get(context);
  if (!client) {
    client = worker.createClient(context.env);
    clients.set(context, client);
  }
  return client;
}

export async function getPrisma(): Promise<PrismaClient> {
  // A process-wide client: local `next dev`, or one a test injected. Never set on Workers.
  if (globalForPrisma.prisma) return globalForPrisma.prisma;
  if (process.env.NODE_ENV === "development") {
    globalForPrisma.prisma ??= await createDevClient();
    return globalForPrisma.prisma;
  }
  const worker = (globalForPrisma.prismaWorker ??= await loadWorkerModules());
  return requestClient(worker, await worker.contextAsync());
}

function currentClient(): PrismaClient {
  if (globalForPrisma.prisma) return globalForPrisma.prisma;
  // Module references only (no request state), so reusing them across requests is safe.
  const worker = globalForPrisma.prismaWorker;
  if (!worker) throw new Error("Database client is not open yet");
  return requestClient(worker, worker.context());
}

export const prisma: PrismaClient = new Proxy({} as PrismaClient, {
  get(_target, prop) {
    const client = currentClient();
    const value = Reflect.get(client, prop, client) as unknown;
    return typeof value === "function" ? (value as (...args: unknown[]) => unknown).bind(client) : value;
  },
});
