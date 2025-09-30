import repl from "node:repl";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import childProcess from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";
import figlet from "figlet";
import chalk from "chalk";
import { AppendOnlyStream, renderSeparator, renderTokensPanel, renderWelcomeBanner } from "../src/ui/render.js";
import { startProcessingAnimation, stopAnimation, succeedAnimation, failAnimation } from "../src/ui/animations.js";
import { Agent } from "../src/core/agent.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function isTTY() {
  return process.stdout.isTTY && process.stderr.isTTY;
}

function banner() {
  try {
    const text = figlet.textSync("FORGE REPL", { font: "Small" });
    return chalk.gray(text);
  } catch {
    return "FORGE REPL";
  }
}

function help() {
  return [
    chalk.gray("Commands:"),
    chalk.gray("  /plan \"…\"   → print a plan without executing"),
    chalk.gray("  /run \"cmd\"  → run a shell command, stream output"),
    chalk.gray("  /diff        → show git working-tree diff since start"),
    chalk.gray("  /test        → run unit tests and summarize failures"),
    chalk.gray("  .exit        → quit"),
    "",
  ].join("\n");
}

const sessionStartRef = childProcess.execSync("git rev-parse --short HEAD", { stdio: ["ignore", "pipe", "ignore"] })
  .toString()
  .trim();

async function runCommand(cmd: string): Promise<number> {
  return await new Promise((resolve) => {
    const proc = childProcess.spawn(cmd, { shell: true, stdio: "inherit" });
    proc.on("exit", (code) => resolve(code ?? 0));
  });
}

function showDiffSinceStart(): string {
  try {
    const diff = childProcess.execSync("git diff", { stdio: ["ignore", "pipe", "ignore"] })
      .toString();
    return diff || "(no changes)";
  } catch (err) {
    return String(err instanceof Error ? err.message : err);
  }
}

async function runTestsAndSummarize(): Promise<string> {
  try {
    const out = childProcess.execSync("npm test --silent", { stdio: ["ignore", "pipe", "pipe"] }).toString();
    return out || "(no output)";
  } catch (err: any) {
    const out = String(err?.stdout || "");
    const errOut = String(err?.stderr || "");
    const combined = (out + "\n" + errOut).trim();
    const lines = combined.split("\n").slice(0, 200).join("\n");
    return lines || "(no output)";
  }
}

async function main() {
  const out = new AppendOnlyStream();
  const histPath = path.join(os.homedir(), ".forge_repl_history");

  // Greeting
  out.write("\n");
  out.write(banner() + "\n");
  out.write(chalk.gray("TypeScript-aware REPL with top-level await.\n"));
  out.write(help());

  // Preload convenience exports
  const agent = new Agent({ trace: "plan", sessionLogging: false });

  const r = repl.start({
    prompt: chalk.gray("> "),
    ignoreUndefined: true,
    terminal: isTTY(),
  });

  // History
  try {
    // @ts-ignore node types allow this property at runtime
    r.setupHistory(histPath, (err: any) => {
      if (err) {
        // best-effort
      }
    });
  } catch {
    // Node < 20 fallback: manual history load/save could be added if needed
  }

  // Context preloads
  Object.assign(r.context, {
    Agent,
    agent,
    renderSeparator,
  });

  // REPL commands
  r.defineCommand("plan", {
    help: "Print a plan for the quoted prompt without executing",
    async action(input) {
      const text = input.trim().replace(/^"|"$/g, "");
      if (!text) {
        this.outputStream.write("Usage: /plan \"your goal\"\n");
        this.displayPrompt();
        return;
      }
      startProcessingAnimation();
      try {
        const planOnly = await (await import("../src/core/flows/plan_only.js")).planOnly;
        const res = await planOnly(agent as any, text, { trace: "plan" });
        stopAnimation();
        this.outputStream.write(["\n▶ Plan\n", ...(res.plan || []).map((p: string) => `  • ${p}`), "\n"].join("\n"));
        succeedAnimation("Plan generated");
      } catch (err: any) {
        stopAnimation();
        failAnimation(err?.message || String(err));
        this.outputStream.write("\n" + (err?.message || String(err)) + "\n");
      } finally {
        this.displayPrompt();
      }
    },
  });

  r.defineCommand("run", {
    help: "Run a shell command and stream output",
    async action(input) {
      const cmd = input.trim().replace(/^"|"$/g, "");
      if (!cmd) {
        this.outputStream.write("Usage: /run \"cmd\"\n");
        this.displayPrompt();
        return;
      }
      const code = await runCommand(cmd);
      this.outputStream.write(`\n(exit ${code})\n`);
      this.displayPrompt();
    },
  });

  r.defineCommand("diff", {
    help: "Show working-tree diff since session start",
    action() {
      const diff = showDiffSinceStart();
      this.outputStream.write("\n" + diff + "\n");
      this.displayPrompt();
    },
  });

  r.defineCommand("test", {
    help: "Run unit tests and summarize",
    async action() {
      startProcessingAnimation();
      const result = await runTestsAndSummarize();
      stopAnimation();
      this.outputStream.write("\n" + result + "\n");
      this.displayPrompt();
    },
  });

  r.on("SIGINT", () => {
    r.clearBufferedCommand();
    r.write("\n(Press Ctrl-C again to exit)\n");
  });
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});


