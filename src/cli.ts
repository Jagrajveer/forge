#!/usr/bin/env node
import "./config/env.js"; // load .env and prepare ENV/diagnostics
import { Command } from "commander";
import prompts from "prompts";
import * as fs from "node:fs/promises";
import * as path from "node:path";

import { GrokProvider } from "./providers/grok.js";
import { runCommand } from "./core/tools/run.js";
import { confirmYN } from "./ui/confirm.js";
import { requiresApprovalForRun } from "./core/safety.js";
import { ENV, envDiagnostics } from "./config/env.js";

const program = new Command();
program.name("forge").description("Grok-powered engineering copilot CLI").version("0.1.0");

type Mode = "safe" | "balanced" | "auto";

function modeFromFlags(opts: { auto?: boolean; safe?: boolean }): Mode {
  if (ENV.FORGE_ALLOW_DANGEROUS) return "auto";
  if (opts.auto) return "auto";
  if (opts.safe) return "safe";
  return "balanced";
}

const CMD_TIMEOUT = ENV.FORGE_CMD_TIMEOUT_MS;
const STDIO_CAP = ENV.FORGE_TOOL_STDIO_LIMIT;

async function makeProvider() {
  return new GrokProvider({});
}

/** REPL Chat */
program
  .command("chat")
  .description("Start an interactive chat")
  .option("--auto", "Run without confirmations", false)
  .option("--safe", "Strict approvals", false)
  .action(async (opts) => {
    const provider = await makeProvider();
    const mode = modeFromFlags(opts);

    console.log("Grok CLI assistant initialized. Type a message, or /exit to quit.");

    const messages: Array<{ role: "system" | "user" | "assistant"; content: string | object }> = [];
    messages.push({
      role: "system",
      content:
        "You are an expert software engineer. Keep answers concise unless asked. If you need files or commands, say `[OPEN <path>]` or `[RUN <cmd>]`.",
    });

    while (true) {
      const { input } = await prompts({ type: "text", name: "input", message: ">" });
      if (input == null) break;
      const trimmed = String(input).trim();
      if (!trimmed) continue;
      if (trimmed === "/exit") break;

      messages.push({ role: "user", content: trimmed });

      const stream = provider.chat(messages, { stream: true });
      let final = "";
      for await (const chunk of stream) {
        process.stdout.write(chunk);
        final += chunk;
      }
      process.stdout.write("\n");
      messages.push({ role: "assistant", content: final });

      const openMatch = final.match(/\[OPEN\s+([^\]]+)\]/i);
      const runMatch = final.match(/\[RUN\s+([^\]]+)\]/i);

      if (openMatch) {
        const filePath = openMatch[1].trim();
        try {
          const abs = path.resolve(process.cwd(), filePath);
          const content = await fs.readFile(abs, "utf8");
          const snippet = content.length > 200_000 ? content.slice(0, 200_000) + "\n…(truncated)…" : content;
          messages.push({ role: "system", content: `Content of ${filePath}:\n\n\`\`\`\n${snippet}\n\`\`\`` });
          console.log(`[fed ${filePath} back to the model]`);
        } catch (err: any) {
          messages.push({ role: "system", content: `Error reading ${filePath}: ${err?.message || String(err)}` });
          console.error(`Error reading ${filePath}:`, err?.message || err);
        }
      }

      if (runMatch) {
        const cmd = runMatch[1].trim();
        const needsApproval = requiresApprovalForRun(cmd, mode);
        const ok = needsApproval ? await confirmYN(`The assistant wants to RUN: ${cmd}. Proceed?`, false) : true;

        if (!ok) {
          messages.push({ role: "system", content: `Run command denied by user: ${cmd}` });
          console.log("Denied.");
          continue;
        }

        console.log(`$ ${cmd}`);
        const res = await runCommand(cmd, {
          cwd: process.cwd(),
          timeoutMs: CMD_TIMEOUT,
          stdioCapBytes: STDIO_CAP,
          stream: (data) => {
            if (data.stdout) process.stdout.write(data.stdout);
            if (data.stderr) process.stderr.write(data.stderr);
          },
        });

        messages.push({
          role: "system",
          content:
            `Command result (${cmd}):\n` +
            `exitCode=${res.code}\n` +
            `stdout:\n${res.stdout}\n` +
            `stderr:\n${res.stderr}\n`,
        });
      }
    }
  });

/** One-shot question */
program
  .command("ask <text...>")
  .description("Ask a single question (one-shot)")
  .action(async (text: string[]) => {
    const provider = await makeProvider();
    const messages = [
      { role: "system" as const, content: "You are an expert software engineer." },
      { role: "user" as const, content: text.join(" ") },
    ];
    const stream = provider.chat(messages, { stream: true });
    for await (const chunk of stream) process.stdout.write(chunk);
    process.stdout.write("\n");
  });

/** Run a shell command */
program
  .command("run <cmd...>")
  .description('Run a shell command (e.g. `forge run "npm test"`), with safety gates')
  .option("--auto", "Run without confirmations", false)
  .option("--safe", "Strict approvals", false)
  .action(async (cmd: string[], opts) => {
    const mode = modeFromFlags(opts);
    const joined = cmd.join(" ");
    const needsApproval = requiresApprovalForRun(joined, mode);
    const ok = needsApproval ? await confirmYN(`Run: ${joined} ?`, false) : true;
    if (!ok) {
      console.log("Denied.");
      process.exitCode = 1;
      return;
    }
    console.log(`$ ${joined}`);
    const res = await runCommand(joined, {
      cwd: process.cwd(),
      timeoutMs: CMD_TIMEOUT,
      stdioCapBytes: STDIO_CAP,
      stream: (data) => {
        if (data.stdout) process.stdout.write(data.stdout);
        if (data.stderr) process.stderr.write(data.stderr);
      },
    });
    console.log(`\nexitCode=${res.code}`);
  });

/** Auth ping */
program
  .command("auth")
  .description("Auth utilities")
  .command("test")
  .description("Ping the provider")
  .action(async () => {
    const { model, reply, baseUrl } = await GrokProvider.ping();
    console.log(`OK: model=${model}, baseUrl=${baseUrl}, reply="${reply}"`);
  });

/** Env diagnostics */
program
  .command("env")
  .description("Environment helpers")
  .command("doctor")
  .description("Print environment/config diagnostics")
  .action(() => {
    const diag = envDiagnostics();
    console.log("cwd:", diag.cwd);
    console.log("loadedEnvFiles:", diag.loadedEnvFiles.length ? diag.loadedEnvFiles : "(none)");
    console.log("xaiBaseUrl:", diag.xaiBaseUrl);
    console.log("xaiModel:", diag.xaiModel);
    console.log("hasXaiApiKey:", diag.hasXaiApiKey ? "yes" : "NO");
    if (!diag.hasXaiApiKey) {
      console.error(
        [
          "",
          "XAI_API_KEY is missing.",
          "Fixes:",
          "  1) Create a .env file in your project root containing: XAI_API_KEY=sk-xxxx",
          "  2) Or export XAI_API_KEY in your shell before running forge.",
          "  3) On Windows, if using `setx`, open a NEW terminal (setx applies to future shells only).",
        ].join("\n")
      );
    }
  });

/** Init memory file */
program
  .command("init")
  .description("Create .grokcli/MEMORY.md template")
  .action(async () => {
    const dir = path.resolve(process.cwd(), ".grokcli");
    const file = path.join(dir, "MEMORY.md");
    await fs.mkdir(dir, { recursive: true });
    const exists = await fs.stat(file).then(() => true).catch(() => false);
    if (!exists) {
      await fs.writeFile(
        file,
        `# Project Memory

## Build & Run
- build: npm run build
- start: npm start
- test: npm test
- lint: npm run lint

## Tech & Style
- Node 20+, TypeScript strict.
- ESLint + Prettier enforced.

## Domain Notes
- High-level architecture…
- Critical invariants…

## Do / Don’t
- DO run tests after every change.
- DON’T edit infra/k8s/ without explicit request.
`,
        "utf8"
      );
      console.log(`Created ${path.relative(process.cwd(), file)}`);
    } else {
      console.log("MEMORY.md already exists.");
    }
  });

program.parseAsync(process.argv);
