#!/usr/bin/env node
import { Command } from "commander";
import prompts from "prompts";
import * as fs from "node:fs";
import * as path from "node:path";

import { env } from "./config/env.js";
import { ensureConfigDir, loadProfile } from "./config/profile.js";
import { Agent } from "./core/agent.js";
import { GrokProvider } from "./providers/grok.js";
import { summarizeChangesWithModel } from "./core/flows/summarize_changes.js";
import { renderTokensPanel } from "./ui/render.js";
import { registerAuthXaiCommands } from "./commands/auth-xai.js";
import { registerPluginCommands } from "./commands/plugins.js";
import { log, setLogLevel } from "./core/logger.js";

const program = new Command();
program.name("forge").description("Grok-powered engineering copilot");

/** chat (interactive) */
program
  .command("chat")
  .description("Interactive chat session with the model")
  .option("--trace <level>", "reasoning visibility: none|plan|verbose", "plan")
  .option("--verify <mode>", "none|lint|test|both", "none")
  .option("--auto", "auto-approve tool actions", false)
  .option("--safe", "require approval for writes & commands", false)
  .option("--log", "enable detailed logging", false)
  .action(async (opts) => {
    // Set logging level based on --log flag
    if (opts.log) {
      setLogLevel("debug");
    } else {
      setLogLevel("warn"); // Only show warnings and errors by default
    }
    
    log.info("Starting interactive chat session", { options: opts });
    ensureConfigDir();
    const agent = new Agent({
      trace: opts.trace,
      approvalLevel: opts.auto ? "auto" : opts.safe ? "safe" : "balanced",
      verifyMode: opts.verify,
      execute: true, // Enable execution by default
    });

    const onInput = async () => {
      const { msg } = await prompts({
        type: "text",
        name: "msg",
        message: "you ...",
      });
      return (msg ?? "").toString();
    };

    try {
      await agent.chatInteractive(onInput);
      log.info("Chat session ended");
    } catch (error) {
      log.error("Chat session failed", { error: error instanceof Error ? error.message : String(error) });
      throw error;
    }
  });

/** ask (one-shot) */
program
  .command("ask <prompt...>")
  .description("One-shot question (optionally verify after edits)")
  .option("--trace <level>", "reasoning visibility: none|plan|verbose", "plan")
  .option("--verify <mode>", "none|lint|test|both", "none")
  .option("--auto", "auto-approve tool actions", false)
  .option("--safe", "require approval for writes & commands", false)
  .option("--log", "enable detailed logging", false)
  .action(async (parts, opts) => {
    // Set logging level based on --log flag
    if (opts.log) {
      setLogLevel("debug");
    } else {
      setLogLevel("warn"); // Only show warnings and errors by default
    }
    
    const prompt = Array.isArray(parts) ? parts.join(" ") : String(parts);
    log.info("Starting oneshot query", { prompt: prompt.slice(0, 100) + (prompt.length > 100 ? "..." : ""), options: opts });
    
    ensureConfigDir();
    const agent = new Agent({
      trace: opts.trace,
      approvalLevel: opts.auto ? "auto" : opts.safe ? "safe" : "balanced",
      verifyMode: opts.verify,
      execute: true, // Enable execution by default
    });
    
    try {
      await agent.oneshot(prompt);
      log.info("Oneshot query completed");
    } catch (error) {
      log.error("Oneshot query failed", { error: error instanceof Error ? error.message : String(error) });
      throw error;
    }
  });

/** env doctor */
const envCmd = program.command("env").description("environment utilities");
envCmd
  .command("doctor")
  .description("print environment diagnostics for forge")
  .action(async () => {
    ensureConfigDir();
    const cfg = loadProfile();

    console.log("## Environment");
    console.log(`- loaded: ${(env.LOADED_ENV_FILES || []).join(", ") || "(none)"}`);
    console.log(`- provider: ${cfg.provider}`);
    console.log(`- baseUrl: ${cfg.baseUrl ?? "(default)"}`);
    console.log(`- model: ${cfg.model}`);

    // quick ping to provider
    try {
      const llm = new GrokProvider(cfg);
      const res = (await llm.chat(
        [
          { role: "system", content: "You are a diagnostic assistant." },
          { role: "user", content: "Reply with: pong" },
        ],
        { stream: false, temperature: 0 },
      )) as { text: string; usage?: any };

      console.log("\nresponse:", (res.text || "").slice(0, 200));
      if (res.usage) process.stdout.write(renderTokensPanel(res.usage));
    } catch (e: any) {
      console.error("Ping failed:", e?.message || e);
    }
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

/** auth (xAI) */
registerAuthXaiCommands(program);

/** plugins */
registerPluginCommands(program);

/** parse CLI */
program.parseAsync(process.argv).catch((err) => {
  console.error(err?.stack || String(err));
  process.exit(1);
});
