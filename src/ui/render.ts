import * as readline from "node:readline";
import chalk from "chalk";
import figlet from "figlet";

/**
 * Append-only writer for terminal output.
 * Uses a TTY-only clearLine() so non-TTY streams (e.g., redirected to a file)
 * won’t error.
 */
export class AppendOnlyStream {
  constructor(private out: NodeJS.WriteStream = process.stdout) {}

  write(s: string) {
    this.out.write(s);
  }

  newline() {
    this.out.write("\n");
  }

  clearLine() {
    // Only attempt cursor ops on a TTY stream.
    // process.stdout/process.stderr are tty.WriteStream instances when attached to a terminal.
    if (!this.out.isTTY) return; // no-op if redirected. 
    readline.clearLine(this.out, 0);
    readline.cursorTo(this.out, 0);
  }
}

// Ephemeral thinking panel state (track last lines per stream)
const thinkingBuffers = new WeakMap<AppendOnlyStream, string[]>();

function termWidth(out: NodeJS.WriteStream): number {
  return out && (out as any).columns ? Math.max(20, (out as any).columns as number) : 80;
}

export function startThinkingPanel(out: AppendOnlyStream, label = "Thinking…"): void {
  thinkingBuffers.set(out, []);
  out.clearLine();
  const line = chalk.gray(`💭 ${label}`);
  out.write(line + "\n");
}

export function updateThinkingPanel(out: AppendOnlyStream, text: string): void {
  const buf = thinkingBuffers.get(out) ?? [];
  // Split into lines, keep last ~2 logical lines
  const pieces = String(text).split(/\r?\n/).filter(Boolean);
  for (const p of pieces) buf.push(p);
  while (buf.length > 2) buf.shift();
  thinkingBuffers.set(out, buf);

  // render truncated to terminal width
  const width = termWidth((out as any).out ?? process.stdout);
  const rendered = buf
    .map((l) => (l.length > width ? l.slice(0, width - 1) + "…" : l))
    .join(" \u00B7 ");

  out.clearLine();
  out.write(chalk.gray(`💭 ${rendered}`) + "\n");
}

export function endThinkingPanel(out: AppendOnlyStream): void {
  out.clearLine();
  thinkingBuffers.delete(out);
}

export function renderContextBar(
  usage: {
    promptTokens?: number;
    completionTokens?: number;
    reasoningTokens?: number;
    totalTokens?: number;
    modelId?: string;
  },
  modelMax: number,
): string {
  const used = (usage.promptTokens ?? 0) + (usage.completionTokens ?? 0) + (usage.reasoningTokens ?? 0);
  const total = usage.totalTokens ?? used;
  const pct = modelMax > 0 ? Math.round((used / modelMax) * 100) : 0;
  const warn = pct >= 75;
  const label = warn ? chalk.yellow(`Context: ${used}/${modelMax} (${pct}%)`) : chalk.gray(`Context: ${used}/${modelMax} (${pct}%)`);
  const prompt = chalk.gray(` | Prompt: ${usage.promptTokens ?? 0}`);
  const out = chalk.gray(` | Output: ${usage.completionTokens ?? 0}`);
  const rsn = chalk.gray(` | Reasoning: ${usage.reasoningTokens ?? 0}`);
  const ttl = chalk.gray(` | Total: ${total}`);
  const model = usage.modelId ? chalk.gray(` | Model: ${usage.modelId}`) : "";
  return `${label}${prompt}${out}${rsn}${ttl}${model}`;
}

export function renderPlan(input: { plan?: string[]; rationale?: string }) {
  const { plan = [], rationale } = input;
  const lines: string[] = [];
  if (plan.length) {
    lines.push(chalk.gray.bold("▶ Plan"));
    for (const p of plan) lines.push(chalk.gray(`  • ${p}`));
  }
  if (rationale) {
    lines.push(chalk.gray.bold("\n▶ Why"));
    lines.push(chalk.gray(`  ${rationale}`));
  }
  lines.push(""); // trailing newline
  return lines.join("\n");
}

export function renderTokensPanel(usage: {
  inputTokens?: number;
  outputTokens?: number;
  costUSD?: number;
  model?: string;
}) {
  const it = usage.inputTokens ?? 0;
  const ot = usage.outputTokens ?? 0;
  const cost = usage.costUSD ?? 0;
  const model = usage.model ?? "";
  const total = it + ot;
  return [
    "\n",
    chalk.gray("┌─ tokens ───────────────────────────────────────┐"),
    chalk.gray(`│ model: ${chalk.white(model.padEnd(38))} │`),
    chalk.gray(`│ input: ${chalk.dim(String(it).padStart(7))}  output: ${chalk.dim(String(ot).padStart(7))}  total: ${chalk.dim(String(total).padStart(7))} │`),
    chalk.gray(`│ est. cost: ${chalk.dim("$" + cost.toFixed(6).padStart(12))}                  │`),
    chalk.gray("└───────────────────────────────────────────────┘"),
    "\n",
  ].join("\n");
}

export function renderContextPanel(stats: {
  filesRead?: number;
  bytesRead?: number;
  approxTokens?: number;
}) {
  const files = stats.filesRead ?? 0;
  const bytes = stats.bytesRead ?? 0;
  const toks = stats.approxTokens ?? 0;
  return [
    "\n",
    chalk.gray("┌─ context ───────────────────────────────────────┐"),
    chalk.gray(`│ files: ${String(files).padStart(6)}  bytes: ${String(bytes).padStart(10)}  tokens*: ${String(toks).padStart(8)} │`),
    chalk.gray("│ *approx tokens = chars/4                           │"),
    chalk.gray("└──────────────────────────────────────────────────┘"),
    "\n",
  ].join("\n");
}

export function renderWelcomeBanner() {
  const banner = figlet.textSync("FORGE", {
    font: "ANSI Shadow",
    horizontalLayout: "default",
    verticalLayout: "default",
  });
  const subtitle = chalk.gray("🤖 AI-Powered Engineering Copilot");
  const version = chalk.dim("v0.1.0");
  
  return [
    "\n",
    chalk.gray(banner),
    subtitle,
    version,
    "\n",
    chalk.gray("Type your message below or '/exit' to quit"),
    chalk.gray("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"),
    "\n"
  ].join("\n");
}

export function renderThinkingAnimation() {
  return chalk.gray("💭 Thinking...");
}

export function renderProcessingAnimation() {
  return chalk.gray("⚡ Processing...");
}

export function renderSuccessMessage(message: string) {
  return chalk.gray(`✅ ${message}`);
}

export function renderErrorMessage(message: string) {
  return chalk.gray(`❌ ${message}`);
}

export function renderWarningMessage(message: string) {
  return chalk.gray(`⚠️  ${message}`);
}

export function renderInfoMessage(message: string) {
  return chalk.gray(`ℹ️  ${message}`);
}

export function renderUserPrompt(prompt: string) {
  return [
    chalk.gray.bold("👤 You:"),
    chalk.white(prompt),
    ""
  ].join("\n");
}

export function renderAssistantResponse(response: string) {
  return [
    chalk.gray.bold("🤖 Assistant:"),
    chalk.white(response),
    ""
  ].join("\n");
}

export function renderToolExecution(tool: string, args: any) {
  return [
    chalk.gray.bold("🔧 Tool:"),
    chalk.gray(`${tool}(${JSON.stringify(args, null, 2)})`),
    ""
  ].join("\n");
}

export function renderSeparator() {
  return chalk.gray("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
}
