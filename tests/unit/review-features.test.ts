// Critique flags, before/after, addressed marking and attribution: pure functions,
// fixtures only. No model, no database.
import assert from "node:assert/strict";
import { test } from "node:test";
import { attributionFor, attributionLine, isReviewStep, loopHands, stepPhase } from "../../lib/attribution";
import { appendToNote, compareVersions, markAddressed, noteLineFor, parseCritique } from "../../lib/critique";
import { parseFinalArtifact } from "../../lib/final-artifact";
import { carriedNoun } from "../../lib/thread";
import type { AgentDTO, ProjectDTO, TaskDTO, TaskRunDTO } from "../../lib/types";
import { critiqueBetween, mayHaveEarlierVersion, versionsOf } from "../../lib/versions";

test("flags: numbered points with a labelled fix", () => {
  const review = [
    "Verdict: close, but the hero undersells it.",
    "",
    "1. The call to action is buried below the fold. Suggested fix: move the signup button into the hero.",
    "2. Pricing is never mentioned. Fix: add a short pricing line with the monthly price.",
    "3) The tone drifts formal in the FAQ.",
  ].join("\n");
  const critique = parseCritique(review);
  assert.equal(critique.verdict, "close, but the hero undersells it.");
  assert.equal(critique.flags.length, 3);
  assert.deepEqual(critique.flags[0], {
    id: "f1",
    section: null,
    claim: null,
    issue: "The call to action is buried below the fold.",
    evidence: null,
    opinion: false,
    confidence: null,
    fix: "Move the signup button into the hero.",
  });
  assert.equal(critique.flags[1].fix, "Add a short pricing line with the monthly price.");
  assert.equal(critique.flags[2].fix, null);
  assert.equal(critique.flags[2].issue, "The tone drifts formal in the FAQ.");
});

test("flags: bulleted points with a bold section and a dash before the fix", () => {
  const critique = parseCritique(
    ["**Flags**", "- **Hero:** the headline is vague — lead with the outcome for builders", "* **Proof** – no testimonials → add two short quotes from early users", "• CTA: says “Learn more”"].join("\n"),
  );
  assert.equal(critique.flags.length, 3);
  assert.deepEqual(
    critique.flags.map((flag) => [flag.section, flag.issue, flag.fix]),
    [
      ["Hero", "the headline is vague", "Lead with the outcome for builders"],
      ["Proof", "no testimonials", "Add two short quotes from early users"],
      ["CTA", "says “Learn more”", null],
    ],
  );
});

test("flags: a section label may contain fix-like words (“Call to action”)", () => {
  const [flag] = parseCritique('1. **Call to action:** "Learn more" is a dead end — replace it with "Become a member"').flags;
  assert.deepEqual([flag.section, flag.issue, flag.fix], ["Call to action", '"Learn more" is a dead end', 'Replace it with "Become a member"']);
});

test("flags: unlisted “Section: issue — fix” lines", () => {
  const critique = parseCritique(
    ["Here is my critique.", "", "Hero: the headline is generic — name the audience in it", "Pricing: missing entirely — add the $29/month plan", "Footer: fine as is"].join("\n"),
  );
  assert.equal(critique.flags.length, 3);
  assert.equal(critique.flags[0].section, "Hero");
  assert.equal(critique.flags[1].fix, "Add the $29/month plan");
  assert.equal(critique.flags[2].fix, null);
});

test("flags: nested Issue/Fix bullets fold into their point; headings name sections; strengths are not flags", () => {
  const review = [
    "## What works",
    "- The structure is clear.",
    "- Good use of examples.",
    "## Pricing section",
    "1. **Price table**",
    "   - Issue: no prices are shown",
    "   - Fix: add a three-tier table",
    "## Issues",
    "- The intro repeats the brief — cut the first paragraph",
  ].join("\n");
  const critique = parseCritique(review);
  assert.equal(critique.flags.length, 2, JSON.stringify(critique.flags));
  assert.deepEqual([critique.flags[0].section, critique.flags[0].issue, critique.flags[0].fix], ["Price table", "no prices are shown", "Add a three-tier table"]);
  // "Issues" is too generic to be a section.
  assert.deepEqual([critique.flags[1].section, critique.flags[1].fix], [null, "Cut the first paragraph"]);
});

test("flags: prose with no points falls back to the review as written", () => {
  const prose = "The draft reads well overall. I would tighten the opening and say more about who it is for, but nothing here is off-brief.";
  const critique = parseCritique(prose);
  assert.equal(critique.flags.length, 0);
  assert.equal(critique.prose, prose);
  assert.equal(parseCritique("").flags.length, 0);
  assert.equal(parseCritique(null).prose, "");
});

test("flags: Add to note appends the fix once, one per line, within the cap", () => {
  const [hero, faq] = parseCritique("- Hero: vague headline — lead with the outcome\n- FAQ: too formal").flags;
  assert.equal(noteLineFor(hero), "Hero: Lead with the outcome.");
  assert.equal(noteLineFor(faq), "FAQ: address “too formal”.");
  let note = appendToNote("", noteLineFor(hero), 2000);
  assert.equal(note, "- Hero: Lead with the outcome.");
  note = appendToNote(note, noteLineFor(hero), 2000);
  assert.equal(note, "- Hero: Lead with the outcome.", "never twice");
  note = appendToNote("Make it warmer.", noteLineFor(faq), 2000);
  assert.equal(note, "Make it warmer.\n- FAQ: address “too formal”.");
  assert.equal(appendToNote("x".repeat(1990), noteLineFor(hero), 2000), "x".repeat(1990), "a line that would pass the cap is not added");
});

const V1 = ["# Tool library", "", "A place to borrow tools.", "", "- Drills", "- Ladders", "", "Learn more about us."].join("\n");
const V2 = [
  "# Tool library",
  "",
  "Borrow a drill, ladder or saw for free, for neighbours in Rosemont.",
  "",
  "- Drills",
  "- Ladders",
  "",
  "Membership is free; volunteers run Saturday pickup.",
].join("\n");

test("compare: sections are same, changed, added or cut", () => {
  const result = compareVersions(V1, V2);
  assert.deepEqual(
    result.rows.map((row) => row.kind),
    ["same", "changed", "same", "same", "changed"],
  );
  assert.equal(result.changed, 2);
  // Uneven gaps: what still looks alike pairs up, the rest is cut or new.
  const uneven = compareVersions("Intro.\n\nThe old pricing line, $10 a month.\n\nOutro.", "Intro.\n\nThe pricing line, $29 a month.\n\nA new FAQ.\n\nOutro.");
  assert.deepEqual(uneven.rows.map((row) => row.kind), ["same", "changed", "added", "same"]);
  const cut = compareVersions("A.\n\nGone paragraph here.\n\nSecond gone one.\n\nB.", "A.\n\nFresh text.\n\nB.");
  assert.deepEqual(cut.rows.map((row) => row.kind), ["same", "removed", "removed", "added", "same"]);
  const identical = compareVersions(V1, V1);
  assert.equal(identical.changed + identical.added + identical.removed, 0);
});

test("addressed: new fix words, a quoted phrase that is gone, and an untouched flag", () => {
  const flags = parseCritique(
    [
      "1. Hero: the line is generic — name the neighbourhood and say it is free",
      "2. CTA: “Learn more about us” is a dead end. Fix: replace it with how membership and volunteering work",
      "3. Safety: no rules for returning tools — add a late-return policy",
    ].join("\n"),
  ).flags;
  const marks = markAddressed(flags, V1, V2);
  assert.deepEqual(
    marks.map((mark) => mark.status),
    ["addressed", "addressed", "open"],
    JSON.stringify(marks),
  );
  assert.match(marks[1].evidence, /learn more about us/);
  // Nothing changed: nothing can look addressed.
  assert.ok(markAddressed(flags, V1, V1).every((mark) => mark.status === "open"));
});

function agent(id: string, name: string, provider: string): AgentDTO {
  return { id, projectId: "p", name, provider, model: provider === "human" ? "human" : `${provider}-model`, role: "", status: "idle" };
}

function task(id: string, agentId: string, title: string, dependsOn: string[], status = "pending", extra: Partial<TaskDTO> = {}): TaskDTO {
  return {
    id,
    projectId: "p",
    agentId,
    title,
    instructions: "",
    status,
    dependsOn,
    requiresApproval: agentId === "you",
    output: status === "done" ? `${title} output` : null,
    model: null,
    startedAt: null,
    completedAt: null,
    createdAt: "2026-10-02T00:00:00.000Z",
    ...extra,
  };
}

function project(statuses: Record<string, string>): ProjectDTO {
  const s = (id: string) => statuses[id] ?? "pending";
  return {
    id: "p",
    name: "P",
    brief: "",
    template: "own",
    createdAt: "2026-10-02T00:00:00.000Z",
    // Legacy names on purpose: attribution must still say Odysseus / Daedalus.
    agents: [agent("ody", "Scout", "anthropic"), agent("dae", "Maker", "openai"), agent("you", "You", "human")],
    tasks: [
      task("research", "ody", "Research the brief", [], s("research")),
      task("draft", "dae", "Draft from the brief", ["research"], s("draft")),
      task("review", "ody", "Review the draft", ["draft"], s("review")),
      task("approve", "you", "Approve the direction", ["review"], s("approve")),
      task("build", "dae", "Produce the work", ["approve"], s("build")),
    ],
    events: [],
  };
}

test("attribution: made by, reviewed by only once the review is spun, tied off by You", () => {
  const before = project({ research: "done", draft: "done" });
  const draft = (p: ProjectDTO) => p.tasks.find((item) => item.id === "draft") as TaskDTO;
  assert.equal(attributionLine(attributionFor(draft(before), before)), "Made by GPT · Daedalus — Challenge by Claude · Odysseus not spun yet");
  assert.equal(attributionFor(draft(before), before).reviewedBy, null, "never claims a review that has not happened");

  const reviewed = project({ research: "done", draft: "done", review: "done" });
  assert.equal(attributionLine(attributionFor(draft(reviewed), reviewed)), "Made by GPT · Daedalus — Challenged by Claude · Odysseus");

  const judged = project({ research: "done", draft: "done", review: "done", approve: "done", build: "done" });
  assert.equal(attributionLine(attributionFor(draft(judged), judged)), "Made by GPT · Daedalus — Challenged by Claude · Odysseus · tied off by You");
  const byId = (id: string) => judged.tasks.find((item) => item.id === id) as TaskDTO;
  assert.equal(attributionLine(attributionFor(byId("review"), judged)), "Made by Claude · Odysseus — Challenging GPT · Daedalus · tied off by You");
  // Research has no review step of its own; the final step has neither a review nor a knot after it.
  assert.equal(attributionFor(byId("research"), judged).reviewedBy, null);
  assert.equal(attributionLine(attributionFor(byId("build"), judged)), "Made by GPT · Daedalus");
  assert.equal(attributionLine(attributionFor(byId("approve"), judged)), "Judged by You");
});

test("attribution on the Oct 6 thread: Odysseus (Claude) drafts, Daedalus (GPT) challenges", () => {
  const legacy = project({ research: "done", draft: "done", review: "done", approve: "done", build: "done" });
  // New starter: Draft → Challenge → Judge → Tie Off writeup (research folded into Draft).
  const current: ProjectDTO = {
    ...legacy,
    agents: [agent("ody", "Odysseus", "anthropic"), agent("dae", "Daedalus", "openai"), agent("you", "You", "human")],
    tasks: [
      task("draft", "ody", "Draft the answer", [], "done"),
      task("review", "dae", "Challenge the draft", ["draft"], "done"),
      task("approve", "you", "Judge the draft", ["review"], "done"),
      task("build", "ody", "Write the tied-off answer", ["approve"], "done"),
    ],
  };
  const byId = (id: string) => current.tasks.find((item) => item.id === id) as TaskDTO;
  assert.equal(isReviewStep(byId("review"), current.agents), true, "a Challenge step is the critique step");
  assert.equal(attributionFor(byId("draft"), current).reviewedBy?.name, "Daedalus");
  assert.equal(attributionFor(byId("review"), current).reviews?.name, "Odysseus");
  assert.equal(attributionFor(byId("draft"), current).tiedOff, true);
  assert.equal(attributionLine(attributionFor(byId("draft"), current)), "Made by Claude · Odysseus — Challenged by GPT · Daedalus · tied off by You");
  // Where each step sits in the loop: labelled only when the graph says so.
  assert.deepEqual(current.tasks.map((item) => stepPhase(item, current)), ["draft", "challenge", "judge", null]);
  assert.deepEqual(loopHands(current), { drafter: "Odysseus", challenger: "Daedalus" });
  assert.deepEqual(loopHands(legacy), { drafter: "Daedalus", challenger: "Odysseus" }, "older projects keep their own roles");
  assert.equal(carriedNoun(byId("review"), current.agents), "challenge");
  assert.equal(carriedNoun(byId("approve"), current.agents), "approved draft");
  // Legacy Challenge shape still splits into flags for the knot.
  const challenge = parseCritique(
    [
      "Verdict: two claims don't hold up.",
      "1. The fund is described as leading pre-seed rounds. Outdated: its recent rounds are Series A. Suggested fix: drop it or say so.",
      "2. The draft cites a report for the market size, but the report gives a different figure. Fix: quote the report's figure.",
    ].join("\n"),
  );
  assert.equal(challenge.verdict, "two claims don't hold up.");
  assert.equal(challenge.flags.length, 2);
  assert.ok(challenge.flags.every((flag) => flag.fix));
});

test("atomic disputes: Claim / Objection / Evidence|Opinion / Confidence / Fix", () => {
  const critique = parseCritique(
    [
      "1. Claim: Montreal has ten strong pre-seed AI funds.",
      "   Objection: unsupported — the draft lists firms without saying why they are pre-seed.",
      "   Opinion: most named firms are known for Series A, not pre-seed.",
      "   Confidence: medium",
      "   Fix: keep only funds with a clear pre-seed thesis.",
      "",
      "2. Claim: Fund X led the last three AI rounds in the city.",
      "   Objection: contradicted by the draft's own table.",
      "   Evidence: \"Fund X participated in 1 of 3 rounds\" in the draft table.",
      "   Confidence: high",
      "   Fix: say participated, not led.",
    ].join("\n"),
  );
  assert.equal(critique.flags.length, 2);
  assert.equal(critique.flags[0].claim, "Montreal has ten strong pre-seed AI funds.");
  assert.match(critique.flags[0].issue, /unsupported/i);
  assert.equal(critique.flags[0].opinion, true);
  assert.equal(critique.flags[0].confidence, "medium");
  assert.match(critique.flags[0].fix ?? "", /pre-seed thesis/);
  assert.equal(critique.flags[1].opinion, false);
  assert.match(critique.flags[1].evidence ?? "", /participated in 1 of 3/);
  assert.equal(critique.flags[1].confidence, "high");
});

function run(attempt: number, outcome: string, output: string | null, startedAt: string, completedAt: string): TaskRunDTO {
  return { id: `r${attempt}-${startedAt}`, taskId: "t", attempt, outcome, provider: null, model: null, systemPrompt: null, prompt: null, output, error: null, latencyMs: null, tries: 1, startedAt, completedAt, createdAt: startedAt };
}

test("versions: only runs with output count; the critique between two versions is found by time", () => {
  const drafts = versionsOf([
    run(3, "succeeded", "v2 text", "2026-10-02T10:10:00Z", "2026-10-02T10:10:08Z"),
    run(1, "succeeded", "v1 text", "2026-10-02T10:00:00Z", "2026-10-02T10:00:08Z"),
    run(2, "failed", null, "2026-10-02T10:09:00Z", "2026-10-02T10:09:01Z"),
  ]);
  assert.deepEqual(drafts.map((version) => [version.label, version.run.output]), [["v1", "v1 text"], ["v2", "v2 text"]]);
  const reviews = versionsOf([
    run(1, "succeeded", "review of v1", "2026-10-02T10:01:00Z", "2026-10-02T10:01:08Z"),
    run(2, "succeeded", "review of v2", "2026-10-02T10:11:00Z", "2026-10-02T10:11:08Z"),
  ]);
  assert.equal(critiqueBetween(reviews, drafts[0], drafts[1])?.run.output, "review of v1");

  const p = project({ draft: "done" });
  const draft = { ...(p.tasks[1] as TaskDTO), output: "v2 text" };
  assert.equal(mayHaveEarlierVersion(draft, p), false);
  const sentBack = { ...p, events: [{ id: "e", projectId: "p", type: "note", message: "", taskId: "approve", fromTaskId: null, toTaskId: null, runId: null, payload: { decision: "changes_requested", clearedTaskIds: ["draft", "review", "approve"] }, createdAt: "" }] };
  assert.equal(mayHaveEarlierVersion(draft, sentBack), true);
});

// Regression (Oct 2 2026, error 1102): parsing and comparing are bounded, so a long or
// fully rewritten output can never stall a render.
test("bounds: a fully rewritten long draft compares in bounded time", async () => {
  const { compareVersions: compare, markAddressed: mark, parseCritique: parse, critiqueOf, MAX_PARSE_CHARS } = await import("../../lib/critique");
  const before = Array.from({ length: 1200 }, (_, i) => `old ${i} alpha beta gamma delta ${i * 3}`).join("\n\n");
  const after = Array.from({ length: 1201 }, (_, i) => `new ${i} alpha beta gamma epsilon ${i * 7}`).join("\n\n");
  const flags = parse(Array.from({ length: 20 }, (_, i) => `- issue ${i} alpha — fix: add epsilon ${i}`).join("\n")).flags;
  const started = performance.now();
  const comparison = compare(before, after);
  const marks = mark(flags, before, after, comparison);
  const elapsed = performance.now() - started;
  assert.ok(elapsed < 500, `compare + mark took ${elapsed.toFixed(0)}ms`);
  assert.equal(marks.length, 20);
  assert.ok(comparison.rows.length > 0);

  const huge = Array.from({ length: 4000 }, (_, i) => `- point ${i} — fix: do ${i}`).join("\n");
  const t0 = performance.now();
  const parsed = parse(huge);
  assert.ok(performance.now() - t0 < 200);
  assert.ok(parsed.flags.length <= 40);
  assert.equal(parsed.prose, huge.trim());
  assert.ok(MAX_PARSE_CHARS >= 10_000);
  assert.equal(critiqueOf(huge), critiqueOf(huge));
});

test("bounds: small comparisons are unchanged by the caps", () => {
  const before = "# Title\n\nIntro para about tools.\n\n- one\n- two";
  const after = "# Title\n\nIntro para about tools and volunteers.\n\n- one\n- two\n- three";
  const comparison = compareVersions(before, after);
  assert.equal(comparison.same, 3);
  assert.equal(comparison.changed, 1);
  assert.equal(comparison.added, 1);
});

test("final artifact: Answer / Sources / Disagreements / Attention", () => {
  const artifact = parseFinalArtifact(
    [
      "## Answer",
      "Hire locally first.",
      "",
      "## Sources",
      "The draft's market table.",
      "",
      "## Disagreements",
      "None.",
      "",
      "## Attention required",
      "Confirm Fund X's latest cheque size.",
    ].join("\n"),
  );
  assert.equal(artifact.structured, true);
  assert.match(artifact.answer, /Hire locally/);
  assert.match(artifact.sources ?? "", /market table/);
  assert.equal(artifact.disagreements, "None.");
  assert.match(artifact.attention ?? "", /Fund X/);
  assert.equal(parseFinalArtifact("Just a plain answer.").structured, false);
});
