interface SendEmail {
  send(message: {
    to: string;
    from: string | { email: string; name?: string };
    subject: string;
    text?: string;
  }): Promise<void>;
}

/** The part of Cloudflare's R2 binding Ariadne uses (lib/file-store.ts). */
interface R2ObjectLite {
  key: string;
  size: number;
  body: ReadableStream;
  httpMetadata?: { contentType?: string };
}
interface R2BucketLite {
  put(key: string, value: ArrayBuffer, options?: { httpMetadata?: { contentType?: string } }): Promise<unknown>;
  get(key: string): Promise<R2ObjectLite | null>;
  list(options: { prefix?: string; cursor?: string; limit?: number }): Promise<{ objects: { key: string }[]; truncated: boolean; cursor?: string }>;
  delete(keys: string | string[]): Promise<void>;
}

declare global {
  type R2Bucket = R2BucketLite;
  interface CloudflareEnv {
    DB?: D1Database;
    /** Original uploaded files, u/<userId>/<projectId>/<sourceId>; deleted after 3 days (R2 lifecycle). */
    FILES?: R2Bucket;
    EMAIL?: SendEmail;
    EMAIL_FROM?: string;
  }
}

export {};
