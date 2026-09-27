interface SendEmail {
  send(message: {
    to: string;
    from: string | { email: string; name?: string };
    subject: string;
    text?: string;
  }): Promise<void>;
}

declare global {
  interface CloudflareEnv {
    DB?: D1Database;
    EMAIL?: SendEmail;
    EMAIL_FROM?: string;
  }
}

export {};
