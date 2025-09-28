import type { TraceLevel } from "../prompts/system.js";
import { runCommand } from "../tools/run.js";
import { GrokProvider } from "../../providers/grok.js";

/**
 * Collect staged & unstaged diffs (patch text) suitable for LLM review.
 * Returns a combined string; large outputs are truncated from the middle to fit caps.
 */
export async function collectWorkingDiffs(opts: {
  cwd?: string;
  maxChars?: number; // hard cap on total diff text we pass to the model
} = {}): Promise<{ text: string; truncated: boolean }> {
  const cwd = opts.cwd ?? process.cwd();
  const cap = opts.maxChars ?? 180_000; // ~180k chars (~90-120k tokens chars ≈ conservative)

  // Plain patch diffs; --no-color ensures clean text; -U3 keeps minimal context.
  const { stdout: unstaged } = await runCommand("git diff -U3 --no-color", { cwd, stdioCapBytes: cap * 2 });
  const { stdout: staged } = await runCommand("git diff --cached -U3 --no-color", { cwd, stdioCapBytes: cap * 2 });

  const parts: string[] = [];
  if (unstaged.trim().length) {
    parts.push("## Unstaged\n```diff\n" + unstaged.trim() + "\n```");
  }
  if (staged.trim().length) {
    parts.push("## Staged\n```diff\n" + staged.trim() + "\n```");
  }

  let combined = parts.join("\n\n");
  if (!combined) {
    combined = "_No uncommitted changes detected (staged or unstaged)._";
    return { text: combined, truncated: false };
  }

  // Truncate from the middle if necessary (keep head & tail for context).
  if (combined.length > cap) {
    const head = combined.slice(0, Math.floor(cap * 0.65));
    const tail = combined.slice(-Math.floor(cap * 0.35));
    combined = `${head}\n\n…\n\n${tail}\n\n<!-- truncated diff: ${(combined.length - cap)} chars removed -->`;
    return { text: combined, truncated: true };
  }
  return { text: combined, truncated: false };
}

/**
 * Ask Grok to summarize code changes from diffs only (no commit history).
 * Returns the model’s markdown summary.
 */
export async function summarizeChangesWithModel(llm: GrokProvider, opts: {
  cwd?: string;
  trace?: TraceLevel;
  temperature?: number;
  maxChars?: number;
} = {}): Promise<string> {
  const { text: diffs, truncated } = await collectWorkingDiffs({
    cwd: opts.cwd,
    maxChars: opts.maxChars ?? 180_000,
  });

  const system = [
    "You are an expert code-review assistant.",
    "Summarize the CODE CHANGES present in the provided DIFFS.",
    "STRICT REQUIREMENTS:",
    "- Do NOT mention commit messages, commit history, or `git log`.",
    "- Base your summary ONLY on the diff content (staged + unstaged).",
    "- Keep it concise and actionable for an engineer scanning changes.",
    "- Prefer categories: Features, Fixes, Refactors, Tests, Docs, Chore.",
    "- Note any breaking changes, migrations, risky areas, or follow-ups.",
    "- Output plain Markdown. No JSON. No preface. No concluding fluff."
  ].join("\n");

  const user = [
    "### Diffs to review",
    diffs,
    truncated ? "\n\n_Note: diffs were truncated for length; summarize from what is shown._" : "",
  ].join("\n");

  const res = await llm.chat(
    [
      { role: "system", content: system },
      { role: "user", content: user },
    ],
    {
      stream: false,
      temperature: opts.temperature ?? 0.2,
      reasoning: (opts.trace ?? "plan") !== "none",
      maxTokens: 1024,
    }
  ) as { text: string };

  return (res.text ?? "").trim();
}
