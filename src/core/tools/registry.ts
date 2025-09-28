// src/core/tools/registry.ts
import { openFile } from "./open_file.js";
import { writeFileSafe } from "./write_file.js";
import { applyPatch } from "./apply_patch.js";
import { runCommand } from "./run.js";

export type ToolName = "open_file" | "write_file" | "apply_patch" | "run";

export interface ToolCall {
  tool: ToolName;
  args: Record<string, any>;
}

const CMD_TIMEOUT =
  Number.parseInt(process.env.FORGE_CMD_TIMEOUT_MS || "") || undefined;
const STDIO_CAP =
  Number.parseInt(process.env.FORGE_TOOL_STDIO_LIMIT || "") || undefined;

export const Tools = {
  async open_file(args: { path: string }) {
    return openFile(args.path);
  },
  async write_file(args: { path: string; content: string }) {
    const abs = await writeFileSafe(args.path, args.content, { mkdir: true });
    return { path: abs, bytes: Buffer.byteLength(args.content, "utf8") };
  },
  async apply_patch(args: { patch: string }) {
    return applyPatch(args.patch);
  },
  async run(args: { cmd: string; cwd?: string }) {
    return runCommand(args.cmd, {
      cwd: args.cwd ?? process.cwd(),
      timeoutMs: CMD_TIMEOUT,
      stdioCapBytes: STDIO_CAP,
    });
  },
};

export async function executeTool(call: ToolCall) {
  const fn = (Tools as any)[call.tool];
  if (!fn) throw new Error(`Unknown tool: ${call.tool}`);
  return fn(call.args || {});
}
