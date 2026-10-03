import { test } from "node:test";
import assert from "node:assert/strict";
import { readToken, signToken, TOKEN_TTL_MS } from "../src/token.ts";

test("a signed token reads back to its row id", async () => {
  const token = await signToken("s3cret", 42);
  assert.equal(await readToken("s3cret", token), 42);
});

test("wrong secret, tampering, expiry and junk are all rejected", async () => {
  const now = Date.now();
  const token = await signToken("s3cret", 42, now);
  assert.equal(await readToken("other", token), null);
  const [payload, sig] = token.split(".");
  const forged = Buffer.from("43." + (now + TOKEN_TTL_MS)).toString("base64url");
  assert.equal(await readToken("s3cret", `${forged}.${sig}`), null);
  assert.equal(await readToken("s3cret", `${payload}.${sig.slice(0, -2)}AA`), null);
  assert.equal(await readToken("s3cret", token, now + TOKEN_TTL_MS + 1), null);
  for (const junk of ["", "a.b", "a.b.c", "x".repeat(300), 7, null]) assert.equal(await readToken("s3cret", junk), null);
});
