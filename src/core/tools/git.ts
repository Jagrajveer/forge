import { runCommand } from "./run.js";

export async function gitStatus(cwd = process.cwd()) {
  return runCommand("git status --porcelain=v1", { cwd });
}
export async function gitDiff(cwd = process.cwd()) {
  return runCommand("git diff", { cwd });
}
export async function gitCommit(message: string, cwd = process.cwd()) {
  // add all modified/new files then commit
  await runCommand('git add -A', { cwd });
  return runCommand(`git commit -m ${JSON.stringify(message)}`, { cwd });
}
