export type ApprovalLevel = "safe" | "balanced" | "auto";

function isObviouslyDestructive(cmd: string): boolean {
  const t = cmd.replace(/\s+/g, " ").trim().toLowerCase();
  const bad = [
    /\brm\s+-rf\b/, /\brmdir\b/, /\bmkfs\b/, /\bdrop\s+database\b/,
    /\bshutdown\b/, /\breboot\b/, /\bsystemctl\b/,
    /\bnpm\s+publish\b/, /\byarn\s+publish\b/, /\bpnpm\s+publish\b/,
    /\bgit\s+push\b/, /\bgit\s+reset\b/, /\bgit\s+rebase\b/,
    /\bdocker\s+push\b/, /\bkubectl\s+apply\b/,
    /curl\s+.*\|\s*sh/, /wget\s+.*\|\s*sh/
  ];
  if (bad.some(rx => rx.test(t))) return true;
  // Multi-commands and pipes raise risk
  if (/[;&|]{1,2}/.test(t)) return true;
  return false;
}

export function requiresApprovalForRun(cmd: string, level: ApprovalLevel): boolean {
  if (level === "auto") return false;
  if (level === "safe") return true;
  // balanced: ask for destructive or multi-step
  return isObviouslyDestructive(cmd);
}

export function requiresApprovalForWrite(level: ApprovalLevel): boolean {
  if (level === "auto") return false;
  if (level === "safe") return true;
  // balanced: ask for writes (edits are inherently risky)
  return true;
}
