import * as readline from "node:readline";

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
    lines.push("▶ Plan");
    for (const p of plan) lines.push(`  • ${p}`);
  }
  if (rationale) {
    lines.push("\n▶ Why");
    lines.push(`  ${rationale}`);
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
    "┌─ tokens ───────────────────────────────────────┐",
    `│ model: ${model.padEnd(38)} │`,
    `│ input: ${String(it).padStart(7)}  output: ${String(ot).padStart(7)}  total: ${String(total).padStart(7)} │`,
    `│ est. cost: $${cost.toFixed(6).padStart(12)}                  │`,
    "└───────────────────────────────────────────────┘",
    "\n",
  ].join("\n");
}
