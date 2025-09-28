import type { ChatMessage } from "../../providers/types.js";
import type { UsageMeta } from "../usage.js";
import type { LLM } from "../../providers/types.js";
import { systemPrompt, type TraceLevel } from "../prompts/system.js";
import { parseModelJSON } from "../contracts.js";

export interface PlanOnlyResult {
  plan: string[];
  rationale?: string;
  message_markdown?: string;
  usage?: UsageMeta;
  raw: string;
}

/**
 * Ask the model for a concise plan only (no actions executed).
 * Returns plan, optional rationale, optional human-facing markdown, and usage when available.
 */
export async function planOnly(
  llm: LLM,
  input: string,
  opts: { trace?: TraceLevel; temperature?: number } = {}
): Promise<PlanOnlyResult> {
  const sys = systemPrompt(opts.trace ?? "plan");
  const messages: ChatMessage[] = [
    { role: "system", content: sys },
    {
      role: "user",
      content:
        "PLAN ONLY: Provide a concise high-level plan and brief rationale. Do NOT include actions. Respond with valid JSON.",
    },
    { role: "user", content: input },
  ];

  // LLM interface: non-streaming call (no extra options beyond 'stream')
  const res = await llm.chat(messages);

  const raw = res.text ?? "";
  const json = parseModelJSON(raw);
  return {
    plan: json.plan ?? [],
    rationale: json.rationale,
    message_markdown: json.message_markdown,
    usage: res.usage,
    raw,
  };
}
