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
