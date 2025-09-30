import type { LLM } from "../../providers/types.js";
import type { Turn } from "../../state/history.js";

export async function summarizeSession(
  llm: LLM,
  jsonl: Turn[],
  trace: "none" | "plan" | "verbose" = "plan",
  maxChars = 4000,
): Promise<string> {
  const content = jsonl
    .map((t) => `- ${t.role.toUpperCase()}: ${t.content}`)
    .join("\n")
    .slice(0, 100_000);

  const sys = `You are to summarize prior chat history into a compact Markdown brief, preserving key decisions, commands, and edits. Do not include raw chain-of-thought. Limit to ${maxChars} characters.`;
  const res = await llm.chat(
    [
      { role: "system", content: sys },
      { role: "user", content: content },
    ],
    { stream: false, temperature: 0.2 },
  );
  return res.text || "";
}


