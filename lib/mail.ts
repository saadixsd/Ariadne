import { getPrisma } from "@/lib/prisma";

type SendBinding = {
  send(message: {
    to: string;
    from: { email: string; name?: string };
    subject: string;
    text: string;
  }): Promise<void>;
};

/*
  Outbound email. Two senders, in order:
  1. Brevo's HTTP API when the BREVO_API_KEY secret is set (free tier, works on Workers Free).
  2. Cloudflare Email Service's `EMAIL` send binding (needs Workers Paid for arbitrary recipients).
  With neither, canSendEmail() is false and callers say so; nothing pretends to send.
*/
export async function canSendEmail() {
  const from = await emailFrom();
  if (!from) return false;
  return Boolean((await brevoKey()) || (await emailBinding()));
}

export async function sendEmail(to: string, subject: string, text: string) {
  const from = await emailFrom();
  if (!from) return false;
  try {
    const key = await brevoKey();
    if (key) {
      const res = await fetch(process.env.BREVO_API_URL?.trim() || "https://api.brevo.com/v3/smtp/email", {
        method: "POST",
        headers: { "api-key": key, "content-type": "application/json", accept: "application/json" },
        body: JSON.stringify({ sender: { email: from, name: "Ariadne" }, to: [{ email: to }], subject, textContent: text }),
      });
      if (!res.ok) throw new Error(`Brevo ${res.status}`);
      return true;
    }
    const email = await emailBinding();
    if (!email) return false;
    await email.send({ to, from: { email: from, name: "Ariadne" }, subject, text });
    return true;
  } catch (error) {
    // E.g. E_SENDER_DOMAIN_NOT_AVAILABLE or a Brevo 4xx. Callers roll back and say so.
    console.error("[ariadne] email failed", error instanceof Error ? error.message : "unknown");
    return false;
  }
}

export async function sendVerificationCode(to: string, code: string) {
  return sendEmail(to, "Your Ariadne code", `Your Ariadne verification code is ${code}. It expires in 15 minutes.`);
}

async function brevoKey() {
  const configured = process.env.BREVO_API_KEY?.trim();
  if (configured) return configured;
  try {
    const { getCloudflareContext } = await import("@opennextjs/cloudflare");
    const { env } = await getCloudflareContext({ async: true });
    return (env as unknown as Record<string, string | undefined>).BREVO_API_KEY?.trim() || "";
  } catch {
    return "";
  }
}

async function emailFrom() {
  const configured = process.env.EMAIL_FROM?.trim();
  if (configured) return configured;
  try {
    const { getCloudflareContext } = await import("@opennextjs/cloudflare");
    const { env } = await getCloudflareContext({ async: true });
    return env.EMAIL_FROM?.trim() || "";
  } catch {
    return "";
  }
}

async function emailBinding(): Promise<SendBinding | null> {
  try {
    const { getCloudflareContext } = await import("@opennextjs/cloudflare");
    const { env } = await getCloudflareContext({ async: true });
    return (env.EMAIL as SendBinding | undefined) ?? null;
  } catch {
    return null;
  }
}

export async function recentCodeCount(userId: string) {
  const prisma = await getPrisma();
  const since = new Date(Date.now() - 60 * 60 * 1000);
  return prisma.verificationCode.count({
    where: { userId, createdAt: { gte: since } },
  });
}
