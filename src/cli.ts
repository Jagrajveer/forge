#!/usr/bin/env node
import { Command } from "commander";
import prompts from "prompts";
import { GrokProvider } from "./providers/grok.js";
import { loadProfile } from "./config/profile.js";
import { printTokenPanel } from "./ui/render.js";

const program = new Command();

program
  .name("forge")
  .description("Forge CLI - AI coding assistant powered by xAI Grok")
  .version("0.1.0");

// --- chat (streaming) ---
program
  .command("chat")
  .description("Start interactive chat with Grok (streaming)")
  .action(async () => {
    const provider = new GrokProvider();
    const messages: { role: "system" | "user" | "assistant"; content: string }[] = [
      {
        role: "system",
        content:
          "You are an expert software engineer and careful AI agent. Keep answers concise."
      }
    ];

    console.log("Type your message. /exit to quit.\n");

    // loop
    // eslint-disable-next-line no-constant-condition
    while (true) {
      const { input } = await prompts({
        type: "text",
        name: "input",
        message: "you"
      });
      const text = (input ?? "").trim();
      if (!text || text.toLowerCase() === "/exit") break;

      messages.push({ role: "user", content: text });
      process.stdout.write("assistant ");
      process.stdout.write("› ");

      let assembled = "";
      try {
        for await (const chunk of provider.chat(messages, { stream: true })) {
          process.stdout.write(chunk);
          assembled += chunk;
        }
        process.stdout.write("\n");
        messages.push({ role: "assistant", content: assembled });
        // No reliable usage from SSE; show panel placeholder
        printTokenPanel(undefined);
      } catch (e: any) {
        process.stdout.write("\n");
        console.error(`Error: ${e?.message ?? String(e)}`);
      }
    }
  });

// --- auth ---
const auth = program.command("auth").description("Auth and provider utilities");

auth
  .command("info")
  .description("Print resolved provider, base URL, model id, and which API key is set")
  .action(() => {
    const cfg = loadProfile();
    const whichKey =
      cfg.provider === "xai"
        ? (cfg.apiKey ? "GROK_API_KEY" : "none")
        : (cfg.apiKey ? "OPENROUTER_API_KEY" : "none");
    console.log("Resolved configuration:");
    console.log(`  provider:  ${cfg.provider}`);
    console.log(`  baseUrl:   ${cfg.baseUrl}`);
    console.log(`  modelId:   ${cfg.modelId}`);
    console.log(`  apiKey:    ${whichKey}`);
    if (cfg.profilePath) console.log(`  profile:   ${cfg.profilePath}`);
  });

auth
  .command("test")
  .description("Ping the model and print model/provider/base + a short reply")
  .action(async () => {
    try {
      const { model, reply, provider, baseUrl } = await GrokProvider.ping();
      const ok = reply === "pong";
      console.log(`Provider: ${provider}`);
      console.log(`Base URL: ${baseUrl}`);
      console.log(`Model:    ${model}`);
      console.log(`Reply:    ${reply}`);
      console.log(ok ? "✓ Auth OK" : "⚠ Unexpected reply (auth/route may still be OK)");
    } catch (err: any) {
      console.error("Auth test failed:");
      console.error(err?.message ?? String(err));
      process.exitCode = 1;
    }
  });

program.parse();
