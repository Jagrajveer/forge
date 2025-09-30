import { Command } from "commander";
import * as fs from "node:fs";
import * as path from "node:path";
import prompts from "prompts";
import { ensureConfigDir, loadMemory, memoryPath } from "../state/memory.js";

export function registerMemoryCommands(program: Command) {
  const cmd = program.command("memory").description("manage durable project memory");

  cmd
    .command("show")
    .description("print .forge/MEMORY.md contents")
    .action(() => {
      ensureConfigDir();
      const mem = loadMemory();
      process.stdout.write((mem ?? "(no memory)") + "\n");
    });

  cmd
    .command("add <note>")
    .description("append a note to .forge/MEMORY.md")
    .action((note) => {
      ensureConfigDir();
      const p = memoryPath();
      const line = `- ${new Date().toISOString()} ${note}\n`;
      fs.appendFileSync(p, line, "utf8");
      process.stdout.write(`Added note to ${p}\n`);
    });

  cmd
    .command("clear")
    .description("clear .forge/MEMORY.md (confirm)")
    .action(async () => {
      ensureConfigDir();
      const p = memoryPath();
      const { ok } = await prompts({ type: "confirm", name: "ok", message: `Clear ${p}?`, initial: false });
      if (!ok) return;
      fs.writeFileSync(p, "", "utf8");
      process.stdout.write(`Cleared ${p}\n`);
    });
}


