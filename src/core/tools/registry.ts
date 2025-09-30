import { openFile } from "./open_file.js";
import { writeFileSafe } from "./write_file.js";
import { applyPatch } from "./apply_patch.js";
import { runCommand } from "./run.js";
import { gitCommit, gitCreateBranch } from "./git.js";
import { npmInstall, npmRunScript, npmList, npmOutdated } from "./npm.js";
import { dockerBuild, dockerRun, dockerPs, dockerStop, dockerRemove } from "./docker.js";
import { searchInFiles, findFiles } from "./search.js";
import { getPluginManager, executePluginTool, getAvailablePluginTools } from "../plugins.js";

export type ToolName = 
  | "open_file" 
  | "write_file" 
  | "apply_patch" 
  | "run" 
  | "git"
  | "npm"
  | "docker"
  | "search";

export interface ToolCall {
  tool: ToolName;
  args: Record<string, any>;
}

const CMD_TIMEOUT = Number.parseInt(process.env.FORGE_CMD_TIMEOUT_MS || "") || undefined;
const STDIO_CAP = Number.parseInt(process.env.FORGE_TOOL_STDIO_LIMIT || "") || undefined;

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
  async git(args: { subtool: string; [k: string]: any }) {
    if (args.subtool === "commit") return gitCommit(args.message);
    if (args.subtool === "create_branch") return gitCreateBranch(args.name);
    throw new Error(`Unknown git subtool: ${args.subtool}`);
  },
  async npm(args: { subtool: string; [k: string]: any }) {
    if (args.subtool === "install") return npmInstall(args.packages, args.options);
    if (args.subtool === "run") return npmRunScript(args.script, args.options);
    if (args.subtool === "list") return npmList(args.options);
    if (args.subtool === "outdated") return npmOutdated();
    throw new Error(`Unknown npm subtool: ${args.subtool}`);
  },
  async docker(args: { subtool: string; [k: string]: any }) {
    if (args.subtool === "build") return dockerBuild(args.options);
    if (args.subtool === "run") return dockerRun(args.options);
    if (args.subtool === "ps") return dockerPs(args.options);
    if (args.subtool === "stop") return dockerStop(args.container);
    if (args.subtool === "remove") return dockerRemove(args.container, args.force);
    throw new Error(`Unknown docker subtool: ${args.subtool}`);
  },
  async search(args: { subtool: string; [k: string]: any }) {
    if (args.subtool === "files") return searchInFiles(args.options);
    if (args.subtool === "find") return findFiles(args.pattern, args.directory);
    throw new Error(`Unknown search subtool: ${args.subtool}`);
  },
};

export async function executeTool(call: ToolCall) {
  // Check if it's a built-in tool
  const fn = (Tools as any)[call.tool];
  if (fn) {
    return fn(call.args || {});
  }
  
  // Check if it's a plugin tool
  const pluginTools = getAvailablePluginTools();
  if (pluginTools.includes(call.tool)) {
    return executePluginTool(call.tool, call.args || {});
  }
  
  throw new Error(`Unknown tool: ${call.tool}`);
}
