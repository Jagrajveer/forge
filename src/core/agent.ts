import { GrokProvider } from "../providers/grok.js";
import { systemPrompt } from "./prompts/system.js";
import type { TraceLevel } from "./prompts/system.js";
import { parseModelJSON } from "./contracts.js";
import type { ModelJSONT } from "./contracts.js";
import { AppendOnlyStream, renderPlan, renderUserPrompt, renderAssistantResponse, renderSeparator } from "../ui/render.js";
import { startThinkingAnimation, startProcessingAnimation, stopAnimation, succeedAnimation, failAnimation } from "../ui/animations.js";
import { summarizeChangesWithModel, summarizeCodebaseWithModel } from "./flows/summarize_changes.js";
import { planOnly } from "./flows/plan_only.js";
import { executeTool } from "./tools/registry.js";
import {
  requiresApprovalForRun,
  requiresApprovalForWrite,
  type ApprovalLevel,
} from "./safety.js";
import { confirmYN } from "../ui/confirm.js";
import { runVerification, type VerifyMode } from "./verify.js";
import { inferToolCallsFromUser } from "./heuristics.js";
import { ForgeError, getErrorDisplayMessage, logError } from "./errors.js";
import { SessionLog, type Turn } from "../state/history.js";
import { log } from "./logger.js";

export interface AgentOptions {
  trace?: TraceLevel;
  appendOnly?: boolean;
  temperature?: number;
  execute?: boolean;
  approvalLevel?: ApprovalLevel; // safe | balanced | auto
  verifyMode?: VerifyMode; // none | lint | test | both
  sessionLogging?: boolean; // enable/disable session logging
  planFirst?: boolean; // plan → confirm → execute
}

type Observation = { title: string; body: string };
type ChatRole = "system" | "user" | "assistant";
type ChatMessage = { role: ChatRole; content: string };

export class Agent {
  private llm = new GrokProvider();
  private sessionLog?: SessionLog;
  
  constructor(private opts: AgentOptions = {}) {
    // Initialize session logging if enabled
    if (this.opts.sessionLogging !== false) {
      this.sessionLog = SessionLog.create();
    }
  }

  private logTurn(role: Turn["role"], content: string, meta?: Record<string, unknown>): void {
    if (!this.sessionLog) return;
    
    this.sessionLog.append({
      ts: new Date().toISOString(),
      role,
      content,
      meta
    });
  }

  private logUserInput(input: string): void {
    this.logTurn("user", input);
    log.user(input);
  }

  private logAssistantResponse(response: string, actions?: any[]): void {
    this.logTurn("assistant", response, { actions });
    log.assistant(response, actions);
  }

  private logToolExecution(tool: string, args: any, result: any, error?: any): void {
    this.logTurn("tool", `Executed ${tool}`, {
      tool,
      args,
      result,
      error: error ? { message: error.message, code: error.code } : undefined
    });
    log.tool(tool, args, result, error);
  }

  private logObservation(observation: Observation): void {
    this.logTurn("meta", `Observation: ${observation.title}`, {
      observation
    });
  }

  getSessionLogPath(): string | undefined {
    return this.sessionLog?.path();
  }

  async chatInteractive(getUserInput: () => Promise<string>) {
    const out = new AppendOnlyStream();

    while (true) {
      const user = await getUserInput();
      if (!user || user.trim().toLowerCase() === "/exit") {
        if (user?.trim().toLowerCase() === "/exit") {
          out.write(renderSeparator() + "\n");
          out.write("👋 Goodbye! Thanks for using Forge CLI.\n");
          out.write(renderSeparator() + "\n");
        }
        break;
      }
      
      this.logUserInput(user);
      
      // Display user input with enhanced formatting
      out.write(renderUserPrompt(user));

      const sys = systemPrompt(this.opts.trace ?? "plan");
      const baseMessages: ChatMessage[] = [
        { role: "system", content: sys },
        { role: "user", content: user },
      ];

      let messages: ChatMessage[] = [...baseMessages];
      let passesRemaining = 2;

      while (passesRemaining-- > 0) {
        // Start thinking animation
        startThinkingAnimation();
        
        const maybeStream = this.llm.chat(messages, {
          stream: true,
          temperature: this.opts.temperature ?? 0.3,
          reasoning: (this.opts.trace ?? "plan") !== "none",
        }) as unknown;

        const stream = (await maybeStream) as AsyncIterable<{ content: string; reasoning?: string }>;
        let collected = "";
        let reasoning = "";
        
        // Stop thinking animation and start processing
        stopAnimation();
        startProcessingAnimation();
        
        for await (const chunk of stream) {
          collected += chunk.content;
          if (chunk.reasoning) {
            reasoning = chunk.reasoning;
          }
        }
        
        // Stop processing animation
        stopAnimation();

        let parsed: ModelJSONT | undefined;
        try {
          parsed = parseModelJSON(collected);
        } catch {}

        // Display thinking/reasoning if available and trace level allows it
        if (reasoning && (this.opts.trace ?? "plan") !== "none") {
          out.write("\n" + renderSeparator() + "\n");
          out.write("💭 Thinking:\n");
          out.write("```\n" + reasoning + "\n```\n");
          out.write(renderSeparator() + "\n");
        }

        // For summary tasks, don't show raw plan/rationale - process intelligently
        if (inferSummarizeIntent(user)) {
          if (parsed) {
            // Just show a brief status, don't display the full plan
            out.write("🔍 Analyzing codebase structure and gathering information...\n");
            this.logAssistantResponse(collected, parsed.actions);
          } else {
            // Model didn't send contract JSON — show whatever text it sent.
            if (collected.trim()) {
              out.write(renderAssistantResponse(collected));
              this.logAssistantResponse(collected);
            }
          }
        } else {
          // Always render plan/rationale if we have them for non-summary tasks.
          if (parsed) {
            out.write(renderPlan({ plan: parsed.plan, rationale: parsed.rationale }));
            this.logAssistantResponse(collected, parsed.actions);
          } else {
            // Model didn't send contract JSON — show whatever text it sent.
            if (collected.trim()) {
              out.write(renderAssistantResponse(collected));
              this.logAssistantResponse(collected);
            }
          }
        }

        // Decide what actions to run:
        //  1) model-provided actions
        //  2) else: heuristic fallback from the last user message
        const modelActions = parsed?.actions ?? [];
        const fallbackActions =
          modelActions.length === 0 ? inferToolCallsFromUser(user) : [];
        const actionsToRun = modelActions.length ? modelActions : fallbackActions;

        const observations: Observation[] = [];
        let madeEdits = false;

        if (this.opts.execute && actionsToRun.length) {
          // If actions are from heuristics, note it for visibility.
          if (fallbackActions.length) {
            out.write("\n🧭 No actions from the model; applying a safe fallback intent.\n");
          }

          for (const action of actionsToRun) {
            const tool = (action as any).tool as string;

            if (tool === "open_file") {
              const { path } = action as any;
              out.write(`\n📖 Reading: ${path}\n`);
              try {
                const res = await executeTool({ tool: "open_file", args: { path } });
                
                // For summary tasks, don't show raw content - just indicate what was read
                if (inferSummarizeIntent(user)) {
                  const fileSize = res.content ? res.content.length : 0;
                  const lines = res.content ? res.content.split('\n').length : 0;
                  out.write(`✓ Read ${path} (${lines} lines, ${fileSize} chars${res.truncated ? ', truncated' : ''})\n`);
                } else {
                  // For other tasks, show preview
                  const preview = res.truncated
                    ? `${res.content}\n\n…(truncated)…`
                    : res.content;
                  out.write("```text\n" + (preview || "(empty)") + "\n```\n");
                }
                
                const observation = {
                  title: `open_file ${path}`,
                  body: `Read ${path} (${res.truncated ? "truncated" : "full"}) - ${res.content ? res.content.length : 0} chars`,
                };
                observations.push(observation);
                this.logToolExecution("open_file", { path }, res);
                this.logObservation(observation);
              } catch (err: any) {
                const error = err instanceof ForgeError ? err : new ForgeError(err.message, "TOOL_ERROR");
                const displayMessage = getErrorDisplayMessage(error);
                out.write(`⚠️  open_file failed: ${displayMessage}\n`);
                logError(error);
                this.logToolExecution("open_file", { path }, null, error);
              }
              continue;
            }

            if (tool === "run") {
              const { cmd } = action as any;
              
              // Convert Unix commands to Windows equivalents for better compatibility
              let windowsCmd = cmd;
              if (process.platform === 'win32') {
                if (cmd.includes('find . -type f')) {
                  windowsCmd = 'dir /s /b *.ts *.js *.json *.md';
                } else if (cmd.includes('head -20')) {
                  windowsCmd = cmd.replace('head -20', 'more');
                } else if (cmd.includes('cat')) {
                  windowsCmd = cmd.replace('cat', 'type');
                } else if (cmd.includes('ls -la')) {
                  windowsCmd = cmd.replace('ls -la', 'dir');
                }
              }
              
              const needsApproval = requiresApprovalForRun(
                windowsCmd,
                this.opts.approvalLevel ?? "balanced"
              );
              if (needsApproval) {
                out.write(`\n⚠️  run requires approval: ${windowsCmd}\n`);
                const ok = await confirmYN(`Allow RUN: ${windowsCmd}?`, false);
                if (!ok) {
                  out.write(`🚫 Skipped RUN: ${windowsCmd}\n`);
                  continue;
                }
              }
              out.write(`\n$ ${windowsCmd}\n`);
              try {
                const res = await executeTool({ tool: "run", args: { cmd: windowsCmd } });
                const body = (res.stdout || res.stderr || "").trim();
                
                // For summary tasks, don't show raw output - just indicate execution
                if (inferSummarizeIntent(user)) {
                  const lines = body.split('\n').filter((line: string) => line.trim());
                  out.write(`✓ Command executed (${lines.length} lines of output)\n`);
                } else {
                  out.write(
                    "```text\n" + (body.length ? body : "(no output)") + "\n```\n"
                  );
                }
                
                observations.push({
                  title: `run ${windowsCmd}`,
                  body: `exit=${res.code} | stdout=${(res.stdout || "").slice(
                    -2000
                  )} | stderr=${(res.stderr || "").slice(-2000)}`,
                });
              } catch (err: any) {
                const error = err instanceof ForgeError ? err : new ForgeError(err.message, "TOOL_ERROR");
                const displayMessage = getErrorDisplayMessage(error);
                out.write(`⚠️  run failed: ${displayMessage}\n`);
                out.write("```text\n" + (err?.stderr || err?.stdout || displayMessage) + "\n```\n");
                logError(error);
              }
              continue;
            }

            if (tool === "apply_patch") {
              const { patch } = action as any;
              const needsApproval = requiresApprovalForWrite(
                this.opts.approvalLevel ?? "balanced",
                /*unknown*/ undefined
              );
              if (needsApproval) {
                out.write(`\n⚠️  apply_patch requires approval\n`);
                const ok = await confirmYN(`Apply PATCH provided by model?`, false);
                if (!ok) {
                  out.write(`🚫 Skipped APPLY PATCH\n`);
                  continue;
                }
              }
              try {
                const res = await executeTool({
                  tool: "apply_patch",
                  args: { patch },
                });
                out.write(
                  `\n🩹 apply_patch: ${res.ok ? "applied" : "failed"}\n`
                );
                if (!res.ok) {
                  out.write(
                    "```text\n" + [`attempted:`, ...res.attempted].join("\n") + "\n```\n"
                  );
                } else {
                  madeEdits = true;
                }
                observations.push({
                  title: "apply_patch",
                  body: res.ok
                    ? "Patch applied successfully."
                    : "Patch failed to apply.",
                });
              } catch (err: any) {
                const error = err instanceof ForgeError ? err : new ForgeError(err.message, "TOOL_ERROR");
                const displayMessage = getErrorDisplayMessage(error);
                out.write(`⚠️  apply_patch failed: ${displayMessage}\n`);
                logError(error);
              }
              continue;
            }

            if (tool === "write_file") {
              const { path, content } = action as any;
              const bytes = Buffer.byteLength(content ?? "", "utf8");
              const needsApproval = requiresApprovalForWrite(
                this.opts.approvalLevel ?? "balanced",
                bytes
              );
              if (needsApproval) {
                out.write(
                  `\n⚠️  write_file requires approval (${bytes} bytes): ${path}\n`
                );
                const ok = await confirmYN(
                  `Write ${path}? (bytes: ${bytes})`,
                  false
                );
                if (!ok) {
                  out.write(`🚫 Skipped WRITE ${path}\n`);
                  continue;
                }
              }
              try {
                const res = await executeTool({
                  tool: "write_file",
                  args: { path, content },
                });
                out.write(`\n✍️  write_file: ${path} (${res.bytes} bytes)\n`);
                madeEdits = true;
                observations.push({
                  title: `write_file ${path}`,
                  body: `Wrote ${res.bytes} bytes.`,
                });
              } catch (err: any) {
                const error = err instanceof ForgeError ? err : new ForgeError(err.message, "TOOL_ERROR");
                const displayMessage = getErrorDisplayMessage(error);
                out.write(`⚠️  write_file failed: ${displayMessage}\n`);
                logError(error);
              }
              continue;
            }

            if (tool === "git") {
              const { subtool, args } = action as any;
              if (subtool === "commit") {
                const needsApproval = requiresApprovalForWrite(
                  this.opts.approvalLevel ?? "balanced",
                  /*unknown*/ undefined
                );
                const msg =
                  String(args?.message ?? "").trim() || "chore: update";
                if (needsApproval) {
                  out.write(
                    `\n⚠️  git commit requires approval: "${msg}"\n`
                  );
                  const ok = await confirmYN(
                    `Create commit with message: "${msg}" ?`,
                    false
                  );
                  if (!ok) {
                    out.write(`🚫 Skipped GIT COMMIT\n`);
                    continue;
                  }
                }
                const res = await executeTool({
                  tool: "git",
                  args: { subtool: "commit", message: msg },
                });
                out.write(
                  `\n🌿 git commit: ${res.ok ? "created" : "failed"}\n`
                );
                observations.push({
                  title: "git commit",
                  body: res.output || (res.ok ? "commit created" : "failed"),
                });
                continue;
              }
              if (subtool === "create_branch") {
                const name = String(args?.name ?? "").trim();
                if (!name) {
                  out.write(`\n⚠️  git create_branch missing name\n`);
                  continue;
                }
                const res = await executeTool({
                  tool: "git",
                  args: { subtool: "create_branch", name },
                });
                out.write(
                  `\n🌱 git branch: ${res.ok ? `created ${name}` : "failed"}\n`
                );
                observations.push({
                  title: "git create_branch",
                  body: res.output || "",
                });
                continue;
              }
              out.write(`\nℹ️  git subtool '${subtool}' not implemented.\n`);
              continue;
            }

            out.write(`\nℹ️  Unknown action '${tool}' — skipping.\n`);
          }
        }

        if (parsed?.message_markdown) {
          out.write("\n" + parsed.message_markdown + "\n");
        }

        if (madeEdits && (this.opts.verifyMode ?? "none") !== "none") {
          const { summary, ok } = await runVerification(
            this.opts.verifyMode ?? "none"
          );
          observations.push({
            title: `verify (${this.opts.verifyMode})`,
            body: summary,
          });
          out.write(
            `\n🧪 verify[${this.opts.verifyMode}]: ${ok ? "OK" : "Issues found"}\n`
          );
          out.write("```text\n" + summary + "\n```\n");
        }

        if (observations.length) {
          const obsMd = observations
            .map((o) => `### ${o.title}\n${o.body}`)
            .join("\n\n");
          messages = [
            ...messages,
            { role: "assistant", content: `OBSERVATIONS:\n\n${obsMd}` },
          ];
          continue;
        }

        break;
      }

      if (inferSummarizeIntent(user)) {
        // Check if this is a codebase summary (not just changes)
        const isCodebaseSummary = user.toLowerCase().includes("entire") || 
                                 user.toLowerCase().includes("whole") || 
                                 user.toLowerCase().includes("codebase");
        
        if (isCodebaseSummary) {
          out.write("\n🔍 Analyzing codebase structure and key files...\n");
          const md = await summarizeCodebaseWithModel(this.llm, {
            trace: this.opts.trace ?? "plan",
            temperature: 0.3,
            maxChars: 180_000,
          });
          out.write("\n" + (md || "_No codebase summary produced._") + "\n");
        } else {
          const md = await summarizeChangesWithModel(this.llm, {
            trace: this.opts.trace ?? "plan",
            temperature: 0.2,
            maxChars: 180_000,
          });
          out.write("\n" + (md || "_No summary produced._") + "\n");
        }
      }
    }
  }

  async oneshot(prompt: string) {
    this.logUserInput(prompt);
    
    // Display user input with enhanced formatting
    const out = new AppendOnlyStream();
    out.write(renderUserPrompt(prompt));
    
    // If plan-first mode, propose plan and confirm before execution
    if (this.opts.planFirst) {
      const plan = await planOnly(this.llm as any, prompt, { trace: this.opts.trace });
      out.write(renderPlan({ plan: plan.plan, rationale: plan.rationale }));
      const ok = await confirmYN("Proceed to execute this plan?", false);
      if (!ok) {
        out.write("🚫 Cancelled by user.\n");
        return;
      }
    }

    // Start thinking animation
    startThinkingAnimation();
    
    const sys = systemPrompt(this.opts.trace ?? "plan");
    const messages: ChatMessage[] = [
      { role: "system", content: sys },
      { role: "user", content: prompt },
    ];
    const res = (await this.llm.chat(messages, {
      stream: false,
      temperature: this.opts.temperature ?? 0.3,
      reasoning: (this.opts.trace ?? "plan") !== "none",
    })) as { text: string; usage?: any; reasoning?: string };

    // Stop thinking animation
    stopAnimation();

    this.logAssistantResponse(res.text);
    
    // Display thinking/reasoning if available and trace level allows it
    if (res.reasoning && (this.opts.trace ?? "plan") !== "none") {
      out.write(renderSeparator() + "\n");
      out.write("💭 Thinking:\n");
      out.write("```\n" + res.reasoning + "\n```\n");
      out.write(renderSeparator() + "\n");
    }
    
    out.write(renderAssistantResponse(res.text));

    if (inferSummarizeIntent(prompt)) {
      // Check if this is a codebase summary (not just changes)
      const isCodebaseSummary = prompt.toLowerCase().includes("entire") || 
                               prompt.toLowerCase().includes("whole") || 
                               prompt.toLowerCase().includes("codebase");
      
      if (isCodebaseSummary) {
        out.write("\n🔍 Analyzing codebase structure and key files...\n");
        const md = await summarizeCodebaseWithModel(this.llm, {
          trace: this.opts.trace ?? "plan",
          temperature: 0.3,
          maxChars: 180_000,
        });
        out.write("\n" + (md || "_No codebase summary produced._") + "\n");
      } else {
        const md = await summarizeChangesWithModel(this.llm, {
          trace: this.opts.trace ?? "plan",
          temperature: 0.2,
          maxChars: 180_000,
        });
        out.write("\n" + (md || "_No summary produced._") + "\n");
      }
    }
  }
}

function inferSummarizeIntent(text: string): boolean {
  const t = text.toLowerCase();
  return (
    (t.includes("summarize") ||
      t.includes("summary") ||
      t.includes("what changed") ||
      t.includes("changes") ||
      t.includes("overview") ||
      t.includes("describe") ||
      t.includes("explain") ||
      t.includes("analyze")) &&
    (t.includes("code") ||
      t.includes("codebase") ||
      t.includes("project") ||
      t.includes("diff") ||
      t.includes("repo") ||
      t.includes("repository") ||
      t.includes("entire") ||
      t.includes("whole"))
  );
}
