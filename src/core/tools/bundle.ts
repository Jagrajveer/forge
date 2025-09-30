// src/core/tools/bundle.ts
// One-file project bundler with per-file labels.
// Safe defaults: skips node_modules, dist, .git, large/binary files.

import { promises as fs } from "node:fs";
import path from "node:path";

export interface BundleOptions {
  rootDir?: string;          // project root (default: process.cwd())
  outFile?: string;          // output path (default: "project_bundle.txt")
  include?: string[];        // extensions to include
  excludeDirs?: string[];    // directories to skip
  maxFileBytes?: number;     // skip files larger than this (default: 512 KiB)
}

const DEFAULT_EXTS = [
  ".ts", ".tsx", ".js", ".jsx", ".cjs", ".mjs",
  ".json", ".md", ".yml", ".yaml",
  ".sh", ".bash", ".zsh",
  ".css", ".scss",
  ".toml", ".ini",
  ".d.ts"
];

const DEFAULT_EXCLUDE_DIRS = [
  "node_modules", ".git", "dist", "build", "out", ".next", ".turbo", ".cache", ".vercel"
];

const MAX_FILE_BYTES_DEFAULT = 512 * 1024; // 512 KiB

function isProbablyText(ext: string) {
  // Best-effort: treat known source/doc extensions as text.
  return DEFAULT_EXTS.includes(ext.toLowerCase());
}

// Explicitly annotate async generator type so TS doesn't complain under --strict.
// Yields absolute file paths.
async function* walk(
  dir: string,
  excludeDirs: Set<string>
): AsyncGenerator<string, void, unknown> {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  for (const e of entries) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (excludeDirs.has(e.name)) continue;
      yield* walk(full, excludeDirs);
    } else if (e.isFile()) {
      yield full;
    }
  }
}

function labelFor(fileRel: string) {
  const line = `// ── FILE: ${fileRel}`;
  return `${line}\n`;
}

// Discriminated union so narrowing works after checking `skip`.
type ReadSafeResult =
  | { skip: true; reason: string }
  | { skip: false; content: string };

async function readSafe(file: string, maxBytes: number): Promise<ReadSafeResult> {
  const stat = await fs.stat(file);
  if (stat.size > maxBytes) {
    return { skip: true, reason: `> ${maxBytes} bytes` };
  }
  const buf = await fs.readFile(file);
  return { skip: false, content: buf.toString("utf8") };
}

export async function bundleProject(opts: BundleOptions = {}) {
  const rootDir = path.resolve(opts.rootDir || process.cwd());
  const outFile = path.resolve(rootDir, opts.outFile || "project_bundle.txt");
  const include = (opts.include && opts.include.length > 0)
    ? opts.include.map(e => e.toLowerCase())
    : DEFAULT_EXTS;
  const excludeDirs = new Set(
    (opts.excludeDirs && opts.excludeDirs.length > 0)
      ? opts.excludeDirs
      : DEFAULT_EXCLUDE_DIRS
  );
  const maxBytes = opts.maxFileBytes ?? MAX_FILE_BYTES_DEFAULT;

  const chunks: string[] = [];
  chunks.push("// Project Bundle\n");
  chunks.push(`// Root: ${rootDir}\n`);
  chunks.push("// NOTE: Each section below is labeled with its file path.\n\n");

  for await (const abs of walk(rootDir, excludeDirs)) {
    const rel = path.relative(rootDir, abs);
    // skip output file if bundling in place
    if (path.resolve(abs) === outFile) continue;

    const ext = path.extname(abs).toLowerCase();
    if (!include.includes(ext) && !isProbablyText(ext)) continue;

    try {
      const res = await readSafe(abs, maxBytes);

      if (res.skip) {
        chunks.push(labelFor(rel));
        chunks.push(`// (skipped — ${res.reason})\n\n`);
        continue;
      }

      // res is now { skip: false, content: string } thanks to narrowing.
      chunks.push(labelFor(rel));
      chunks.push(res.content.endsWith("\n") ? res.content : res.content + "\n");
      chunks.push("\n");
    } catch (err: any) {
      chunks.push(labelFor(rel));
      chunks.push(`// (error reading file) ${String(err?.message || err)}\n\n`);
    }
  }

  const output = chunks.join("");
  await fs.writeFile(outFile, output, "utf8");
  return outFile;
}

// Optional tiny CLI for manual use (node dist/core/tools/bundle.js --out project_bundle.txt)
if (import.meta.url === `file://${process.argv[1]}`) {
  (async () => {
    const getArg = (flag: string) => {
      const i = process.argv.indexOf(flag);
      return i >= 0 ? process.argv[i + 1] : undefined;
    };
    const out = getArg("--out");
    const root = getArg("--root");
    const outPath = await bundleProject({ outFile: out, rootDir: root });
    console.log(`Bundle written to: ${outPath}`);
  })().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
