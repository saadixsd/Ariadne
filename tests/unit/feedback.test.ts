import assert from "node:assert/strict";
import { test } from "node:test";
import { parseFeedback, shouldPromptFeedback } from "../../lib/feedback";

test("structured feedback: rating and answers, project opt-in only with a project", () => {
  const f = parseFeedback({ rating: 4, worked: " the issues list ", projectId: "p1", allowProjectView: true, source: "popup" });
  assert.equal(f.kind, "rating");
  assert.equal(f.rating, 4);
  assert.equal(f.worked, "the issues list");
  assert.equal(f.allowProjectView, true);
  assert.equal(parseFeedback({ rating: 3, allowProjectView: true }).allowProjectView, false);
});

test("structured feedback rejects empty, bad ratings and long fields", () => {
  assert.throws(() => parseFeedback({}), /rating or write/);
  assert.throws(() => parseFeedback({ rating: 6 }), /1 to 5/);
  assert.throws(() => parseFeedback({ rating: 2.5 }), /1 to 5/);
  assert.throws(() => parseFeedback({ wrong: "x".repeat(2001) }), /too long/);
});

test("old quick notes still need a message", () => {
  assert.equal(parseFeedback({ kind: "bug", message: "broken" }).kind, "bug");
  assert.throws(() => parseFeedback({ kind: "bug" }), /Message/);
  assert.throws(() => parseFeedback({ kind: "nope", message: "x" }), /Kind/);
});

test("popup shows once, only after an approved deliverable", () => {
  assert.equal(shouldPromptFeedback({ feedbackPromptAt: null }, null), false);
  assert.equal(shouldPromptFeedback({ feedbackPromptAt: null }, new Date()), true);
  assert.equal(shouldPromptFeedback({ feedbackPromptAt: new Date() }, new Date()), false);
});
