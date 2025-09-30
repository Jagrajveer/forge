import { spawn } from "node:child_process";

export interface RunResult {
  code: number | null;
  stdout: string;
  stderr: string;
}

export interface RunOptions {
  cwd?: string;
  env?: NodeJS.ProcessEnv;
  stream?: (data: { stdout?: string; stderr?: string }) => void;
  shell?: string | boolean;
  timeoutMs?: number;
  stdioCapBytes?: number; // soft cap for aggregated stdout/stderr
  args?: string[]; // command arguments (when cmd is just the executable)
}

const DEFAULT_TIMEOUT =
  Number.parseInt(process.env.FORGE_CMD_TIMEOUT_MS || "") || undefined;
const DEFAULT_STDIO_CAP =
  Number.parseInt(process.env.FORGE_TOOL_STDIO_LIMIT || "") || undefined;

function capMerge(current: string, chunk: Buffer, cap?: number): string {
  // For simplicity, cap by characters (approx bytes for ASCII; acceptable for logs)
  const s = chunk.toString("utf8");
  if (!cap) return current + s;
  const merged = current + s;
  // Keep the last ~cap chars
  return merged.length > cap ? merged.slice(merged.length - cap) : merged;
}

// Overload 1: object options (preferred)
export function runCommand(cmd: string, opts?: RunOptions): Promise<RunResult>;
// Overload 2: numeric timeout (legacy/callsite-agnostic)
export function runCommand(cmd: string, timeoutMs?: number): Promise<RunResult>;

// Implementation: accepts either RunOptions or number and normalizes to options.
// (Implementation must be general enough to satisfy both overloads.) :contentReference[oaicite:1]{index=1}
export function runCommand(
  cmd: string,
  optsOrTimeout?: RunOptions | number
): Promise<RunResult> {
  const opts: RunOptions =
    typeof optsOrTimeout === "number"
      ? { timeoutMs: optsOrTimeout }
      : optsOrTimeout ?? {};

  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT;
  const stdioCap = opts.stdioCapBytes ?? DEFAULT_STDIO_CAP;

  return new Promise((resolve, reject) => {
    const args = opts.args || [];
    const child = spawn(cmd, args, {
      cwd: opts.cwd,
      env: { ...process.env, ...(opts.env || {}) },
      // On Windows, using shell ensures .bat/.cmd & built-ins resolve correctly. :contentReference[oaicite:2]{index=2}
      shell: opts.shell ?? true,
      windowsHide: true,
    });

    let stdout = "";
    let stderr = "";

    const onStdout = (chunk: Buffer) => {
      stdout = capMerge(stdout, chunk, stdioCap);
      opts.stream?.({ stdout: chunk.toString("utf8") });
    };
    const onStderr = (chunk: Buffer) => {
      stderr = capMerge(stderr, chunk, stdioCap);
      opts.stream?.({ stderr: chunk.toString("utf8") });
    };

    child.stdout?.on("data", onStdout);
    child.stderr?.on("data", onStderr);

    let timer: NodeJS.Timeout | undefined;
    if (timeoutMs && timeoutMs > 0) {
      timer = setTimeout(() => {
        // Reject on timeout to match existing behavior at call sites.
        try { child.kill("SIGKILL"); } catch { /* ignore */ }
        reject(new Error(`Command timed out after ${timeoutMs}ms`));
      }, timeoutMs);
    }

    child.on("error", (err) => {
      if (timer) clearTimeout(timer);
      reject(err);
    });
    child.on("close", (code) => {
      if (timer) clearTimeout(timer);
      resolve({ code, stdout, stderr });
    });
  });
}
