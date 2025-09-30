import { Command } from "commander";
import * as path from "node:path";
import { listSessions, readSession, shortPreview } from "../state/session.js";
import { startEnhancedREPL } from "../core/repl.js";
import { summarizeSession } from "../core/flows/session_summarizer.js";
import { GrokProvider } from "../providers/grok.js";

export function registerSessionCommands(program: Command) {
  const cmd = program.command("session").description("manage JSONL sessions");

  cmd
    .command("list")
    .description("list saved sessions")
    .action(() => {
      const rows = listSessions();
      if (!rows.length) {
        console.log("(no sessions)");
        return;
      }
      for (const r of rows) {
        console.log(`${r.file}\t${r.size}B\t${r.mtime.toISOString()}\t${r.roles.join(',')}`);
      }
    });

  cmd
    .command("show <file>")
    .description("pretty print a session JSONL file")
    .action((file) => {
      const turns = readSession(file);
      for (const t of turns) {
        console.log(`[${t.ts}] ${t.role}: ${t.content}`);
      }
    });

  cmd
    .command("resume <file>")
    .description("resume a chat seeded with that history")
    .option("--trace <level>", "none|plan|verbose", "plan")
    .action(async (file, opts) => {
      const turns = readSession(file);
      const llm = new GrokProvider();
      let summary = "";
      if (turns.length > 40) {
        summary = await summarizeSession(llm as any, turns.slice(0, -20), opts.trace);
        console.log(`Resuming from ${file} (summarized earlier turns)`);
      } else {
        console.log(`Resuming from ${file}`);
      }
      // Start enhanced REPL with session context
      if (summary) {
        console.log(`\n📝 Session Summary:\n${summary}\n`);
      }
      console.log("Starting enhanced REPL with session context...");
      await startEnhancedREPL();
    });
}


