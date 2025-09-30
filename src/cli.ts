#!/usr/bin/env node
import { Command } from "commander";
import { startEnhancedREPL } from "./core/repl.js";
import { registerAuthXaiCommands } from "./commands/auth-xai.js";
import { registerPluginCommands } from "./commands/plugins.js";
import { registerMemoryCommands } from "./commands/memory.js";
import { registerSessionCommands } from "./commands/session.js";
import { registerRAGCommands } from "./commands/rag.js";
import { registerMCPCommands } from "./commands/mcp.js";
import { summarizeChangesWithModel } from "./core/flows/summarize_changes.js";
import { GrokProvider } from "./providers/grok.js";
import { ensureConfigDir } from "./config/profile.js";
import { bundleProject } from "./core/tools/bundle.js";
import { createPullRequest } from "./core/tools/pr.js";

const program = new Command();
program.name("forge").description("Grok-powered engineering copilot");

/** chat (interactive) */
program
  .command("chat")
  .description("Interactive chat REPL (xAI Grok)")
  .option("--model <id>", "initial model id (overrides env)")
  .option("--trace <level>", "reasoning visibility: none|plan|verbose", "plan")
  .option("--thinking <mode>", "off|summary|raw (maps to trace)", "summary")
  .option("--verify <mode>", "none|lint|test|both", "none")
  .option("--auto", "auto-approve tool actions", false)
  .option("--safe", "require approval for writes & commands", false)
  .option("--log", "enable detailed logging", false)
  .option("--plan", "plan first, then confirm and execute", false)
  .action(async (opts) => {
    // Load .env so XAI_API_KEY is available when REPL starts
    try { await import("dotenv"); } catch {}
    if (opts?.model) process.env.FORGE_MODEL = String(opts.model);
    await startEnhancedREPL();
  });

/** ask (one-shot) */
program
  .command("ask <prompt...>")
  .description("One-shot question using Grok")
  .action(async (parts) => {
    const prompt = Array.isArray(parts) ? parts.join(" ") : String(parts);
    console.log(prompt);
  });

/* --------------------------- Environment diagnostics ------------------------- */
const envCmd = program.command("env").description("environment utilities");
envCmd
  .command("doctor")
  .description("print environment diagnostics for forge")
  .action(async () => {
    console.log("## Environment");
    console.log(`- node: ${process.version}`);
    console.log(`- tty: ${process.stdout.isTTY}`);
  });

/** summarize working tree diffs using the model */
program
  .command("changes")
  .description("summarize code changes from current working tree diffs")
  .option("--trace <level>", "reasoning visibility: none|plan|verbose", "plan")
  .action(async (opts) => {
    ensureConfigDir();
    const llm = new GrokProvider();
    const md = await summarizeChangesWithModel(llm, { trace: opts.trace });
    process.stdout.write(md + "\n");
  });

program
  .command("bundle")
  .description("Bundle project into a single labeled file")
  .option("--out <file>", "Output file", "project_bundle.txt")
  .action(async (opts) => {
    const out = await bundleProject({ outFile: opts.out });
    console.log(`\n✅ Bundle created at: ${out}\n`);
  });

program
  .command("pr")
  .description("Create a GitHub pull request via gh")
  .option("--title <title>", "PR title")
  .option("--body <body>", "PR body", "Automated changes from forge")
  .option("--draft", "Create as draft", false)
  .action(async (opts) => {
    const { url, stdout, stderr, code } = await createPullRequest({ title: opts.title, body: opts.body, draft: !!opts.draft });
    if (code === 0) console.log(`\n✅ PR created: ${url}\n`);
    else console.error(`\n❌ gh failed (${code})\n${stderr || stdout}`);
  });

/** auth (xAI) */
registerAuthXaiCommands(program);

/** plugins */
registerPluginCommands(program);

/** memory */
registerMemoryCommands(program);

/** sessions */
registerSessionCommands(program);

/** RAG */
registerRAGCommands(program);

/** MCP */
registerMCPCommands(program);

/** parse CLI */
program.parseAsync(process.argv).catch((err) => {
  // Do not crash; log and exit with non-zero code
  const msg = err?.message || String(err);
  console.error("Error:", msg);
  if (process.env.DEBUG) {
    console.error(err?.stack || "(no stack)");
  }
  process.exit(1);
});
