import "server-only";

import { cookies } from "next/headers";
import { TaskRunError } from "@/lib/errors";
import { canSendEmail, recentCodeCount, sendVerificationCode } from "@/lib/mail";
import { hashPassword, randomToken, sha256, verificationCode, verifyPassword } from "@/lib/password";
import { getPrisma } from "@/lib/prisma";

const COOKIE = "ariadne_session";
const SESSION_MS = 30 * 24 * 60 * 60 * 1000;
const CODE_MS = 15 * 60 * 1000;
const MAX_CODES_PER_HOUR = 5;

export type SessionUser = {
  id: string;
  email: string;
  emailVerified: boolean;
  firstName: string | null;
  lastName: string | null;
  /** With inviteCode, decides the account's daily run cap (lib/limits.ts dailyRunLimit). */
  createdAt: Date;
  inviteCode: string | null;
};

function normalizeEmail(value: string) {
  return value.trim().toLowerCase();
}

function validEmail(email: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) && email.length <= 200;
}

export async function currentUser(): Promise<SessionUser | null> {
  const jar = await cookies();
  const token = jar.get(COOKIE)?.value;
  if (!token) return null;
  const prisma = await getPrisma();
  const session = await prisma.session.findUnique({
    where: { tokenHash: sha256(token) },
    include: { user: true },
  });
  if (!session || session.expiresAt.getTime() < Date.now()) return null;
  return {
    id: session.user.id,
    email: session.user.email,
    emailVerified: session.user.emailVerified,
    firstName: session.user.firstName,
    lastName: session.user.lastName,
    createdAt: session.user.createdAt,
    inviteCode: session.user.inviteCode,
  };
}

export async function requireUser() {
  const user = await currentUser();
  if (!user) throw new TaskRunError("Sign in required", 401);
  if (!user.emailVerified) throw new TaskRunError("Verify your email before using the workspace", 403);
  return user;
}

// There is deliberately no "claim unowned projects" step on sign-up/sign-in/verify.
// It used to assign every project with userId = null to whichever account signed
// in next, so a stranger could take over orphaned data. Projects are only ever
// created with an owner (lib/starter-thread.ts) and never change owners.

async function startSession(userId: string) {
  const prisma = await getPrisma();
  const token = randomToken();
  await prisma.session.create({
    data: {
      userId,
      tokenHash: sha256(token),
      expiresAt: new Date(Date.now() + SESSION_MS),
    },
  });
  const jar = await cookies();
  jar.set(COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_MS / 1000,
  });
}

export async function signOut() {
  const jar = await cookies();
  const token = jar.get(COOKIE)?.value;
  if (token) {
    const prisma = await getPrisma();
    await prisma.session.deleteMany({ where: { tokenHash: sha256(token) } });
  }
  jar.set(COOKIE, "", { httpOnly: true, path: "/", maxAge: 0 });
}

async function issueCode(userId: string, email: string) {
  if ((await recentCodeCount(userId)) >= MAX_CODES_PER_HOUR) {
    throw new TaskRunError("Too many codes were requested. Wait an hour, then try again.", 429);
  }
  const prisma = await getPrisma();
  const code = verificationCode();
  await prisma.verificationCode.deleteMany({ where: { userId } });
  await prisma.verificationCode.create({
    data: {
      userId,
      codeHash: sha256(code),
      expiresAt: new Date(Date.now() + CODE_MS),
    },
  });
  const sent = await sendVerificationCode(email, code);
  if (!sent) {
    await prisma.verificationCode.deleteMany({ where: { userId } });
    return false;
  }
  return true;
}

/**
 * The cheap shape checks for sign-up, with no database work. The sign-up route runs them
 * before Turnstile, so a typo does not burn the visitor's single-use Turnstile token.
 */
export function checkSignUpInput(emailInput: string, password: string) {
  const email = normalizeEmail(emailInput);
  if (!validEmail(email)) throw new TaskRunError("Enter a valid email address", 400);
  if (password.length < 8) throw new TaskRunError("Password must be at least 8 characters", 400);
  if (password.length > 200) throw new TaskRunError("Password is too long", 400);
  return email;
}

export async function signUp(emailInput: string, password: string, options: { inviteCode?: string | null } = {}) {
  const email = checkSignUpInput(emailInput, password);

  const prisma = await getPrisma();
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) throw new TaskRunError("An account with that email already exists", 409);

  const { salt, hash } = await hashPassword(password);
  const mailReady = await canSendEmail();
  const user = await prisma.user.create({
    data: {
      email,
      passwordSalt: salt,
      passwordHash: hash,
      emailVerified: !mailReady,
      inviteCode: options.inviteCode ?? null,
    },
  });

  if (mailReady) {
    const sent = await issueCode(user.id, email);
    if (!sent) {
      await prisma.user.delete({ where: { id: user.id } });
      throw new TaskRunError("We could not send the verification email. Try again in a few minutes.", 503);
    }
    return { verify: true as const };
  }

  await startSession(user.id);
  return { verify: false as const };
}

export async function signIn(emailInput: string, password: string) {
  const email = normalizeEmail(emailInput);
  const prisma = await getPrisma();
  const user = validEmail(email) ? await prisma.user.findUnique({ where: { email } }) : null;
  const matches = user ? await verifyPassword(password, user.passwordSalt, user.passwordHash) : false;
  if (!user || !matches) throw new TaskRunError("Email or password is wrong", 401);
  if (!user.emailVerified) {
    throw new TaskRunError("Enter the code sent to your email", 403);
  }
  await startSession(user.id);
  return { email: user.email };
}

export async function verifyEmail(emailInput: string, codeInput: string) {
  const email = normalizeEmail(emailInput);
  const code = codeInput.trim();
  if (!/^\d{6}$/.test(code)) throw new TaskRunError("Enter the 6-digit code", 400);
  const prisma = await getPrisma();
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) throw new TaskRunError("That code is wrong or expired", 400);
  const match = await prisma.verificationCode.findFirst({
    where: { userId: user.id, codeHash: sha256(code), expiresAt: { gt: new Date() } },
  });
  if (!match) throw new TaskRunError("That code is wrong or expired", 400);
  await prisma.user.update({ where: { id: user.id }, data: { emailVerified: true } });
  await prisma.verificationCode.deleteMany({ where: { userId: user.id } });
  await startSession(user.id);
}

export async function resendCode(emailInput: string) {
  const email = normalizeEmail(emailInput);
  const prisma = await getPrisma();
  const user = validEmail(email) ? await prisma.user.findUnique({ where: { email } }) : null;
  if (!user || user.emailVerified) return;
  if (!(await canSendEmail())) {
    throw new TaskRunError("We could not send a code right now. Try again in a few minutes.", 503);
  }
  const sent = await issueCode(user.id, email);
  if (!sent) throw new TaskRunError("We could not send the verification email. Try again in a few minutes.", 503);
}
