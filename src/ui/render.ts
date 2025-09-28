import type { UsageMeta } from "../core/usage.js";

export function printTokenPanel(usage?: UsageMeta) {
  if (!usage) {
    console.log("\n— Tokens: (not available for streaming) —");
    return;
  }
  const input = usage.inputTokens ?? 0;
  const output = usage.outputTokens ?? 0;
  const total = usage.totalTokens ?? input + output;
  const cost = usage.costUSD != null ? usage.costUSD : undefined;
  console.log("\n— Tokens —");
  console.log(`  input: ${input}  output: ${output}  total: ${total}${cost != null ? `  estCost: $${cost.toFixed(6)}` : ""}`);
}
