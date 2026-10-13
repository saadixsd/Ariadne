import assert from "node:assert/strict";
import { test } from "node:test";
import { campaignFromParams, decodeCampaign, encodeCampaign, isSignedRef, signRef } from "../../lib/campaign";
import { dailyRunLimit, DAILY_MODEL_RUNS, TRIAL_DAILY_MODEL_RUNS } from "../../lib/limits";

test("campaign params are cleaned and round-trip through the cookie value", () => {
  const c = campaignFromParams(new URLSearchParams("ref=R-ABC123-deadbeef&utm_source=email&utm_campaign=researchers-w1&x=1"));
  assert.deepEqual(c, { ref: "r-abc123-deadbeef", source: "email", campaign: "researchers-w1" });
  assert.deepEqual(decodeCampaign(encodeURIComponent(encodeCampaign(c!))), c);
  assert.equal(campaignFromParams(new URLSearchParams("q=1")), null);
  assert.equal(campaignFromParams(new URLSearchParams("ref=<script>")), null);
});

test("only a ref signed with REF_SECRET is trusted", async () => {
  const ref = await signRef("k7m2q9", "s3cret");
  assert.match(ref, /^r-k7m2q9-[0-9a-f]{8}$/);
  assert.equal(await isSignedRef(ref, "s3cret"), true);
  assert.equal(await isSignedRef(ref, "other"), false);
  assert.equal(await isSignedRef("r-k7m2q9-00000000", "s3cret"), false);
  assert.equal(await isSignedRef(ref, undefined), false);
});

test("outreach accounts skip the day-one trial cap", () => {
  const now = Date.now();
  assert.equal(dailyRunLimit({ createdAt: new Date(now) }, now), TRIAL_DAILY_MODEL_RUNS);
  assert.equal(dailyRunLimit({ createdAt: new Date(now), refCode: "r-abc-12345678" }, now), DAILY_MODEL_RUNS);
});

test("cookie value decodes whether encoded once, twice, or not at all", () => {
  const plain = "r-abc123-deadbeef|email|researchers-w1";
  const want = { ref: "r-abc123-deadbeef", source: "email", campaign: "researchers-w1" };
  assert.deepEqual(decodeCampaign(plain), want);
  assert.deepEqual(decodeCampaign(encodeURIComponent(plain)), want);
  assert.deepEqual(decodeCampaign(encodeURIComponent(encodeURIComponent(plain))), want);
});
