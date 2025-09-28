// src/core/safety.ts
export type Mode = "safe" | "balanced" | "auto";

export function isDestructiveCommand(cmd: string): boolean {
  const dangerous = [
    /\brm\s+-rf\b/i,
    /\brmdir\s+/i,
    /\bmkfs\b/i,
    /\bdd\s+if=\//i,
    /\bshutdown\b/i,
    /\breboot\b/i,
    /\bformat\b/i,
    /:\(\)\s*\{\s*:\|\:\&\s*\};\s*:/, // fork bomb
    /\bSet-Item\s+WSMan:/i,
    /\bRemove-Item\b.*-Recurse\b.*-Force\b/i,
  ];
  return dangerous.some((re) => re.test(cmd));
}

export function mutatesSystem(cmd: string): boolean {
  const writers = [
    /\bapt(-get)?\s+install\b/i,
    /\byarn\s+add\b/i,
    /\bnpm\s+(i|install|add)\b/i,
    /\bbrew\s+install\b/i,
    /\bcp\s+/i,
    /\bmv\s+/i,
    /\bchmod\b/i,
    /\bchown\b/i,
    /\bdocker\b.*\brun\b/i,
  ];
  return writers.some((re) => re.test(cmd));
}

function envAllowsDangerous(): boolean {
  return /^true$/i.test(process.env.FORGE_ALLOW_DANGEROUS || "");
}

export function requiresApprovalForRun(cmd: string, mode: Mode): boolean {
  if (envAllowsDangerous()) return false;
  if (mode === "auto") return false;
  if (mode === "safe") return true;
  return isDestructiveCommand(cmd) || mutatesSystem(cmd);
}

export function requiresApprovalForWrite(mode: Mode): boolean {
  if (envAllowsDangerous()) return false;
  if (mode === "auto") return false;
  return true;
}
