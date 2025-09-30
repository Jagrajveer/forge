import { runCommand } from "./run.js";
import { validateBranchName, validateCommitMessage } from "../validation.js";
import { ToolError, handleError, ExecutionError } from "../errors.js";

/** git status --porcelain=v1 (stable for scripts) */
export async function gitStatusPorcelain(cwd: string = process.cwd()): Promise<string> {
  const { stdout } = await runCommand("git status --porcelain=v1", { cwd });
  return stdout.trim();
}

/** git diff --numstat (machine-friendly insertions/deletions per file) */
export async function gitDiffNumstat(opts: { staged?: boolean; cwd?: string } = {}): Promise<string> {
  const { staged = false, cwd = process.cwd() } = opts;
  const cmd = staged ? "git diff --cached --numstat" : "git diff --numstat";
  const { stdout } = await runCommand(cmd, { cwd });
  return stdout.trim();
}

/** git diff --stat (human-friendly summary) */
export async function gitDiffStat(opts: { staged?: boolean; cwd?: string } = {}): Promise<string> {
  const { staged = false, cwd = process.cwd() } = opts;
  const cmd = staged ? "git diff --cached --stat" : "git diff --stat";
  const { stdout } = await runCommand(cmd, { cwd });
  return stdout.trim();
}

/** git log (compact) */
export async function gitLogShort(n = 10, cwd: string = process.cwd()): Promise<string> {
  const fmt = `%h%x09%ad%x09%an%x09%s`;
  const cmd = `git log --date=short -n ${n} --pretty=format:"${fmt}"`;
  const { stdout } = await runCommand(cmd, { cwd });
  return stdout.trim();
}

/** Create a new branch (switch -c) */
export async function gitCreateBranch(name: string, cwd: string = process.cwd()) {
  try {
    validateBranchName(name);
    
    const { stdout, stderr, code } = await runCommand("git", { 
      cwd,
      args: ["switch", "-c", name]
    });
    
    if (code !== 0) {
      throw new ExecutionError(
        `Failed to create branch: ${stderr || stdout}`,
        `git switch -c ${name}`,
        code || undefined,
        { branchName: name, cwd }
      );
    }
    
    return { ok: true, output: (stdout || stderr).trim() };
  } catch (error) {
    const forgeError = handleError(error);
    throw new ToolError("git", forgeError.message, {
      operation: "create_branch",
      branchName: name,
      cwd,
      originalError: forgeError
    });
  }
}

/** Add all & commit with message (Conventional Commits encouraged) */
export async function gitCommit(message: string, cwd: string = process.cwd()) {
  try {
    validateCommitMessage(message);
    
    const addResult = await runCommand("git", { cwd, args: ["add", "-A"] });
    if (addResult.code !== 0) {
      throw new ExecutionError(
        `Failed to add files: ${addResult.stderr || addResult.stdout}`,
        "git add -A",
        addResult.code || undefined,
        { cwd }
      );
    }
    
    const commitResult = await runCommand("git", { 
      cwd, 
      args: ["commit", "-m", message] 
    });
    
    if (commitResult.code !== 0) {
      throw new ExecutionError(
        `Failed to commit: ${commitResult.stderr || commitResult.stdout}`,
        `git commit -m "${message}"`,
        commitResult.code || undefined,
        { commitMessage: message, cwd }
      );
    }
    
    return { ok: true, output: (commitResult.stdout || commitResult.stderr).trim() };
  } catch (error) {
    const forgeError = handleError(error);
    throw new ToolError("git", forgeError.message, {
      operation: "commit",
      commitMessage: message,
      cwd,
      originalError: forgeError
    });
  }
}
