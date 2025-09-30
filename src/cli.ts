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
import { renderTokensPanel, renderWelcomeBanner, renderUserPrompt, renderAssistantResponse, renderSeparator } from "./ui/render.js";
import { startThinkingAnimation, startProcessingAnimation, stopAnimation, succeedAnimation, failAnimation } from "./ui/animations.js";
import { registerAuthXaiCommands } from "./commands/auth-xai.js";
import { registerPluginCommands } from "./commands/plugins.js";
import { registerMemoryCommands } from "./commands/memory.js";
import { registerSessionCommands } from "./commands/session.js";
import { log, setLogLevel } from "./core/logger.js";
import { bundleProject } from "./core/tools/bundle.js";
import { createPullRequest } from "./core/tools/pr.js";

const program = new Command();
program.name("forge").description("Grok-powered engineering copilot");

/** chat (interactive) */
program
  .command("chat")
  .description("Interactive chat session with the model")
  .option("--trace <level>", "reasoning visibility: none|plan|verbose", "plan")
  .option("--thinking <mode>", "off|summary|raw (maps to trace)", "summary")
  .option("--verify <mode>", "none|lint|test|both", "none")
  .option("--auto", "auto-approve tool actions", false)
  .option("--safe", "require approval for writes & commands", false)
  .option("--log", "enable detailed logging", false)
  .option("--plan", "plan first, then confirm and execute", false)
  .action(async (opts) => {
    // Set logging level based on --log flag
    if (opts.log) {
      setLogLevel("debug");
    } else {
      setLogLevel("warn"); // Only show warnings and errors by default
    }
    
    log.info("Starting interactive chat session", { options: opts });
    ensureConfigDir();
    const thinkingEnv = process.env.FORGE_THINKING;
    const thinking = (opts.thinking || thinkingEnv || "summary").toLowerCase();
    const trace = thinking === "off" ? "none" : thinking === "raw" ? "verbose" : (opts.trace || "plan");

    const agent = new Agent({
      trace,
      approvalLevel: opts.auto ? "auto" : opts.safe ? "safe" : "balanced",
      verifyMode: opts.verify,
      execute: true, // Enable execution by default
      planFirst: !!opts.plan,
    });

    // Show welcome banner with startup animation
    console.log(renderWelcomeBanner());
    
    // Add a brief startup animation
    startProcessingAnimation();
    await new Promise(resolve => setTimeout(resolve, 1500)); // 1.5 second delay
    stopAnimation();
    succeedAnimation("Ready to assist!");

    const onInput = async () => {
      const { msg } = await prompts({
        type: "text",
        name: "msg",
        message: "💬 ",
      });
      const s = (msg ?? "").toString();
      if (s.trim().startsWith("/config")) {
        const cfg = loadProfile();
        console.log("\nCurrent config:");
        console.log(`- provider: ${cfg.provider}`);
        console.log(`- baseUrl: ${cfg.baseUrl ?? "(default)"}`);
        console.log(`- model: ${cfg.model}`);
        console.log(`- tokensPanel: ${cfg.tokensPanel ? "on" : "off"}`);
        console.log(`- defaultTrace: ${cfg.defaultTrace ?? "plan"}`);
        console.log("");
        return ""; // skip sending to agent
      }
      return s;
    };

    try {
      await agent.chatInteractive(onInput);
      log.info("Chat session ended");
    } catch (error) {
      // Keep the process alive; report the error and return to shell without crash
      log.error("Chat session failed", { error: error instanceof Error ? error.message : String(error) });
    }
  });

/** ask (one-shot) */
program
  .command("ask <prompt...>")
  .description("One-shot question (optionally verify after edits)")
  .option("--trace <level>", "reasoning visibility: none|plan|verbose", "plan")
  .option("--thinking <mode>", "off|summary|raw (maps to trace)", "summary")
  .option("--verify <mode>", "none|lint|test|both", "none")
  .option("--auto", "auto-approve tool actions", false)
  .option("--safe", "require approval for writes & commands", false)
  .option("--log", "enable detailed logging", false)
  .option("--plan", "plan first, then confirm and execute", false)
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
    const thinkingEnv = process.env.FORGE_THINKING;
    const thinking = (opts.thinking || thinkingEnv || "summary").toLowerCase();
    const trace = thinking === "off" ? "none" : thinking === "raw" ? "verbose" : (opts.trace || "plan");

    const agent = new Agent({
      trace,
      approvalLevel: opts.auto ? "auto" : opts.safe ? "safe" : "balanced",
      verifyMode: opts.verify,
      execute: true, // Enable execution by default
      planFirst: !!opts.plan,
    });
    
    try {
      await agent.oneshot(prompt);
      log.info("Oneshot query completed");
    } catch (error) {
      // Do not crash; report and continue
      log.error("Oneshot query failed", { error: error instanceof Error ? error.message : String(error) });
    }
  });

/* --------------------------- Environment diagnostics ------------------------- */
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
