import { getPrisma } from "@/lib/prisma";

type SendBinding = {
  send(message: {
    to: string;
    from: { email: string; name?: string };
    subject: string;
    text: string;
  }): Promise<void>;
};

export async function canSendEmail() {
  const from = await emailFrom();
  const email = await emailBinding();
  return Boolean(from && email);
}

export async function sendVerificationCode(to: string, code: string) {
  const from = await emailFrom();
  const email = await emailBinding();
  if (!from || !email) return false;
  await email.send({
    to,
    from: { email: from, name: "Ariadne" },
    subject: "Your Ariadne code",
    text: `Your Ariadne verification code is ${code}. It expires in 15 minutes.`,
  });
  return true;
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
