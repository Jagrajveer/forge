// src/core/tools/pr.ts
// Minimal GitHub PR helper via the official `gh` CLI.
// Requires `gh` installed and authenticated (`gh auth login`).

import { spawn } from "node:child_process";

export interface CreatePrOptions {
  title: string;
  body?: string;
  draft?: boolean;
  base?: string;   // e.g. "main"
  head?: string;   // current branch by default
  cwd?: string;    // repo root (default: process.cwd())
  extraArgs?: string[]; // pass-through flags if you need
}

export function createPullRequest(opts: CreatePrOptions): Promise<{ url?: string; stdout: string; stderr: string; code: number; }> {
  return new Promise((resolve) => {
    const args = ["pr", "create"];
    if (opts.title) args.push("--title", opts.title);
    if (opts.body)  args.push("--body", opts.body);
    if (opts.draft) args.push("--draft");
    if (opts.base)  args.push("--base", opts.base);
    if (opts.head)  args.push("--head", opts.head);
    if (opts.extraArgs && opts.extraArgs.length) args.push(...opts.extraArgs);

    const child = spawn("gh", args, {
      cwd: opts.cwd || process.cwd(),
      stdio: ["ignore", "pipe", "pipe"],
      shell: false
    });

    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (d) => (stdout += d.toString()));
    child.stderr.on("data", (d) => (stderr += d.toString()));
    child.on("close", (code) => {
      // gh prints the PR URL on success to stdout
      const urlMatch = stdout.match(/https?:\/\/\S+/);
      resolve({ url: urlMatch?.[0], stdout, stderr, code: code ?? 0 });
    });
  });
}
