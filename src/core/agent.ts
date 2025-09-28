import { GrokProvider } from "../providers/grok.js";
import { systemPrompt } from "./prompts/system.js";
import type { TraceLevel } from "./prompts/system.js";
import { parseModelJSON } from "./contracts.js";
import type { ModelJSONT } from "./contracts.js";
import { AppendOnlyStream, renderPlan } from "../ui/render.js";
import { summarizeChangesWithModel } from "./flows/summarize_changes.js";
import { executeTool } from "./tools/registry.js";
import { requiresApprovalForRun, requiresApprovalForWrite, type ApprovalLevel } from "./safety.js";
import { confirmYN } from "../ui/confirm.js";
import { runVerification, type VerifyMode } from "./verify.js";

export interface AgentOptions {
  trace?: TraceLevel;
  appendOnly?: boolean;
  temperature?: number;
  execute?: boolean;
  approvalLevel?: ApprovalLevel; // safe | balanced | auto
  verifyMode?: VerifyMode;       // none | lint | test | both
}

type Observation = { title: string; body: string };
type ChatRole = "system" | "user" | "assistant";
type ChatMessage = { role: ChatRole; content: string };

export class Agent {
  private llm = new GrokProvider();
  constructor(private opts: AgentOptions = {}) {}

  async chatInteractive(getUserInput: () => Promise<string>) {
    const out = new AppendOnlyStream();

    while (true) {
      const user = await getUserInput();
      if (!user || user.trim().toLowerCase() === "/exit") break;

      const sys = systemPrompt(this.opts.trace ?? "plan");
      const baseMessages: ChatMessage[] = [
        { role: "system", content: sys },
        { role: "user", content: user },
      ];

      let messages: ChatMessage[] = [...baseMessages];
      let passesRemaining = 2;

      while (passesRemaining-- > 0) {
        const maybeStream = this.llm.chat(messages, {
          stream: true,
          temperature: this.opts.temperature ?? 0.3,
          reasoning: (this.opts.trace ?? "plan") !== "none",
        }) as unknown;

        const stream = (await maybeStream) as AsyncIterable<string>;
        let collected = "";
        for await (const chunk of stream) collected += chunk;

        let parsed: ModelJSONT | undefined;
        try {
          parsed = parseModelJSON(collected);
        } catch {}

        if (!parsed) {
          out.write(collected);
          out.newline();
          break;
        }

        // Show plan/rationale
        out.write(renderPlan({ plan: parsed.plan, rationale: parsed.rationale }));

        // Execute actions -> accumulate observations
        const observations: Observation[] = [];
        let madeEdits = false;

        if (this.opts.execute && parsed.actions?.length) {
          for (const action of parsed.actions) {
            const tool = (action as any).tool as string;

            if (tool === "open_file") {
              const { path } = action as any;
              out.write(`\n📖 open_file: ${path}\n`);
              try {
                const res = await executeTool({ tool: "open_file", args: { path } });
                const preview = res.truncated ? `${res.content}\n\n…(truncated)…` : res.content;
                out.write("```text\n" + (preview || "(empty)") + "\n```\n");
                observations.push({ title: `open_file ${path}`, body: `Read ${path} (${res.truncated ? "truncated" : "full"})` });
              } catch (err: any) {
                out.write(`⚠️  open_file failed: ${String(err?.message ?? err)}\n`);
              }
              continue;
            }

            if (tool === "run") {
              const { cmd } = action as any;
              const needsApproval = requiresApprovalForRun(cmd, this.opts.approvalLevel ?? "balanced");
              if (needsApproval) {
                const ok = await confirmYN(`Allow RUN: ${cmd}?`, false);
                if (!ok) {
                  out.write(`\n🚫 Skipped RUN: ${cmd}\n`);
                  continue;
                }
              }
              out.write(`\n$ ${cmd}\n`);
              try {
                const res = await executeTool({ tool: "run", args: { cmd } });
                const body = (res.stdout || res.stderr || "").trim();
                out.write("```text\n" + (body.length ? body : "(no output)") + "\n```\n");
                observations.push({ title: `run ${cmd}`, body: `exit=${res.code} | stdout=${(res.stdout || "").slice(-2000)} | stderr=${(res.stderr || "").slice(-2000)}` });
              } catch (err: any) {
                out.write("```text\n" + String(err?.message ?? err ?? "command failed") + "\n```\n");
              }
              continue;
            }

            if (tool === "apply_patch") {
              const { patch } = action as any;
              const needsApproval = requiresApprovalForWrite(this.opts.approvalLevel ?? "balanced");
              if (needsApproval) {
                const ok = await confirmYN(`Apply PATCH provided by model?`, false);
                if (!ok) { out.write(`\n🚫 Skipped APPLY PATCH\n`); continue; }
              }
              try {
                const res = await executeTool({ tool: "apply_patch", args: { patch } });
                out.write(`\n🩹 apply_patch: ${res.ok ? "applied" : "failed"}\n`);
                if (!res.ok) {
                  out.write("```text\n" + [`attempted:`, ...res.attempted].join("\n") + "\n```\n");
                } else {
                  madeEdits = true;
                }
                observations.push({ title: "apply_patch", body: res.ok ? "Patch applied successfully." : "Patch failed to apply." });
              } catch (err: any) {
                out.write(`⚠️  apply_patch error: ${String(err?.message ?? err)}\n`);
              }
              continue;
            }

            if (tool === "write_file") {
              const { path, content } = action as any;
              const needsApproval = requiresApprovalForWrite(this.opts.approvalLevel ?? "balanced");
              if (needsApproval) {
                const ok = await confirmYN(`Write ${path}? (bytes: ${Buffer.byteLength(content, "utf8")})`, false);
                if (!ok) { out.write(`\n🚫 Skipped WRITE ${path}\n`); continue; }
              }
              try {
                const res = await executeTool({ tool: "write_file", args: { path, content } });
                out.write(`\n✍️  write_file: ${path} (${res.bytes} bytes)\n`);
                madeEdits = true;
                observations.push({ title: `write_file ${path}`, body: `Wrote ${res.bytes} bytes.` });
              } catch (err: any) {
                out.write(`⚠️  write_file error: ${String(err?.message ?? err)}\n`);
              }
              continue;
            }

            if (tool === "git") {
              // Implement minimal subtools: commit, create_branch
              const { subtool, args } = action as any;
              if (subtool === "commit") {
                const needsApproval = requiresApprovalForWrite(this.opts.approvalLevel ?? "balanced");
                const msg = String(args?.message ?? "").trim() || "chore: update";
                if (needsApproval) {
                  const ok = await confirmYN(`Create commit with message: "${msg}" ?`, false);
                  if (!ok) { out.write(`\n🚫 Skipped GIT COMMIT\n`); continue; }
                }
                const res = await executeTool({ tool: "git", args: { subtool: "commit", message: msg } });
                out.write(`\n🌿 git commit: ${res.ok ? "created" : "failed"}\n`);
                observations.push({ title: "git commit", body: res.output || (res.ok ? "commit created" : "failed") });
                continue;
              }
              if (subtool === "create_branch") {
                const name = String(args?.name ?? "").trim();
                if (!name) { out.write(`\n⚠️  git create_branch missing name\n`); continue; }
                const res = await executeTool({ tool: "git", args: { subtool: "create_branch", name } });
                out.write(`\n🌱 git branch: ${res.ok ? `created ${name}` : "failed"}\n`);
                observations.push({ title: "git create_branch", body: res.output || "" });
                continue;
              }
              out.write(`\nℹ️  git subtool '${subtool}' not implemented.\n`);
              continue;
            }

            out.write(`\nℹ️  Unknown action '${tool}' — skipping.\n`);
          }
        }

        // Optional user-facing message
        if (parsed.message_markdown) {
          out.write("\n" + parsed.message_markdown + "\n");
        }

        // If we made edits and verification is enabled, run it once here.
        if (madeEdits && (this.opts.verifyMode ?? "none") !== "none") {
          const { summary, ok } = await runVerification(this.opts.verifyMode ?? "none");
          observations.push({ title: `verify (${this.opts.verifyMode})`, body: summary });
          out.write(`\n🧪 verify[${this.opts.verifyMode}]: ${ok ? "OK" : "Issues found"}\n`);
          out.write("```text\n" + summary + "\n```\n");
        }

        // If any observations, give the model one follow-up turn
        if (observations.length) {
          const obsMd = observations.map((o) => `### ${o.title}\n${o.body}`).join("\n\n");
          messages = [...messages, { role: "assistant", content: `OBSERVATIONS:\n\n${obsMd}` }];
          continue;
        }

        break;
      }

      // Optional diff-summary intent
      if (inferSummarizeIntent(user)) {
        const md = await summarizeChangesWithModel(this.llm, {
          trace: this.opts.trace ?? "plan",
          temperature: 0.2,
          maxChars: 180_000,
        });
        out.write("\n" + (md || "_No summary produced._") + "\n");
      }
    }
  }

  async oneshot(prompt: string) {
    const sys = systemPrompt(this.opts.trace ?? "plan");
    const messages: ChatMessage[] = [
      { role: "system", content: sys },
      { role: "user", content: prompt },
    ];
    const res = (await this.llm.chat(messages, {
      stream: false,
      temperature: this.opts.temperature ?? 0.3,
      reasoning: (this.opts.trace ?? "plan") !== "none",
    })) as { text: string; usage?: any };

    const out = new AppendOnlyStream();
    out.write(res.text);
    out.newline();

    if (inferSummarizeIntent(prompt)) {
      const md = await summarizeChangesWithModel(this.llm, {
        trace: this.opts.trace ?? "plan",
        temperature: 0.2,
        maxChars: 180_000,
      });
      out.write("\n" + (md || "_No summary produced._") + "\n");
    }
  }
}

function inferSummarizeIntent(text: string): boolean {
  const t = text.toLowerCase();
  return (
    (t.includes("summarize") || t.includes("summary") || t.includes("what changed") || t.includes("changes")) &&
    (t.includes("code") || t.includes("diff") || t.includes("repo") || t.includes("repository"))
  );
}
