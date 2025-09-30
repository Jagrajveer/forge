#!/usr/bin/env node
import { Command } from "commander";
import prompts from "prompts";
import * as fs from "node:fs";
import * as path from "node:path";

import { Agent } from "./core/agent.js";
import { ensureConfigDir, loadProfile, saveProfile, clearApiKey } from "./config/profile.js";
import { env } from "./config/env.js";
import { GrokProvider } from "./providers/grok.js";
import { summarizeChangesWithModel } from "./core/flows/summarize_changes.js";
import { renderTokensPanel } from "./ui/render.js";
import { bundleProject } from "./core/tools/bundle.js";


const program = new Command();
program.name("forge").description("Grok-powered engineering copilot");

/* -------------------------------- Chat (REPL) -------------------------------- */
program
  .command("chat")
  .description("interactive chat/agent REPL")
  .option("--auto", "no confirmations (auto-approve risky actions)", false)
  .option("--safe", "strict approvals for risky actions", false)
  .option("--trace <level>", "reasoning visibility: none|plan|verbose", "plan")
  .option("--temperature <n>", "model temperature", "0.3")
  .action(async (opts) => {
    ensureConfigDir();
    const agent = new Agent({
      trace: opts.trace,
      temperature: Number(opts.temperature) || 0.3,
      approvalLevel: opts.auto ? "auto" : opts.safe ? "safe" : "balanced",
    });

    process.stdout.write("Type your message. Enter /exit to quit.\n");
    await agent.chatInteractive(async () => {
      const ans = await prompts({ type: "text", name: "msg", message: "you …" });
      return (ans?.msg as string) ?? "";
    });
  });

/* ------------------------------ One-shot 'ask' ------------------------------- */
program
  .command("ask")
  .description("one-shot question (prints answer only)")
  .argument("<question...>", "your question")
  .option("--temperature <n>", "model temperature", "0.3")
  .action(async (question: string[], opts) => {
    ensureConfigDir();
    const llm = new GrokProvider();
    const q = question.join(" ");
    const { text, usage } = (await llm.chat(
      [
        { role: "system", content: "You are a concise, accurate assistant." },
        { role: "user", content: q },
      ],
      { stream: false, temperature: Number(opts.temperature) || 0.3 }
    )) as { text: string; usage?: any };

    process.stdout.write((text ?? "").trim() + "\n");
    if (usage) process.stdout.write(renderTokensPanel(usage));
  });

/* --------------------------- Environment diagnostics ------------------------- */
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
    lines.push(`- apiKey: ${cfg.apiKey ? "(set)" : "(missing)"}`);
    lines.push("");
    process.stdout.write(lines.join("\n"));
  });

/* ----------------------------- Auth handlers -------------------------------- */
async function authLoginAction(opts: {
  provider?: "xai" | "openrouter";
  key?: string;
  model?: string;
  baseUrl?: string;
  global?: boolean;
} = {}) {
  ensureConfigDir(opts.global ? "global" : "project");
  const current = loadProfile();

  const provider = (opts.provider ??
    (await prompts({
      type: "select", name: "provider", message: "Provider",
      choices: [{ title: "OpenRouter", value: "openrouter" }, { title: "xAI (direct)", value: "xai" }],
      initial: current.provider === "xai" ? 1 : 0,
    }, { onCancel: () => { process.stderr.write("aborted.\n"); process.exit(1); } })).provider ??
    current.provider ?? "openrouter") as "xai" | "openrouter";

  const defaultBase = opts.baseUrl ?? current.baseUrl ??
    (provider === "xai" ? "https://api.x.ai/v1" : "https://openrouter.ai/api/v1");

  const baseUrl = (opts.baseUrl ??
    (await prompts({
      type: "text", name: "baseUrl", message: "Base URL (press enter for default)", initial: defaultBase
    }, { onCancel: () => { process.stderr.write("aborted.\n"); process.exit(1); } })).baseUrl ??
    defaultBase) as string;

  const model = (opts.model ??
    (await prompts({
      type: "text", name: "model", message: "Default model", initial: current.model ?? "x-ai/grok-code-fast-1"
    }, { onCancel: () => { process.stderr.write("aborted.\n"); process.exit(1); } })).model ??
    (current.model ?? "x-ai/grok-code-fast-1")) as string;

  const apiKey = (opts.key ??
    (await prompts({
      type: "password", name: "apiKey", message: "API key",
      validate: (v: string) => (v && v.trim().length > 10 ? true : "Enter a valid key")
    }, { onCancel: () => { process.stderr.write("aborted.\n"); process.exit(1); } })).apiKey) as string;

  const saved = saveProfile({ provider, baseUrl, model, apiKey: apiKey?.trim() }, opts.global ? "global" : "project");

  process.stdout.write(
    [
      `✔ Saved credentials to ${opts.global ? "~/.forge/config.json" : ".forge/config.json"}`,
      `- provider: ${saved.provider}`,
      `- baseUrl: ${saved.baseUrl}`,
      `- model: ${saved.model}`,
      `- apiKey: ${saved.apiKey ? "(set)" : "(missing)"}`,
      "",
      "Tip: environment variables like GROK_API_KEY or OPENROUTER_API_KEY still override.",
      "",
    ].join("\n")
  );
}

async function authLogoutAction(opts: { global?: boolean } = {}) {
  ensureConfigDir(opts.global ? "global" : "project");
  const next = clearApiKey(opts.global ? "global" : "project");
  process.stdout.write(
    [
      `✔ Removed apiKey from ${opts.global ? "~/.forge/config.json" : ".forge/config.json"}`,
      `- provider: ${next.provider}`,
      `- baseUrl: ${next.baseUrl}`,
      `- model: ${next.model}`,
      "",
    ].join("\n")
  );
}

async function authTestAction() {
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
}

/* ------------------------------ Auth commands ------------------------------- */
const authCmd = program.command("auth").description("authentication & connectivity");
authCmd
  .command("login")
  .description("enter provider and API key; writes .forge/config.json (or --global)")
  .option("--provider <name>", "xai|openrouter", undefined)
  .option("--key <apiKey>", "API key", undefined)
  .option("--model <id>", "model id (e.g., x-ai/grok-code-fast-1)", undefined)
  .option("--base-url <url>", "override base URL", undefined)
  .option("--global", "write to ~/.forge/config.json", false)
  .action(async (opts) => authLoginAction({
    provider: opts.provider, key: opts.key, model: opts.model, baseUrl: opts.baseUrl, global: !!opts.global
  }));

authCmd
  .command("logout")
  .description("remove stored API key from .forge/config.json (or --global)")
  .option("--global", "remove from ~/.forge/config.json", false)
  .action(async (opts) => authLogoutAction({ global: !!opts.global }));

authCmd
  .command("test")
  .description("ping the model and print model/usage")
  .action(authTestAction);

/* ------------------ Top-level aliases (call handlers directly) --------------- */
program
  .command("login")
  .description("alias for auth login")
  .option("--provider <name>", "xai|openrouter", undefined)
  .option("--key <apiKey>", "API key", undefined)
  .option("--model <id>", "model id (e.g., x-ai/grok-code-fast-1)", undefined)
  .option("--base-url <url>", "override base URL", undefined)
  .option("--global", "write to ~/.forge/config.json", false)
  .action(async (opts) => authLoginAction({
    provider: opts.provider, key: opts.key, model: opts.model, baseUrl: opts.baseUrl, global: !!opts.global
  }));

program
  .command("logout")
  .description("alias for auth logout")
  .option("--global", "remove from ~/.forge/config.json", false)
  .action(async (opts) => authLogoutAction({ global: !!opts.global }));

/* ------------------------- Diff-only summarization -------------------------- */
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

/* -------------------------------- Bundle ----------------------------------- */
program
  .command("bundle")
  .description("Bundle project into a single labeled file")
  .option("--out <file>", "Output file", "project_bundle.txt")
  .action(async (opts) => {
    const out = await bundleProject({ outFile: opts.out });
    console.log(`\n✅ Bundle created at: ${out}\n`);
  });

/* --------------------------------- Init ------------------------------------ */
program
  .command("init")
  .description("create .forge/ with MEMORY.md template if missing")
  .action(async () => {
    const dir = path.join(process.cwd(), ".forge");
    const mem = path.join(dir, "MEMORY.md");
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    if (!fs.existsSync(mem)) {
      fs.writeFileSync(
        `# Project Memory

## Build & Run
- build: npm run build
- start: npm start
- test: npm test
- lint: npm run lint

## Tech & Style
- Node 20+, TypeScript strict.
- ESLint (flat config) + Prettier optional.

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

/* ------------------------------ Lint placeholder ---------------------------- */
program.command("lint").description("ESLint helpers");

/* --------------------------------- Parse ----------------------------------- */
// Note: if you ever need to call parse/parseAsync manually, remember:
// program.parseAsync(['auth','login'], { from: 'user' }) expects just user args. :contentReference[oaicite:2]{index=2}
program.parseAsync(process.argv);


/* --------------------------------- Parse ----------------------------------- */
program.parseAsync(process.argv);
function createPullRequest(arg0: { title: any; body: any; draft: boolean; }): { url: any; stdout: any; stderr: any; code: any; } | PromiseLike<{ url: any; stdout: any; stderr: any; code: any; }> {
  throw new Error("Function not implemented.");
}

