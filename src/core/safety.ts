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
  if (/[;&|]{1,2}/.test(t)) return true;
  return false;
}

export function requiresApprovalForRun(cmd: string, level: ApprovalLevel): boolean {
  if (level === "auto") return false;
  if (level === "safe") return true;
  // balanced: destructive or multi-step commands require approval
  return isObviouslyDestructive(cmd);
}

/**
 * For writes we consider size:
 *  - auto: never prompt
 *  - safe: always prompt
 *  - balanced: prompt for unknown size (patches) or > 8KB; otherwise auto-approve
 */
export function requiresApprovalForWrite(level: ApprovalLevel, sizeBytes?: number): boolean {
  if (level === "auto") return false;
  if (level === "safe") return true;
  if (sizeBytes == null) return true; // patches / unknown sizes
  return sizeBytes > 8 * 1024;
}
