import { runCommand } from "./run.js";

/**
 * Return git status in stable, script-friendly form.
 * We prefer --porcelain=v1 (backward compatible, colorless), per docs. :contentReference[oaicite:1]{index=1}
 */
export async function gitStatusPorcelain(cwd: string = process.cwd()): Promise<string> {
  const { stdout } = await runCommand("git status --porcelain=v1", { cwd });
  return stdout.trim();
}

/**
 * Return a machine-friendly per-file table of insertions/deletions.
 * --numstat is ideal for parsing; for binaries it yields "- - <path>". :contentReference[oaicite:2]{index=2}
 */
export async function gitDiffNumstat(opts: { staged?: boolean; cwd?: string } = {}): Promise<string> {
  const { staged = false, cwd = process.cwd() } = opts;
  const cmd = staged ? "git diff --cached --numstat" : "git diff --numstat";
  const { stdout } = await runCommand(cmd, { cwd });
  return stdout.trim();
}

/** Human-readable summary lines per file (kept for reference / quick view). :contentReference[oaicite:3]{index=3} */
export async function gitDiffStat(opts: { staged?: boolean; cwd?: string } = {}): Promise<string> {
  const { staged = false, cwd = process.cwd() } = opts;
  const cmd = staged ? "git diff --cached --stat" : "git diff --stat";
  const { stdout } = await runCommand(cmd, { cwd });
  return stdout.trim();
}

/** Recent commits in a compact, tab-delimited pretty format. :contentReference[oaicite:4]{index=4} */
export async function gitLogShort(n = 10, cwd: string = process.cwd()): Promise<string> {
  const fmt = `%h%x09%ad%x09%an%x09%s`; // hash, date, author, subject
  const cmd = `git log --date=short -n ${n} --pretty=format:"${fmt}"`;
  const { stdout } = await runCommand(cmd, { cwd });
  return stdout.trim();
}

/**
 * High-level summarizer: prints a concise markdown summary of:
 * - staged vs unstaged totals (files, +insertions, -deletions)
 * - top changed files by churn
 * - recent commits
 *
 * Uses only read-only commands (`git status`, `git diff`, `git log`).
 */
export async function summarizeRepoChanges(cwd: string = process.cwd()): Promise<string> {
  // Detect if anything changed at all
  const status = await gitStatusPorcelain(cwd);
  const hasChanges = Boolean(status);

  const unstaged = await parseNumstat(await gitDiffNumstat({ cwd }));
  const staged = await parseNumstat(await gitDiffNumstat({ staged: true, cwd }));

  // Build sections
  const lines: string[] = [];
  lines.push("## Repo changes summary");
  lines.push("");

  if (!hasChanges) {
    lines.push("_Working tree is clean (no unstaged or staged changes)._");
  } else {
    lines.push("### Uncommitted changes");
    if (unstaged.files.length === 0 && staged.files.length === 0) {
      lines.push("(Changes detected by status, but no line-level diffs — possibly binary-only changes.)");
    }
    if (unstaged.files.length) {
      lines.push(renderBucket("Unstaged", unstaged));
    }
    if (staged.files.length) {
      lines.push(renderBucket("Staged", staged));
    }
  }

  // Always show recent commits for context
  const log = await gitLogShort(10, cwd);
  if (log) {
    lines.push("");
    lines.push("### Recent commits (last 10)");
    lines.push("```text");
    lines.push(log);
    lines.push("```");
  }

  return lines.join("\n");
}

// ---------- helpers ----------

type NumStat = { added: number; deleted: number; path: string };
type DiffBucket = {
  files: NumStat[];
  totalFiles: number;
  totalAdded: number;
  totalDeleted: number;
  topFiles: NumStat[]; // sorted by churn
  byExt: Array<{ ext: string; files: number; added: number; deleted: number }>;
};

async function parseNumstat(out: string): Promise<DiffBucket> {
  const files: NumStat[] = [];
  let totalAdded = 0;
  let totalDeleted = 0;

  // numstat format: "<added>\t<deleted>\t<path>\n"
  // For binaries: "-\t-\t<path>" (we treat as zero-line changes). :contentReference[oaicite:5]{index=5}
  for (const line of out.split(/\r?\n/)) {
    if (!line.trim()) continue;
    const parts = line.split("\t");
    if (parts.length < 3) continue;
    const a = parts[0] === "-" ? 0 : Number(parts[0]) || 0;
    const d = parts[1] === "-" ? 0 : Number(parts[1]) || 0;
    const path = parts.slice(2).join("\t");
    files.push({ added: a, deleted: d, path });
    totalAdded += a;
    totalDeleted += d;
  }

  // top files by churn
  const topFiles = [...files]
    .sort((x, y) => (y.added + y.deleted) - (x.added + x.deleted))
    .slice(0, 10);

  // group by extension
  const byExtMap = new Map<string, { files: number; added: number; deleted: number }>();
  for (const f of files) {
    const m = /\.([a-zA-Z0-9_-]+)$/.exec(f.path);
    const ext = m ? m[1].toLowerCase() : "(no-ext)";
    const prev = byExtMap.get(ext) ?? { files: 0, added: 0, deleted: 0 };
    prev.files += 1;
    prev.added += f.added;
    prev.deleted += f.deleted;
    byExtMap.set(ext, prev);
  }
  const byExt = [...byExtMap.entries()]
    .map(([ext, v]) => ({ ext, ...v }))
    .sort((a, b) => (b.added + b.deleted) - (a.added + a.deleted))
    .slice(0, 10);

  return {
    files,
    totalFiles: files.length,
    totalAdded,
    totalDeleted,
    topFiles,
    byExt,
  };
}

function renderBucket(title: string, b: DiffBucket): string {
  const lines: string[] = [];
  lines.push(`#### ${title}`);
  lines.push(`- files: ${b.totalFiles}  |  +${b.totalAdded}  -${b.totalDeleted}`);
  if (b.topFiles.length) {
    lines.push("");
    lines.push("_Top files by churn:_");
    lines.push("```text");
    for (const f of b.topFiles) {
      lines.push(`${pad(f.added, 6)} ${pad(f.deleted, 6)}  ${f.path}`);
    }
    lines.push("```");
  }
  if (b.byExt.length) {
    lines.push("");
    lines.push("_By extension:_");
    lines.push("```text");
    for (const e of b.byExt) {
      lines.push(`${pad(e.added, 6)} ${pad(e.deleted, 6)}  ${pad(e.files, 4)}  .${e.ext}`);
    }
    lines.push("```");
  }
  return lines.join("\n");
}

function pad(n: number, w: number): string {
  const s = String(n);
  return " ".repeat(Math.max(0, w - s.length)) + s;
}
