import { test } from "node:test";
import assert from "node:assert/strict";
import { answers, fromForm, normalizeEmail, referrerHost, text, tools } from "../src/validate.ts";

test("emails are trimmed, lowercased and shape-checked", () => {
  assert.equal(normalizeEmail("  Saad@Example.COM "), "saad@example.com");
  assert.equal(normalizeEmail("a.b+tag@sub.example.co"), "a.b+tag@sub.example.co");
  for (const bad of ["", "nope", "a@b", "a@b.c", "a@@b.com", "a..b@x.com", "a b@x.com", "<a>@x.com", "x@-bad.com", 42, null]) {
    assert.equal(normalizeEmail(bad), null, String(bad));
  }
  assert.equal(normalizeEmail(`${"a".repeat(65)}@x.com`), null);
});

test("free text is cleaned and capped", () => {
  assert.equal(text("  code\n\nand\twriting  ", 280), "code and writing");
  assert.equal(text("x".repeat(400), 280)?.length, 280);
  assert.equal(text("   ", 280), null);
  assert.equal(text(5, 280), null);
});

test("tools keep only known ids, in a fixed order", () => {
  assert.deepEqual(tools(["other", "claude", "claude", "evil", 3, "gpt"]), ["claude", "gpt", "other"]);
  assert.deepEqual(tools("claude"), []);
});

test("answers: other text only kept when Other is ticked; switching must be a known value", () => {
  const a = answers({ tools: ["cursor"], toolsOther: "Perplexity", switching: "hourly", usesAiFor: "research" }, []);
  assert.equal(a.tools, "cursor");
  assert.equal(a.toolsOther, null);
  assert.equal(a.switching, null);
  assert.equal(a.usesAiFor, "research");
  const b = answers({ tools: ["other"], toolsOther: " Perplexity ", switching: "several_daily" }, []);
  assert.equal(b.toolsOther, "Perplexity");
  assert.equal(b.switching, "several_daily");
});

test("referrer is reduced to a host, and our own host is dropped", () => {
  assert.equal(referrerHost("https://news.ycombinator.com/item?id=1", ["ariadneagents.si"]), "news.ycombinator.com");
  assert.equal(referrerHost("https://ariadneagents.si/", ["ariadneagents.si"]), null);
  assert.equal(referrerHost("javascript:alert(1)", []), null);
  assert.equal(referrerHost("not a url", []), null);
});

test("unanswered fields are null, so an update never blanks a stored answer", () => {
  const a = answers({}, []);
  assert.deepEqual([a.usesAiFor, a.tools, a.toolsOther, a.switching], [null, null, null, null]);
});

test("a no-JS form post maps onto the JSON shape", () => {
  const body = fromForm(new URLSearchParams("email=a%40b.co&tools=claude&tools=other&toolsOther=Perplexity&switching=daily&cf-turnstile-response=tok"));
  assert.deepEqual(body.tools, ["claude", "other"]);
  assert.equal(body.turnstileToken, "tok");
  assert.equal(body.done, true);
});
