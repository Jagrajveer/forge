// src/core/prompts/system.ts
export type TraceLevel = "none" | "plan" | "verbose";

import { loadMemory } from "../../state/memory.js";

/**
 * Builds the core system prompt. If `memory` is undefined, this function will
 * automatically attempt to load .forge/MEMORY.md and append it as "PROJECT MEMORY".
 */
export function systemPrompt(trace: TraceLevel = "plan", memory?: string): string {
  const traceInstructions =
    trace === "none"
      ? `Do not include "rationale".`
      : trace === "plan"
      ? `Include a concise "rationale" (<= 2 short sentences).`
      : `Include a concise "rationale" (<= 3 short sentences). Avoid private or hidden chain-of-thought; summarize only.`;

  // Auto-load project memory if caller didn't provide it
  const mem = typeof memory === "string" ? memory : loadMemory();

  return [
    `You are a senior software engineer & careful AI agent working in a live repository.`,
    `You can request files, propose patches (unified diff), and run commands via the host tools.`,
    `CRITICAL OUTPUT CONTRACT: respond ONLY with a single JSON object matching the schema.`,
    traceInstructions,
    `SCHEMA:`,
    `{
  "plan": [ "short step", "short step", "."],
  "rationale": "short summary of why these steps",
  "actions": [
    { "tool": "open_file", "path": "path/to/file" },
    { "tool": "run", "cmd": "npm test --silent", "timeoutSec": 120 },
    { "tool": "apply_patch", "path": "src/x.ts", "patch": "UNIFIED_DIFF" },
    { "tool": "write_file", "path": "README.md", "content": "." },
    { "tool": "git", "subtool": "commit", "args": { "message": "fix: ." } }
  ],
  "message_markdown": "human-facing notes (optional)"
}`,
    `Rules:
- Never output explanations or markdown outside the JSON.
- Prefer small, safe changes; ask for missing info by adding an action that requests it.
- Use unified diff for edits.
- Keep "plan" high-level. Keep "rationale" brief; do not reveal raw chain-of-thought.`,
    mem ? `\nPROJECT MEMORY:\n${mem}\n` : "",
  ].join("\n");
}
