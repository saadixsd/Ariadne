import { createHash, pbkdf2, randomBytes, randomInt, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";

const hashPasswordBytes = promisify(pbkdf2);
const ITERATIONS = 100_000;

export async function hashPassword(password: string) {
  const salt = randomBytes(16).toString("hex");
  const hash = (await hashPasswordBytes(password, salt, ITERATIONS, 32, "sha256")).toString("hex");
  return { salt, hash };
}

export async function verifyPassword(password: string, salt: string, expectedHash: string) {
  const hash = (await hashPasswordBytes(password, salt, ITERATIONS, 32, "sha256")).toString("hex");
  const left = Buffer.from(hash, "hex");
  const right = Buffer.from(expectedHash, "hex");
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}

export function sha256(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

export function randomToken() {
  return randomBytes(32).toString("hex");
}

export function verificationCode() {
  return randomInt(0, 1_000_000).toString().padStart(6, "0");
}
