import * as fs from "node:fs";
import * as path from "node:path";
import { runCommand } from "./tools/run.js";

export type VerifyMode = "none" | "lint" | "test" | "both";

function readPkg(cwd: string) {
  const p = path.join(cwd, "package.json");
  if (fs.existsSync(p)) {
    try { return JSON.parse(fs.readFileSync(p, "utf8")); } catch {}
  }
  return undefined;
}

function scriptExists(pkg: any | undefined, name: string): boolean {
  return Boolean(pkg?.scripts && typeof pkg.scripts[name] === "string");
}

function hasDevDep(pkg: any | undefined, name: string): boolean {
  return Boolean(pkg?.devDependencies?.[name] || pkg?.dependencies?.[name]);
}

function hasLocalBinary(cwd: string, bin: string): boolean {
  const p = path.join(
    cwd,
    "node_modules",
    ".bin",
    process.platform === "win32" ? `${bin}.cmd` : bin
  );
  return fs.existsSync(p);
}

function hasESLintConfig(cwd: string): boolean {
  const candidates = ["eslint.config.js", "eslint.config.mjs", "eslint.config.cjs"]
    .map(f => path.join(cwd, f));
  return candidates.some(fs.existsSync);
}

function pickCommands(
  cwd: string,
  mode: VerifyMode
): { cmd: string; why: string }[] {
  if (mode === "none") return [];
  const pkg = readPkg(cwd);

  const wantLint = mode === "lint" || mode === "both";
  const wantTest = mode === "test" || mode === "both";

  const cmds: { cmd: string; why: string }[] = [];

  // LINT: only run if configured
  if (wantLint) {
    if (scriptExists(pkg, "lint")) {
      cmds.push({ cmd: "npm run lint --silent", why: "npm script 'lint' present" });
    } else if (hasESLintConfig(cwd) && (hasDevDep(pkg, "eslint") || hasLocalBinary(cwd, "eslint"))) {
      // ESLint v9 default is flat config file (eslint.config.js*). Run directly if found.
      cmds.push({ cmd: "npx eslint . --max-warnings=0", why: "eslint config detected" });
    }
  }

  // TEST: only run if a test script exists
  if (wantTest && scriptExists(pkg, "test")) {
    cmds.push({ cmd: "npm test --silent", why: "npm script 'test' present" });
  }

  return cmds;
}

export async function runVerification(
  mode: VerifyMode,
  cwd = process.cwd()
): Promise<{ ok: boolean; summary: string }> {
  const cmds = pickCommands(cwd, mode);

  const lines: string[] = [];
  let overallOK = true;

  const wantsLint = mode === "lint" || mode === "both";
  const wantsTest = mode === "test" || mode === "both";
  const hasLintCmd = cmds.some(c => /(?:eslint|lint)\b/.test(c.cmd));
  const hasTestCmd = cmds.some(c => /\btest\b/.test(c.cmd));

  if (wantsLint && !hasLintCmd) {
    // Clear “what to do” message if not configured (ESLint v9 uses flat config)
    lines.push(
      "lint: skipped (ESLint not configured — no eslint.config.* and no `lint` script).",
      "See: ESLint v9 migration to flat config (eslint.config.js)."
    );
  }
  if (wantsTest && !hasTestCmd) {
    lines.push("test: skipped (no `test` script in package.json).");
  }
  if (!cmds.length) {
    return { ok: true, summary: lines.concat(["verification disabled or nothing to run."]).join("\n") };
  }

  for (const { cmd, why } of cmds) {
    lines.push(`$ ${cmd}    # ${why}`);
    try {
      const res = await runCommand(cmd, { cwd, timeoutMs: 10 * 60_000, stdioCapBytes: 500_000 });
      const out = (res.stdout || res.stderr || "").trim();
      lines.push(out ? out : "(no output)");
      overallOK = overallOK && res.code === 0;
    } catch (err: any) {
      lines.push(String(err?.message ?? err ?? "command failed"));
      overallOK = false;
    }
    lines.push("");
  }

  return { ok: overallOK, summary: lines.join("\n") };
}
