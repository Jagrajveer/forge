import * as fs from "node:fs";
import * as path from "node:path";
import { runCommand } from "./tools/run.js";

export type VerifyMode = "none" | "lint" | "test" | "both";

function scriptExists(pkg: any, name: string): boolean {
  return Boolean(pkg?.scripts && typeof pkg.scripts[name] === "string");
}

function readPkg(cwd: string) {
  const p = path.join(cwd, "package.json");
  if (fs.existsSync(p)) {
    try { return JSON.parse(fs.readFileSync(p, "utf8")); } catch {}
  }
  return undefined;
}

function pickCommands(cwd: string, mode: VerifyMode): string[] {
  if (mode === "none") return [];
  const pkg = readPkg(cwd);
  const cmds: string[] = [];
  const lintCmd =
    scriptExists(pkg, "lint") ? "npm run lint --silent" :
    scriptExists(pkg, "lint:fix") ? "npm run lint:fix --silent" :
    undefined;
  const testCmd =
    scriptExists(pkg, "test") ? "npm test --silent" :
    scriptExists(pkg, "test:unit") ? "npm run test:unit --silent" :
    undefined;

  if (mode === "lint" || mode === "both") cmds.push(lintCmd ?? "npm run lint --silent");
  if (mode === "test" || mode === "both") cmds.push(testCmd ?? "npm test --silent");
  return cmds;
}

export async function runVerification(mode: VerifyMode, cwd = process.cwd()): Promise<{ ok: boolean; summary: string }> {
  const cmds = pickCommands(cwd, mode);
  if (!cmds.length) return { ok: true, summary: "verification disabled." };

  const lines: string[] = [];
  let overallOK = true;
  for (const cmd of cmds) {
    lines.push(`$ ${cmd}`);
    try {
      const res = await runCommand(cmd, { cwd, timeoutMs: 10 * 60_000, stdioCapBytes: 500_000 });
      const out = (res.stdout || res.stderr || "").trim();
      lines.push(out ? out : "(no output)");
      overallOK = overallOK && res.code === 0;
    } catch (err: any) {
      lines.push(String(err?.message ?? err ?? "command failed"));
      overallOK = false;
    }
    lines.push(""); // spacer
  }

  return { ok: overallOK, summary: lines.join("\n") };
}
