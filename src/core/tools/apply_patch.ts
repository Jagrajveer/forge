import { spawn } from "node:child_process";

export interface ApplyPatchResult {
  ok: boolean;
  stdout: string;
  stderr: string;
  attempted: string[];
}

/**
 * Apply a unified diff using git's 3-way merge machinery for resilience.
 * Requires `git` in PATH and running inside a git repo.
 */
export async function applyPatch(patchText: string): Promise<ApplyPatchResult> {
  const attempted: string[] = [];
  // Try: git apply -3 --index --reject -
  const tryApply = (args: string[]) =>
    new Promise<{ ok: boolean; stdout: string; stderr: string }>((resolve) => {
      const child = spawn("git", ["apply", ...args, "-"], { shell: false });
      let stdout = "";
      let stderr = "";
      child.stdout.on("data", (b) => (stdout += b.toString("utf8")));
      child.stderr.on("data", (b) => (stderr += b.toString("utf8")));
      child.on("close", (code) => resolve({ ok: code === 0, stdout, stderr }));
      child.stdin.write(patchText);
      child.stdin.end();
    });

  // Attempt sequence
  const attempts: string[][] = [
    ["-3", "--index", "--reject", "--whitespace=nowarn"],
    ["-3", "--reject", "--whitespace=nowarn"],
    ["--reject", "--whitespace=nowarn"],
  ];

  for (const args of attempts) {
    attempted.push(`git apply ${args.join(" ")} -`);
    const res = await tryApply(args);
    if (res.ok) return { ok: true, stdout: res.stdout, stderr: res.stderr, attempted };
    // keep trying
  }
  // Failed
  return { ok: false, stdout: "", stderr: "git apply failed; see attempted strategies", attempted };
}
