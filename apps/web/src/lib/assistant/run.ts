import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { addUsage, costMicroEur, type Usage } from "./pricing";
import { systemPrompt } from "./prompt";
import type { AiSettings } from "./settings";
import { SuggestionFilter } from "./suggestions";
import { runTool, toolDefinitions, type ToolContext } from "./tools";

/**
 * One question → streamed answer. Manual tool loop: Claude may call our
 * tools (database lookups) a few times, then answers; text deltas are
 * forwarded as they arrive, the <suggestions> block is held back and parsed.
 */
export type AssistantEvent =
  | { type: "text"; text: string }
  | { type: "tool"; name: string }
  | { type: "done"; suggestions: string[] }
  | { type: "error"; code: "busy" | "unavailable" | "refused" | "too_long" };

export type ChatTurn = { role: "user" | "assistant"; content: string };

const MAX_TOOL_ROUNDS = 4;
let client: Anthropic | null = null;
const getClient = () => (client ??= new Anthropic({ maxRetries: 1, timeout: 45_000 }));

export async function runAssistant(opts: {
  turns: ChatTurn[];
  note: string;
  settings: AiSettings;
  tools: ToolContext;
  emit: (e: AssistantEvent) => void;
  signal?: AbortSignal;
}): Promise<{ usage: Usage; costMicroEur: number }> {
  const { settings, emit } = opts;
  const messages: Anthropic.MessageParam[] = opts.turns.map((t, i) =>
    i === 0 && t.role === "user" ? { role: "user", content: `${opts.note}\n\n${t.content}` } : { role: t.role, content: t.content },
  );
  const tools = toolDefinitions();
  const filter = new SuggestionFilter();
  let usage: Usage = { input_tokens: 0, output_tokens: 0 };

  try {
    for (let round = 0; round <= MAX_TOOL_ROUNDS; round++) {
      const stream = getClient().messages.stream(
        {
          model: settings.model,
          max_tokens: 4096,
          // Chat answers: low effort keeps them quick and cheap.
          output_config: { effort: "low" },
          system: systemPrompt(),
          cache_control: { type: "ephemeral" },
          tools,
          messages,
        },
        { signal: opts.signal },
      );
      stream.on("text", (delta) => {
        const visible = filter.push(delta);
        if (visible) emit({ type: "text", text: visible });
      });
      const message = await stream.finalMessage();
      usage = addUsage(usage, message.usage);

      if (message.stop_reason === "refusal") {
        emit({ type: "error", code: "refused" });
        break;
      }
      const calls = message.content.filter((b): b is Anthropic.ToolUseBlock => b.type === "tool_use");
      if (calls.length === 0 || message.stop_reason !== "tool_use") {
        if (message.stop_reason === "max_tokens") emit({ type: "error", code: "too_long" });
        break;
      }
      if (round === MAX_TOOL_ROUNDS) break;
      messages.push({ role: "assistant", content: message.content });
      const results: Anthropic.ToolResultBlockParam[] = [];
      for (const call of calls) emit({ type: "tool", name: call.name });
      await Promise.all(
        calls.map(async (call) => {
          const r = await runTool(call.name, call.input, opts.tools);
          results.push({ type: "tool_result", tool_use_id: call.id, content: r.content, is_error: r.isError || undefined });
        }),
      );
      // All results of one turn go back in a single message, in call order.
      results.sort((a, b) => calls.findIndex((c) => c.id === a.tool_use_id) - calls.findIndex((c) => c.id === b.tool_use_id));
      messages.push({ role: "user", content: results });
    }
    const end = filter.finish();
    if (end.text) emit({ type: "text", text: end.text });
    emit({ type: "done", suggestions: end.suggestions });
  } catch (e) {
    if (e instanceof Anthropic.RateLimitError || e instanceof Anthropic.InternalServerError) emit({ type: "error", code: "busy" });
    else if (e instanceof Anthropic.APIUserAbortError) {
      // The person closed the page: nothing to send.
    } else {
      console.error("assistant failed", e instanceof Anthropic.APIError ? `${e.status} ${e.message}` : e);
      emit({ type: "error", code: "unavailable" });
    }
  }
  return { usage, costMicroEur: costMicroEur(usage, settings.price, settings.usdToEur) };
}
