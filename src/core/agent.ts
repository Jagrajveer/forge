import { GrokProvider } from "../providers/grok.js";
import { systemPrompt } from "./prompts/system.js";
import type { TraceLevel } from "./prompts/system.js";
import { parseModelJSON } from "./contracts.js";
import type { ModelJSONT } from "./contracts.js";
import { AppendOnlyStream, renderPlan, renderTokensPanel } from "../ui/render.js";
import { runCommand } from "./tools/run.js";
import { summarizeChangesWithModel } from "./flows/summarize_changes.js";

export interface AgentOptions {
  trace?: TraceLevel;
  appendOnly?: boolean;
  temperature?: number;
  /** Execute model-suggested actions when safe (e.g., `git diff`). */
  execute?: boolean;
}

export class Agent {
  private llm = new GrokProvider();

  constructor(private opts: AgentOptions = {}) {}

  async chatInteractive(getUserInput: () => Promise<string>) {
    const out = new AppendOnlyStream();

    while (true) {
      const user = await getUserInput();
      if (!user || user.trim().toLowerCase() === "/exit") break;

      const sys = systemPrompt(this.opts.trace ?? "plan");
      const messages = [
        { role: "system" as const, content: sys },
        { role: "user" as const, content: user },
      ];

      // Stream the model — buffer tokens so we can suppress raw JSON in the terminal.
      const maybeStream = this.llm.chat(messages, {
        stream: true,
        temperature: this.opts.temperature ?? 0.3,
        reasoning: (this.opts.trace ?? "plan") !== "none",
      }) as unknown;

      const stream = (await maybeStream) as AsyncIterable<string>;
      let collected = "";
      for await (const chunk of stream) collected += chunk;

      // Try to parse our { plan, rationale, actions } contract; if that fails, print the text.
      let parsed: ModelJSONT | undefined;
      try {
        parsed = parseModelJSON(collected);
      } catch {
        /* not JSON-shaped; print raw text */
      }

      if (!parsed) {
        out.write(collected);
        out.newline();
      } else {
        // Show concise reasoning
        out.write(renderPlan({ plan: parsed.plan, rationale: parsed.rationale }));

        // Optionally execute safe actions (readonly git diffs) and show outputs.
        if (this.opts.execute && parsed.actions?.length) {
          for (const action of parsed.actions) {
            if (action.tool === "run") {
              const cmd = action.cmd.trim();
              const timeoutMs = (action.timeoutSec ?? 30) * 1000;

              if (!isSafeRun(cmd)) {
                out.write(`\n⚠️  Skipping unsafe action: \`${cmd}\` (set FORGE_ALLOW_DANGEROUS=1 to allow)`);
                continue;
              }

              out.write(`\n$ ${cmd}\n`);
              try {
                const result = await runCommand(cmd, { timeoutMs, stdioCapBytes: 200_000 });
                const body = (result.stdout || result.stderr || "").trim();
                out.write("```text\n");
                out.write(body.length ? body : "(no output)");
                out.write("\n```\n");
              } catch (err: any) {
                const msg = String(err?.message ?? err ?? "command failed");
                out.write("```text\n");
                out.write(msg);
                out.write("\n```\n");
              }
            } else {
              out.write(`\nℹ️  Action '${(action as any).tool}' not implemented in chat yet.\n`);
            }
          }
        }

        // If the model provided a user-facing message, show it.
        if (parsed.message_markdown) {
          out.write("\n");
          out.write(parsed.message_markdown);
          out.write("\n");
        }
      }

      // If the user asked for a code-change summary, ALWAYS produce it via the model (no git log).
      if (inferSummarizeIntent(user)) {
        const md = await summarizeChangesWithModel(this.llm, {
          trace: this.opts.trace ?? "plan",
          temperature: 0.2,
          maxChars: 180_000,
        });
        out.write("\n");
        out.write(md || "_No summary produced._");
        out.write("\n");
      }
    }
  }

  async oneshot(prompt: string) {
    const sys = systemPrompt(this.opts.trace ?? "plan");
    const messages = [
      { role: "system" as const, content: sys },
      { role: "user" as const, content: prompt },
    ];
    const res = (await this.llm.chat(messages, {
      stream: false,
      temperature: this.opts.temperature ?? 0.3,
      reasoning: (this.opts.trace ?? "plan") !== "none",
    })) as { text: string; usage?: any };

    const out = new AppendOnlyStream();
    out.write(res.text);
    out.newline();
    if (res.usage) out.write(renderTokensPanel(res.usage));

    // One-shot: produce model summary if the intent matches.
    if (inferSummarizeIntent(prompt)) {
      const md = await summarizeChangesWithModel(this.llm, {
        trace: this.opts.trace ?? "plan",
        temperature: 0.2,
        maxChars: 180_000,
      });
      out.write("\n");
      out.write(md || "_No summary produced._");
      out.write("\n");
    }
  }
}

/** Allow only read-only git diffs by default; require opt-in for everything else. */
function isSafeRun(cmd: string): boolean {
  const allowDangerous = ["1", "true", "yes", "on"].includes(
    String(process.env.FORGE_ALLOW_DANGEROUS ?? "").toLowerCase()
  );
  if (allowDangerous) return true;

  // Allow: git diff, git --no-pager diff, and --cached variants
  const t = cmd.trim();
  return /^\s*git(\s+--no-pager)?\s+diff(\s|$)/i.test(t);
}

function inferSummarizeIntent(text: string): boolean {
  const t = text.toLowerCase();
  return (
    (t.includes("summarize") || t.includes("summary") || t.includes("what changed") || t.includes("changes")) &&
    (t.includes("code") || t.includes("diff") || t.includes("repo") || t.includes("repository"))
  );
}
