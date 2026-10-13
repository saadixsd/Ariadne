import "server-only";
/*
  Original uploaded files, kept in R2 for ORIGINAL_RETENTION_DAYS. Every key sits under
  the owner's prefix u/<userId>/…, so one user's files can be listed or deleted together
  and never mix with another's. The bucket's lifecycle rule (docs/WORKSPACE.md) deletes
  objects after 3 days; expiresAt in D1 mirrors it so the app never offers a deleted file.
  Text is always extracted in the browser; the Worker only stores bytes, it never parses them.
  When the FILES binding is missing (local `next dev`, a branch preview) the original is
  simply not kept and the app says so.
*/

export const ORIGINAL_RETENTION_DAYS = 3;
export const MAX_ORIGINAL_BYTES = 15 * 1024 * 1024;

export type StoredFile = { body: ReadableStream | ArrayBuffer; contentType: string | null; size: number };

export interface FileStore {
  put(key: string, body: ArrayBuffer, contentType: string | null): Promise<void>;
  get(key: string): Promise<StoredFile | null>;
  deletePrefix(prefix: string): Promise<void>;
}

export function userPrefix(userId: string) {
  return `u/${userId}/`;
}

export function originalKey(userId: string, projectId: string, sourceId: string) {
  return `${userPrefix(userId)}${projectId}/${sourceId}`;
}

export function originalExpiry(now = Date.now()) {
  return new Date(now + ORIGINAL_RETENTION_DAYS * 24 * 60 * 60 * 1000);
}

function r2Store(bucket: R2Bucket): FileStore {
  return {
    async put(key, body, contentType) {
      await bucket.put(key, body, { httpMetadata: contentType ? { contentType } : undefined });
    },
    async get(key) {
      const object = await bucket.get(key);
      if (!object) return null;
      return { body: object.body as unknown as ReadableStream, contentType: object.httpMetadata?.contentType ?? null, size: object.size };
    },
    async deletePrefix(prefix) {
      let cursor: string | undefined;
      do {
        const page = await bucket.list({ prefix, cursor, limit: 1000 });
        if (page.objects.length) await bucket.delete(page.objects.map((o) => o.key));
        cursor = page.truncated ? page.cursor : undefined;
      } while (cursor);
    },
  };
}

/** In-memory store for tests (set globalThis.__ariadneFileStore). */
export function memoryStore(): FileStore & { keys(): string[] } {
  const map = new Map<string, { body: ArrayBuffer; contentType: string | null }>();
  return {
    async put(key, body, contentType) {
      map.set(key, { body, contentType });
    },
    async get(key) {
      const v = map.get(key);
      return v ? { body: v.body, contentType: v.contentType, size: v.body.byteLength } : null;
    },
    async deletePrefix(prefix) {
      for (const k of [...map.keys()]) if (k.startsWith(prefix)) map.delete(k);
    },
    keys: () => [...map.keys()],
  };
}

export async function getFileStore(): Promise<FileStore | null> {
  const injected = (globalThis as { __ariadneFileStore?: FileStore }).__ariadneFileStore;
  if (injected) return injected;
  if (process.env.NODE_ENV === "development") return null;
  try {
    const { getCloudflareContext } = await import("@opennextjs/cloudflare");
    const { env } = await getCloudflareContext({ async: true });
    return env.FILES ? r2Store(env.FILES) : null;
  } catch {
    return null;
  }
}
