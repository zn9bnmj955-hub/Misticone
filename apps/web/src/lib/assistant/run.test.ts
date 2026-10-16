import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const runTool = vi.fn(async () => ({ content: JSON.stringify({ results: [{ title: "Règles", text: "13 points" }] }), isError: false }));
vi.mock("./tools", () => ({
  toolDefinitions: () => [{ name: "knowledge_search", description: "kb", input_schema: { type: "object", properties: { query: { type: "string" } } } }],
  runTool,
}));

/** A fake Messages API: first call asks for a tool, second call answers. */
const requests: Record<string, unknown>[] = [];
function sse(events: [string, unknown][]): string {
  return events.map(([event, data]) => `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`).join("");
}
const message = () => ({ id: "msg_1", type: "message", role: "assistant", model: "claude-haiku-5-5", content: [], stop_reason: null, usage: { input_tokens: 1000, output_tokens: 1 } });
const toolTurn = sse([
  ["message_start", { type: "message_start", message: message() }],
  ["content_block_start", { type: "content_block_start", index: 0, content_block: { type: "tool_use", id: "toolu_1", name: "knowledge_search", input: {} } }],
  ["content_block_delta", { type: "content_block_delta", index: 0, delta: { type: "input_json_delta", partial_json: '{"query":"but à 13"}' } }],
  ["content_block_stop", { type: "content_block_stop", index: 0 }],
  ["message_delta", { type: "message_delta", delta: { stop_reason: "tool_use", stop_sequence: null }, usage: { output_tokens: 20 } }],
  ["message_stop", { type: "message_stop" }],
]);
const textTurn = sse([
  ["message_start", { type: "message_start", message: message() }],
  ["content_block_start", { type: "content_block_start", index: 0, content_block: { type: "text", text: "" } }],
  ["content_block_delta", { type: "content_block_delta", index: 0, delta: { type: "text_delta", text: "La partie se joue en 13 points." } }],
  ["content_block_delta", { type: "content_block_delta", index: 0, delta: { type: "text_delta", text: '\n<suggestions>["Et le jet du but ?"]</suggestions>' } }],
  ["content_block_stop", { type: "content_block_stop", index: 0 }],
  ["message_delta", { type: "message_delta", delta: { stop_reason: "end_turn", stop_sequence: null }, usage: { output_tokens: 30 } }],
  ["message_stop", { type: "message_stop" }],
]);

let server: Server;
beforeAll(async () => {
  server = createServer((req, res) => {
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", () => {
      requests.push(JSON.parse(body));
      res.writeHead(200, { "content-type": "text/event-stream" });
      res.end(requests.length === 1 ? toolTurn : textTurn);
    });
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  process.env.ANTHROPIC_BASE_URL = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  process.env.ANTHROPIC_API_KEY = "test-key";
});
afterAll(() => server.close());

describe("assistant loop", () => {
  it("runs a tool, streams the answer and extracts suggestions", async () => {
    const { runAssistant } = await import("./run");
    const events: { type: string; text?: string; name?: string; suggestions?: string[] }[] = [];
    const result = await runAssistant({
      turns: [{ role: "user", content: "Le but se joue en combien de points ?" }],
      note: "[Contexte]",
      settings: {
        enabled: true,
        model: "claude-haiku-5-5",
        dailyQuota: { guest: 5, account: 20, paying_club: 100 },
        monthlyBudgetEur: 20,
        usdToEur: 1,
        price: { inputUsdPerMTok: 0.1, outputUsdPerMTok: 0.5 },
      },
      tools: { viewer: null, origin: null, nowMs: 0, siteUrl: "http://x" },
      emit: (e) => events.push(e as never),
    });
    expect(runTool).toHaveBeenCalledWith("knowledge_search", { query: "but à 13" }, expect.anything());
    expect(events.filter((e) => e.type === "tool").map((e) => e.name)).toEqual(["knowledge_search"]);
    expect(events.filter((e) => e.type === "text").map((e) => e.text).join("")).toBe("La partie se joue en 13 points.\n");
    expect(events.at(-1)).toEqual({ type: "done", suggestions: ["Et le jet du but ?"] });
    // Second request carries the tool result; model and effort as configured.
    expect(requests).toHaveLength(2);
    expect(requests[0]).toMatchObject({ model: "claude-haiku-5-5", output_config: { effort: "low" } });
    const second = requests[1] as { messages: { role: string; content: { type: string; tool_use_id?: string }[] }[] };
    expect(second.messages.at(-1)!.content[0]).toMatchObject({ type: "tool_result", tool_use_id: "toolu_1" });
    expect(result.usage.input_tokens).toBe(2000);
    expect(result.costMicroEur).toBeGreaterThan(0);
  });
});
