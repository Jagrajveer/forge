#!/usr/bin/env node
import { Command } from "commander";
import prompts from "prompts";
import * as fs from "node:fs";
import * as path from "node:path";

import { Agent } from "./core/agent.js";
import { ensureConfigDir, loadProfile } from "./config/profile.js";
import { env } from "./config/env.js";
import { GrokProvider } from "./providers/grok.js";
import { summarizeChangesWithModel } from "./core/flows/summarize_changes.js";
import { renderTokensPanel } from "./ui/render.js";
import { runCommand } from "./core/tools/run.js";
import { gitStatusPorcelain, gitDiffStat } from "./core/tools/git.js";

const program = new Command();
program.name("forge").description("Grok-powered engineering copilot");

// Shared flags
function verifyOpt(cmd: Command) {
  return cmd.option("--verify <mode>", "post-edit check: none|lint|test|both", "none");
}
function safetyOpts(cmd: Command) {
  return cmd
    .option("--safe", "always ask before run/write (strict)", false)
    .option("--auto", "no confirmations (CI-like)", false);
}

/** CHAT */
verifyOpt(
  safetyOpts(
    program
      .command("chat")
      .description("interactive chat (agent can plan + act with approvals)")
      .option("--trace <level>", "reasoning visibility: none|plan|verbose", "plan")
      .option("--refresh", "legacy re-render mode", false)
      .option("--no-exec", "parse but do not execute model actions", false)
  )
).action(async (opts) => {
  ensureConfigDir();
  const agent = new Agent({
    trace: opts.trace,
    appendOnly: !opts.refresh,
    execute: opts.exec !== false,
    approvalLevel: opts.auto ? "auto" : opts.safe ? "safe" : "balanced",
    verifyMode: opts.verify,
  });

  const onInput = async () => {
    const { text } = await prompts({ type: "text", name: "text", message: "you" });
    return text as string;
  };

  await agent.chatInteractive(onInput);
});

/** ASK */
verifyOpt(
  safetyOpts(
    program
      .command("ask <prompt...>")
      .description("one-shot question (optionally verify after edits)")
      .option("--trace <level>", "reasoning visibility: none|plan|verbose", "plan")
  )
).action(async (parts, opts) => {
  ensureConfigDir();
  const agent = new Agent({
    trace: opts.trace,
    approvalLevel: opts.auto ? "auto" : opts.safe ? "safe" : "balanced",
    verifyMode: opts.verify,
  });
  await agent.oneshot(parts.join(" "));
});

/** env doctor */
const envCmd = program.command("env").description("environment utilities");
envCmd
  .command("doctor")
  .description("print environment diagnostics for forge")
  .action(async () => {
    ensureConfigDir();
    const cfg = loadProfile();
    const loaded = env.LOADED_ENV_FILES.join(", ") || "(none)";
    const lines: string[] = [];
    lines.push("## Environment");
    lines.push(`- loaded: ${loaded}`);
    lines.push(`- provider: ${cfg.provider}`);
    lines.push(`- baseUrl: ${cfg.baseUrl}`);
    lines.push(`- model: ${cfg.model}`);
    lines.push("");
    process.stdout.write(lines.join("\n"));
  });

/** auth test */
const authCmd = program.command("auth").description("authentication & connectivity");
authCmd
  .command("test")
  .description("ping the model and print model/usage")
  .action(async () => {
    ensureConfigDir();
    const llm = new GrokProvider();
    const { text, usage } = (await llm.chat(
      [
        { role: "system", content: "You are a ping-check." },
        { role: "user", content: "Respond with 'pong'." },
      ],
      { stream: false }
    )) as { text: string; usage?: any };

    process.stdout.write(`response: ${text.trim() || "(empty)"}\n`);
    if (usage) process.stdout.write(renderTokensPanel(usage));
  });

/** changes (diff-only) */
program
  .command("changes")
  .description("summarize current repo changes via Grok (diffs only)")
  .option("--trace <level>", "reasoning visibility: none|plan|verbose", "plan")
  .option("--temperature <n>", "model temperature", "0.2")
  .action(async (opts) => {
    ensureConfigDir();
    const llm = new GrokProvider();
    const md = await summarizeChangesWithModel(llm, {
      trace: opts.trace,
      temperature: Number(opts.temperature) || 0.2,
      maxChars: 180_000,
    });
    process.stdout.write(md ? md + "\n" : "_No summary produced._\n");
  });

/** init (memory template) */
program
  .command("init")
  .description("create .forge/ with MEMORY.md template if missing")
  .action(async () => {
    ensureConfigDir();
    const dir = path.join(process.cwd(), ".forge");
    const mem = path.join(dir, "MEMORY.md");
    if (!fs.existsSync(mem)) {
      fs.writeFileSync(
        mem,
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
      process.stdout.write(`created ${mem}\n`);
    } else {
      process.stdout.write(`already exists: ${mem}\n`);
    }
  });

/** status (git porcelain) */
program
  .command("status")
  .description("print git --porcelain status")
  .action(async () => {
    const out = await gitStatusPorcelain(process.cwd());
    process.stdout.write(out ? out + "\n" : "(clean)\n");
  });

/** diff (git --stat) */
program
  .command("diff")
  .description("print git --stat for staged/unstaged")
  .action(async () => {
    const unstaged = await gitDiffStat({ cwd: process.cwd() });
    const staged = await gitDiffStat({ staged: true, cwd: process.cwd() });
    const body = [
      unstaged ? "## Unstaged\n" + unstaged : "",
      staged ? "## Staged\n" + staged : "",
    ]
      .filter(Boolean)
      .join("\n\n");
    process.stdout.write(body ? body + "\n" : "(no diffs)\n");
  });

/** run (manual) */
program
  .command("run <cmd...>")
  .description("run a shell command with forge limits")
  .option("--timeout <ms>", "timeout ms")
  .action(async (parts, opts) => {
    const cmd = parts.join(" ");
    const { stdout, stderr, code } = await runCommand(cmd, {
      timeoutMs: opts.timeout ? Number(opts.timeout) : undefined,
    });
    process.stdout.write(stdout || stderr || "");
    process.stdout.write(`\n(exit ${code})\n`);
  });

program.parseAsync(process.argv);
