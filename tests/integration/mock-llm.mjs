// Local stand-in for the Anthropic and OpenAI HTTP APIs, so tests never call a
// real provider. Point the SDKs at it with ANTHROPIC_BASE_URL / OPENAI_BASE_URL.
//   POST /__mode {"fail": true|false}  -> make every provider call fail with 500
//   GET  /__stats                      -> {calls, failures}
//   POST /turnstile/v0/siteverify      -> Turnstile stand-in: tokens starting "pass" succeed
// Run standalone: node tests/integration/mock-llm.mjs [port]
import { createServer } from "node:http";

// Mock text shaped like real output, so local screenshots are representative. Test data only:
// it never reaches production (the mock is only used by tests and tools/devserver.sh).
const MOCK_DRAFT = `## Answer

The pilot's 18% reduction in reading time is a promising signal, but it does not yet show that the intervention works. With 12 participants and no control group, the result could come from practice effects or regression to the mean.

## What the pilot shows

- Reading time fell by 18% on average across the 12 participants.
- The effect was measured once, right after the intervention.
- Follow-up is planned for 2027, so there is no evidence yet on whether the effect lasts.

## What it does not show

1. **Causation.** Without a control group, any improvement over time is attributed to the intervention.
2. **Generalisability.** Twelve self-selected participants do not represent the target population.
3. **Size of the effect.** The pilot reports no confidence interval or variance.

## Comparison of next-step designs

| Design | Controls for practice effects | Rough sample size | Cost |
|---|---|---|---|
| Randomised controlled trial | Yes | 60–80 | High |
| Crossover with washout | Yes | 24–30 | Medium |
| Repeat pilot with waitlist control | Partly | 24 | Low |

## Recommendation

Run a waitlist-controlled repeat first: it is cheap, it tests whether the 18% holds against a comparison group, and it informs the sample size for a full trial. The intervention is widely considered best practice in reading research.
`;

const MOCK_TIED_OFF = `## Answer

The 18% reduction is a promising but preliminary signal. With n=12 and no control group it cannot show that the intervention causes faster reading.

## Sources

- Pilot study notes (pilot.pdf): n=12, 18% reduction, no control group, follow-up planned for 2027.
- The design comparison rests on the draft's reasoning, not on a cited source.

## Disagreements

None.

## Attention required

- Check the sample-size ranges against a power calculation before planning the trial.
`;

const MOCK_FACTCHECK = `Data checked: 2026-10-13

1. Claim: "Reading time fell by 18% on average across the 12 participants."
   Verdict: supported
   Evidence: The pilot notes say "In our pilot (n=12), the intervention reduced reading time by 18%."
   Source: pilot.pdf
   Severity: high

2. Claim: "Follow-up is planned for 2027."
   Verdict: unsupported
   Evidence: No follow-up date appears in the shared sources or in what I found.
   Source: none
   Severity: low
   Fix: Remove the date or cite where it comes from.

3. Claim: "A crossover with washout needs 24–30 participants."
   Verdict: wrong
   Evidence: The sample size depends on the expected effect and variance; the pilot reports no variance, so no range can be stated.
   Source: https://example.org/sample-size-guide
   Severity: medium
   Fix: Say the sample size needs a power calculation once variance is known.
`;

const MOCK_GPT = `1. Claim: The intervention is widely considered best practice in reading research.
   Objection: Unsupported — the draft cites no source for this, and the pilot notes say nothing about wider adoption.
   Opinion: I know of no consensus statement that names this intervention as best practice.
   Confidence: high
   Fix: Remove the sentence or cite a review that says so.

2. Claim: Reading time fell by 18% on average across the 12 participants.
   Objection: Misleading without spread — an average from 12 people can hide one or two large outliers.
   Evidence: "In our pilot (n=12), the intervention reduced reading time by 18%."
   Confidence: medium
   Fix: Report the median and range, or say the spread is unknown.

3. Claim: Crossover with washout needs 24–30 participants.
   Objection: Unsupported — the sample size depends on the expected effect and variance, which the pilot does not report.
   Opinion: These ranges look like rules of thumb rather than a power calculation.
   Confidence: medium
   Fix: Say the ranges are rough and need a power calculation.`;

function mockClaude(body) {
  return body.includes("tied-off answer") ? MOCK_TIED_OFF : MOCK_DRAFT;
}

export function startMockLlm(port = 0) {
  const state = { fail: false, calls: 0, failures: 0, lastBody: {} };
  const server = createServer(async (req, res) => {
    let body = "";
    for await (const chunk of req) body += chunk;
    const send = (status, json) => {
      res.writeHead(status, { "content-type": "application/json" });
      res.end(JSON.stringify(json));
    };
    if (req.url === "/__mode") {
      const parsed = JSON.parse(body || "{}");
      state.fail = parsed.fail === true;
      return send(200, { fail: state.fail });
    }
    if (req.url === "/__stats") return send(200, { calls: state.calls, failures: state.failures });
    // Stand-in for Cloudflare Turnstile siteverify (TURNSTILE_VERIFY_URL in tests). Not a
    // provider call, so it is not counted. Tokens starting with "pass" succeed.
    if (req.url === "/turnstile/v0/siteverify") {
      const form = new URLSearchParams(body);
      const ok = form.get("secret") === "test-secret" && (form.get("response") ?? "").startsWith("pass");
      state.siteverify = (state.siteverify ?? 0) + 1;
      return send(200, ok ? { success: true, hostname: "localhost" } : { success: false, "error-codes": ["invalid-input-response"] });
    }

    // Stand-in for Brevo's transactional email API (BREVO_API_URL in tests). Records mail.
    if (req.url === "/v3/smtp/email") {
      state.mail = [...(state.mail ?? []), { key: req.headers["api-key"], ...JSON.parse(body || "{}") }];
      return send(201, { messageId: `<mock-${state.mail.length}@test>` });
    }

    state.calls++;
    if (state.fail) {
      state.failures++;
      return send(500, { error: { type: "api_error", message: "mock provider is down" } });
    }
    const request = JSON.parse(body || "{}");
    state.lastBody[req.url?.endsWith("/messages") ? "anthropic" : "openai"] = request;
    const n = state.calls;
    // Replays the response shapes a current writer model sent in production (Oct 14 logs):
    // adaptive thinking, a paused turn mid-search, a turn that ends on tool results with no
    // text, then narration + answer text whose sources arrive as structured citations.
    if (req.url?.endsWith("/messages") && state.anthropicShape === "paused" ) {
      const msgs = request.messages ?? [];
      const base = { id: `msg_${n}`, type: "message", role: "assistant", model: request.model };
      const usage = { input_tokens: 1000, output_tokens: 200, cache_read_input_tokens: 0, server_tool_use: { web_search_requests: 1, web_fetch_requests: msgs.length === 1 ? 0 : 1 } };
      const tool = (id, name, input) => [
        { type: "server_tool_use", id, name, input },
        { type: name === "web_search" ? "web_search_tool_result" : "web_fetch_tool_result", tool_use_id: id, content: [] },
      ];
      if (request.tools && msgs.length === 1) {
        return send(200, { ...base, stop_reason: "pause_turn", usage, content: [{ type: "thinking", thinking: "plan", signature: "s" }, { type: "text", text: "I'll search for the official data." }, ...tool("srv_1", "web_search", { query: "official data" })] });
      }
      if (request.tools && msgs.length === 2) {
        return send(200, { ...base, stop_reason: "end_turn", usage, content: [{ type: "text", text: "Let me open the page." }, ...tool("srv_2", "web_fetch", { url: "https://example.org/data.js" })] });
      }
      return send(200, {
        ...base,
        stop_reason: "end_turn",
        usage: { ...usage, server_tool_use: null },
        content: [
          { type: "thinking", thinking: "write", signature: "s" },
          { type: "text", text: "Now I have enough information. Let me write the answer.\n\nAssumption: the brief means the official registry.\n\nThe registry lists 17 widgets" },
          { type: "text", text: " as of today.", citations: [{ type: "web_search_result_location", url: "https://example.org/registry?utm_source=x", title: "Registry", cited_text: "17 widgets", encrypted_index: "e" }] },
        ],
      });
    }
    if (req.url?.endsWith("/messages")) {
      return send(200, {
        id: `msg_${n}`,
        type: "message",
        role: "assistant",
        model: request.model,
        stop_reason: "end_turn",
        content: [{ type: "text", text: `${mockClaude(JSON.stringify(request))}\n<!-- mock #${n} -->` }],
        usage: { input_tokens: 10, output_tokens: 10 },
      });
    }
    if (req.url?.endsWith("/chat/completions")) {
      return send(200, {
        id: `chatcmpl_${n}`,
        object: "chat.completion",
        created: Math.floor(Date.now() / 1000),
        model: request.model,
        choices: [{ index: 0, finish_reason: "stop", message: { role: "assistant", content: `${MOCK_GPT}\n<!-- mock #${n} -->` } }],
        usage: { prompt_tokens: 10, completion_tokens: 10, total_tokens: 20 },
      });
    }
    if (req.url?.endsWith("/responses")) {
      return send(200, {
        id: `resp_${n}`,
        object: "response",
        created_at: Math.floor(Date.now() / 1000),
        status: "completed",
        model: request.model,
        output: [{ id: `msg_${n}`, type: "message", role: "assistant", status: "completed", content: [{ type: "output_text", text: `${MOCK_FACTCHECK}\n<!-- mock #${n} -->`, annotations: [] }] }],
        usage: { input_tokens: 10, output_tokens: 10, total_tokens: 20 },
      });
    }
    return send(404, { error: { message: `mock: unknown path ${req.url}` } });
  });
  return new Promise((resolve) => {
    server.listen(port, "127.0.0.1", () => {
      const address = server.address();
      const url = `http://127.0.0.1:${address.port}`;
      resolve({
        url,
        state,
        close: () => new Promise((done) => server.close(() => done())),
      });
    });
  });
}

if (import.meta.url === `file://${process.argv[1]}`) {
  startMockLlm(Number(process.argv[2] ?? 4010)).then((mock) => console.log(`mock LLM listening on ${mock.url}`));
}
