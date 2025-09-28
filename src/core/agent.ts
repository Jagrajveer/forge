import type { ToolCall } from "./tools/registry.js";
import { executeTool } from "./tools/registry.js";

/**
 * Minimal agent step executor: takes a list of tool calls (already decided) and runs them sequentially.
 * In the M3+ milestone, you’ll parse JSON from the model and feed tool results back for iteration. 
 */
export async function runPlannedActions(plan: ToolCall[]) {
  const results: any[] = [];
  for (const call of plan) {
    const result = await executeTool(call);
    results.push({ tool: call.tool, ok: true, result });
  }
  return results;
}
