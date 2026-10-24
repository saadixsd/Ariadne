// Make signed outreach ref codes. Nothing is stored; paste the output into the outreach sheet.
// Usage: REF_SECRET=... node scripts/ref-codes.mjs 50 researchers-w1
import { createHmac, randomBytes } from "node:crypto";

const secret = process.env.REF_SECRET;
if (!secret) {
  console.error("Set REF_SECRET (the same value as the Worker secret).");
  process.exit(1);
}
const count = Number(process.argv[2] ?? 10);
const campaign = (process.argv[3] ?? "researchers-w1").toLowerCase();
const alphabet = "abcdefghijkmnpqrstuvwxyz23456789";
console.log("ref,link");
for (let i = 0; i < count; i++) {
  const id = [...randomBytes(6)].map((b) => alphabet[b % alphabet.length]).join("");
  const base = `r-${id}`;
  const ref = `${base}-${createHmac("sha256", secret).update(base).digest("hex").slice(0, 8)}`;
  console.log(`${ref},https://example.com/?ref=${ref}&utm_source=email&utm_campaign=${campaign}`);
}
