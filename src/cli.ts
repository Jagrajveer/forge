#!/usr/bin/env node
import { Command } from "commander";
import prompts from "prompts";
import { Agent } from "./core/agent.js";
import { ensureConfigDir } from "./config/profile.js";

const program = new Command();
program.name("forge").description("Grok-powered engineering copilot");

program
  .command("chat")
  .description("interactive chat (append-only rendering by default)")
  .option("--trace <level>", "reasoning visibility: none|plan|verbose", "plan")
  .option("--refresh", "enable legacy re-render mode (not recommended)", false)
  .option("--no-exec", "do not execute model-suggested actions (e.g., git diff)", false)
  .action(async (opts) => {
    ensureConfigDir();
    const agent = new Agent({
      trace: opts.trace,
      appendOnly: !opts.refresh,
      execute: opts.exec !== false, // default true; --no-exec disables
    });

    const onInput = async () => {
      const { text } = await prompts({
        type: "text",
        name: "text",
        message: "you",
      });
      return text as string;
    };

    await agent.chatInteractive(onInput);
  });

program
  .command("ask <prompt...>")
  .description("one-shot question")
  .option("--trace <level>", "reasoning visibility: none|plan|verbose", "plan")
  .action(async (parts, opts) => {
    ensureConfigDir();
    const agent = new Agent({ trace: opts.trace });
    await agent.oneshot(parts.join(" "));
  });

program.parseAsync(process.argv);
