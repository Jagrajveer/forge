/**
 * Safe patch engine with conflict resolution
 * Computes idempotent unified diffs and applies hunks with conflict markers
 */
import * as fs from "node:fs";
import * as path from "node:path";
import { diffLines, applyPatch, parsePatch, structuredPatch } from "diff";
import prompts from "prompts";
import chalk from "chalk";

export interface PatchResult {
  success: boolean;
  filePath: string;
  hunksApplied: number;
  hunksTotal: number;
  conflicts: string[];
  content?: string;
}

export interface DiffSummary {
  additions: number;
  deletions: number;
  files: string[];
}

/**
 * Read a file safely
 */
export function readFileSafe(filePath: string): string {
  const absPath = path.resolve(filePath);
  if (!fs.existsSync(absPath)) {
    throw new Error(`File not found: ${filePath}`);
  }
  return fs.readFileSync(absPath, "utf8");
}

/**
 * Write a file safely (creates directories if needed)
 */
export function writeFileSafe(filePath: string, content: string): void {
  const absPath = path.resolve(filePath);
  const dir = path.dirname(absPath);
  
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  
  fs.writeFileSync(absPath, content, "utf8");
}

/**
 * Compute unified diff between two files
 */
export function computeDiff(
  oldPath: string,
  newPath: string
): string {
  const oldContent = fs.existsSync(oldPath) ? fs.readFileSync(oldPath, "utf8") : "";
  const newContent = fs.readFileSync(newPath, "utf8");
  
  const patch = structuredPatch(
    oldPath,
    newPath,
    oldContent,
    newContent,
    undefined,
    undefined
  );
  
  return formatPatch(patch);
}

/**
 * Format structured patch as unified diff
 */
function formatPatch(patch: any): string {
  const lines: string[] = [];
  lines.push(`--- ${patch.oldFileName}`);
  lines.push(`+++ ${patch.newFileName}`);
  
  for (const hunk of patch.hunks) {
    lines.push(`@@ -${hunk.oldStart},${hunk.oldLines} +${hunk.newStart},${hunk.newLines} @@`);
    lines.push(...hunk.lines);
  }
  
  return lines.join("\n");
}

/**
 * Apply a patch to a file with conflict detection
 */
export async function applyPatchSafe(
  filePath: string,
  patchContent: string,
  options: { interactive?: boolean } = {}
): Promise<PatchResult> {
  const absPath = path.resolve(filePath);
  const originalContent = fs.existsSync(absPath) 
    ? fs.readFileSync(absPath, "utf8") 
    : "";
  
  const patches = parsePatch(patchContent);
  if (patches.length === 0) {
    throw new Error("No valid patches found");
  }
  
  const patch = patches[0];
  const result = applyPatch(originalContent, patch);
  
  if (result === false) {
    // Patch failed - try manual resolution
    if (options.interactive) {
      return await resolveConflictsInteractive(absPath, originalContent, patch);
    } else {
      return {
        success: false,
        filePath: absPath,
        hunksApplied: 0,
        hunksTotal: patch.hunks.length,
        conflicts: ["Patch failed to apply cleanly"],
      };
    }
  }
  
  return {
    success: true,
    filePath: absPath,
    hunksApplied: patch.hunks.length,
    hunksTotal: patch.hunks.length,
    conflicts: [],
    content: result as string,
  };
}

/**
 * Interactive conflict resolver
 */
async function resolveConflictsInteractive(
  filePath: string,
  originalContent: string,
  patch: any
): Promise<PatchResult> {
  console.log(chalk.yellow("\n⚠️  Patch conflicts detected. Opening interactive resolver...\n"));
  
  const conflicts: string[] = [];
  let currentContent = originalContent;
  let appliedHunks = 0;
  
  for (const hunk of patch.hunks) {
    console.log(chalk.dim(`Hunk @@ -${hunk.oldStart},${hunk.oldLines} +${hunk.newStart},${hunk.newLines} @@`));
    console.log(chalk.dim(hunk.lines.slice(0, 5).join("\n")));
    
    const { action } = await prompts({
      type: "select",
      name: "action",
      message: "How to handle this hunk?",
      choices: [
        { title: "Apply", value: "apply" },
        { title: "Skip", value: "skip" },
        { title: "Abort", value: "abort" },
      ],
    });
    
    if (action === "abort") {
      return {
        success: false,
        filePath,
        hunksApplied: appliedHunks,
        hunksTotal: patch.hunks.length,
        conflicts: ["User aborted"],
      };
    }
    
    if (action === "apply") {
      // Try to apply this single hunk
      const singleHunkPatch = {
        ...patch,
        hunks: [hunk],
      };
      const result = applyPatch(currentContent, singleHunkPatch);
      
      if (result !== false) {
        currentContent = result as string;
        appliedHunks++;
      } else {
        conflicts.push(`Hunk at line ${hunk.oldStart} failed`);
      }
    } else {
      conflicts.push(`Hunk at line ${hunk.oldStart} skipped`);
    }
  }
  
  return {
    success: appliedHunks > 0,
    filePath,
    hunksApplied: appliedHunks,
    hunksTotal: patch.hunks.length,
    conflicts,
    content: currentContent,
  };
}

/**
 * Generate diff summary for multiple files
 */
export function generateDiffSummary(files: string[]): DiffSummary {
  let additions = 0;
  let deletions = 0;
  const modifiedFiles: string[] = [];
  
  for (const file of files) {
    if (!fs.existsSync(file)) continue;
    
    const content = fs.readFileSync(file, "utf8");
    const lines = content.split("\n");
    
    for (const line of lines) {
      if (line.startsWith("+") && !line.startsWith("+++")) additions++;
      if (line.startsWith("-") && !line.startsWith("---")) deletions++;
    }
    
    modifiedFiles.push(file);
  }
  
  return { additions, deletions, files: modifiedFiles };
}

/**
 * Print a concise diff summary
 */
export function printDiffSummary(summary: DiffSummary): void {
  console.log(chalk.bold("\n📊 Diff Summary:"));
  console.log(chalk.green(`  +${summary.additions} additions`));
  console.log(chalk.red(`  -${summary.deletions} deletions`));
  console.log(chalk.dim(`  ${summary.files.length} file(s) changed`));
  
  if (summary.files.length > 0) {
    console.log(chalk.bold("\nFiles:"));
    for (const file of summary.files) {
      console.log(chalk.blue(`  • ${file}`));
    }
  }
}

/**
 * Apply patch from file or stdin
 */
export async function applyPatchFromSource(
  source: string | "stdin",
  options: { interactive?: boolean; yes?: boolean } = {}
): Promise<PatchResult[]> {
  let patchContent: string;
  
  if (source === "stdin") {
    // Read from stdin
    patchContent = await readStdin();
  } else {
    patchContent = fs.readFileSync(source, "utf8");
  }
  
  const patches = parsePatch(patchContent);
  const results: PatchResult[] = [];
  
  for (const patch of patches) {
    const filePath = patch.newFileName || patch.oldFileName || "unknown";
    
    if (!options.yes && options.interactive) {
      const { confirm } = await prompts({
        type: "confirm",
        name: "confirm",
        message: `Apply patch to ${filePath}?`,
        initial: true,
      });
      
      if (!confirm) {
        results.push({
          success: false,
          filePath,
          hunksApplied: 0,
          hunksTotal: patch.hunks.length,
          conflicts: ["User skipped"],
        });
        continue;
      }
    }
    
    const patchStr = formatPatch(patch);
    const result = await applyPatchSafe(filePath, patchStr, options);
    
    if (result.success && result.content) {
      writeFileSafe(filePath, result.content);
      console.log(chalk.green(`✔ Applied patch to ${filePath}`));
    } else {
      console.log(chalk.red(`✖ Failed to apply patch to ${filePath}`));
      if (result.conflicts.length > 0) {
        console.log(chalk.yellow(`  Conflicts: ${result.conflicts.join(", ")}`));
      }
    }
    
    results.push(result);
  }
  
  return results;
}

/**
 * Read from stdin
 */
async function readStdin(): Promise<string> {
  return new Promise((resolve) => {
    const chunks: Buffer[] = [];
    process.stdin.on("data", (chunk) => chunks.push(chunk));
    process.stdin.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
  });
}
