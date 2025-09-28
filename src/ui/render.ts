import * as readline from "node:readline";
import { Writable } from "node:stream";

export type RenderMode = "append" | "refresh";

export class AppendOnlyStream {
  constructor(private out: Writable = process.stdout) {}

  write(token: string) {
    // Only ever append. No carriage returns, no clearLine calls.
    this.out.write(token);
  }

  newline() {
    this.out.write("\n");
  }
}

export function renderPlan({
  plan,
  rationale,
}: {
  plan: string[];
  rationale?: string;
}) {
  const lines: string[] = [];
  if (plan?.length) {
    lines.push("\n▶ Plan");
    for (const step of plan) lines.push(`  • ${step}`);
  }
  if (rationale) {
    lines.push("\n▶ Why");
    lines.push(`  ${rationale}`);
  }
  return lines.join("\n") + "\n";
}

export function renderTokensPanel(usage?: {
  inputTokens?: number;
  outputTokens?: number;
  costUSD?: number;
  model?: string;
}) {
  if (!usage) return "";
  const parts = [
    `model=${usage.model ?? "unknown"}`,
    `in=${usage.inputTokens ?? 0}`,
    `out=${usage.outputTokens ?? 0}`,
    usage.costUSD !== undefined ? `cost=$${usage.costUSD.toFixed(6)}` : undefined,
  ].filter(Boolean);
  return `\n⏱️ Tokens: ${parts.join("  ")}\n`;
}
