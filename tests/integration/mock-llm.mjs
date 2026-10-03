// Local stand-in for the Anthropic and OpenAI HTTP APIs, so tests never call a
// real provider. Point the SDKs at it with ANTHROPIC_BASE_URL / OPENAI_BASE_URL.
//   POST /__mode {"fail": true|false}  -> make every provider call fail with 500
//   GET  /__stats                      -> {calls, failures}
// Run standalone: node tests/integration/mock-llm.mjs [port]
import { createServer } from "node:http";

export function startMockLlm(port = 0) {
  const state = { fail: false, calls: 0, failures: 0 };
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

    state.calls++;
    if (state.fail) {
      state.failures++;
      return send(500, { error: { type: "api_error", message: "mock provider is down" } });
    }
    const request = JSON.parse(body || "{}");
    const n = state.calls;
    if (req.url?.endsWith("/messages")) {
      return send(200, {
        id: `msg_${n}`,
        type: "message",
        role: "assistant",
        model: request.model,
        stop_reason: "end_turn",
        content: [{ type: "text", text: `Scout mock output #${n}\n- angle one\n- angle two` }],
        usage: { input_tokens: 10, output_tokens: 10 },
      });
    }
    if (req.url?.endsWith("/chat/completions")) {
      return send(200, {
        id: `chatcmpl_${n}`,
        object: "chat.completion",
        created: Math.floor(Date.now() / 1000),
        model: request.model,
        choices: [{ index: 0, finish_reason: "stop", message: { role: "assistant", content: `Maker mock output #${n}\nHero line.\nCTA.` } }],
        usage: { prompt_tokens: 10, completion_tokens: 10, total_tokens: 20 },
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
