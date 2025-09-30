import type { TraceLevel } from "../prompts/system.js";
import { runCommand } from "../tools/run.js";
import { GrokProvider } from "../../providers/grok.js";

/**
 * Collect staged & unstaged diffs (patch text) suitable for LLM review.
 * Returns a combined string; large outputs are truncated from the middle to fit caps.
 */
export async function collectWorkingDiffs(opts: {
  cwd?: string;
  maxChars?: number; // hard cap on total diff text we pass to the model
} = {}): Promise<{ text: string; truncated: boolean }> {
  const cwd = opts.cwd ?? process.cwd();
  const cap = opts.maxChars ?? 180_000; // ~180k chars (~90-120k tokens chars ≈ conservative)

  // Plain patch diffs; --no-color ensures clean text; -U3 keeps minimal context.
  const { stdout: unstaged } = await runCommand("git diff -U3 --no-color", { cwd, stdioCapBytes: cap * 2 });
  const { stdout: staged } = await runCommand("git diff --cached -U3 --no-color", { cwd, stdioCapBytes: cap * 2 });

  const parts: string[] = [];
  if (unstaged.trim().length) {
    parts.push("## Unstaged\n```diff\n" + unstaged.trim() + "\n```");
  }
  if (staged.trim().length) {
    parts.push("## Staged\n```diff\n" + staged.trim() + "\n```");
  }

  let combined = parts.join("\n\n");
  if (!combined) {
    combined = "_No uncommitted changes detected (staged or unstaged)._";
    return { text: combined, truncated: false };
  }

  // Truncate from the middle if necessary (keep head & tail for context).
  if (combined.length > cap) {
    const head = combined.slice(0, Math.floor(cap * 0.65));
    const tail = combined.slice(-Math.floor(cap * 0.35));
    combined = `${head}\n\n…\n\n${tail}\n\n<!-- truncated diff: ${(combined.length - cap)} chars removed -->`;
    return { text: combined, truncated: true };
  }
  return { text: combined, truncated: false };
}

/**
 * Ask Grok to summarize code changes from diffs only (no commit history).
 * Returns the model’s markdown summary.
 */
export async function summarizeChangesWithModel(llm: GrokProvider, opts: {
  cwd?: string;
  trace?: TraceLevel;
  temperature?: number;
  maxChars?: number;
} = {}): Promise<string> {
  const { text: diffs, truncated } = await collectWorkingDiffs({
    cwd: opts.cwd,
    maxChars: opts.maxChars ?? 180_000,
  });

  const system = [
    "You are an expert code-review assistant.",
    "Summarize the CODE CHANGES present in the provided DIFFS.",
    "STRICT REQUIREMENTS:",
    "- Do NOT mention commit messages, commit history, or `git log`.",
    "- Base your summary ONLY on the diff content (staged + unstaged).",
    "- Keep it concise and actionable for an engineer scanning changes.",
    "- Prefer categories: Features, Fixes, Refactors, Tests, Docs, Chore.",
    "- Note any breaking changes, migrations, risky areas, or follow-ups.",
    "- Output plain Markdown. No JSON. No preface. No concluding fluff."
  ].join("\n");

  const user = [
    "### Diffs to review",
    diffs,
    truncated ? "\n\n_Note: diffs were truncated for length; summarize from what is shown._" : "",
  ].join("\n");

  const res = await llm.chat(
    [
      { role: "system", content: system },
      { role: "user", content: user },
    ],
    {
      stream: false,
      temperature: opts.temperature ?? 0.2,
      reasoning: (opts.trace ?? "plan") !== "none",
      maxTokens: 1024,
    }
  ) as { text: string };

  return (res.text ?? "").trim();
}

/**
 * Generate a comprehensive codebase summary by analyzing the project structure and key files.
 * This is different from diff summaries - it analyzes the entire codebase.
 */
export async function summarizeCodebaseWithModel(llm: GrokProvider, opts: {
  cwd?: string;
  trace?: TraceLevel;
  temperature?: number;
  maxChars?: number;
} = {}): Promise<string> {
  const cwd = opts.cwd ?? process.cwd();
  
  // Collect key information about the codebase
  const info = await collectCodebaseInfo(cwd);
  
  const system = [
    "You are an expert software architect and code reviewer.",
    "Analyze the provided codebase information and create a comprehensive summary.",
    "STRICT REQUIREMENTS:",
    "- Focus on architecture, key technologies, and main functionality",
    "- Identify the project type, framework, and primary purpose",
    "- Highlight key files, dependencies, and project structure",
    "- Note any patterns, conventions, or architectural decisions",
    "- Keep it professional and concise for senior engineers",
    "- Output structured Markdown with clear sections",
    "- Do NOT include raw file contents - only analysis and insights",
    "- Provide actionable insights about the codebase structure and design",
    "- Identify potential areas for improvement or notable architectural patterns",
    "- Focus on what makes this codebase unique or well-designed"
  ].join("\n");

  const user = [
    "### Codebase Analysis Request",
    "Please analyze this codebase and provide a comprehensive summary:",
    "",
    "**Project Structure:**",
    info.structure,
    "",
    "**Key Files:**",
    info.keyFiles,
    "",
    "**Dependencies:**",
    info.dependencies,
    "",
    "**Configuration:**",
    info.configuration,
    "",
    "Please provide a senior-level analysis of this codebase."
  ].join("\n");

  const res = await llm.chat(
    [
      { role: "system", content: system },
      { role: "user", content: user },
    ],
    {
      stream: false,
      temperature: opts.temperature ?? 0.3,
      reasoning: (opts.trace ?? "plan") !== "none",
      maxTokens: 2048,
    }
  ) as { text: string };

  return (res.text ?? "").trim();
}

/**
 * Collect key information about the codebase structure and files
 */
async function collectCodebaseInfo(cwd: string): Promise<{
  structure: string;
  keyFiles: string;
  dependencies: string;
  configuration: string;
}> {
  const { runCommand } = await import("../tools/run.js");
  
  // Get project structure - analyze and categorize files
  let structure = "Unable to determine structure";
  try {
    if (process.platform === 'win32') {
      const { stdout } = await runCommand("dir /s /b /a-d", { cwd, stdioCapBytes: 15000 });
      const files = stdout.split('\n').filter(f => f.trim());
      
      // Categorize files by type and directory
      const categorized = categorizeFiles(files);
      structure = formatFileStructure(categorized);
    } else {
      const { stdout } = await runCommand("find . -type f | head -100", { cwd, stdioCapBytes: 15000 });
      const files = stdout.split('\n').filter(f => f.trim());
      const categorized = categorizeFiles(files);
      structure = formatFileStructure(categorized);
    }
  } catch (e) {
    structure = "Error reading directory structure";
  }

  // Get key files
  let keyFiles = "Unable to determine key files";
  try {
    const keyFilePatterns = ['package.json', 'README.md', 'tsconfig.json', 'next.config.js', 'tailwind.config.js'];
    const foundFiles: string[] = [];
    
    for (const pattern of keyFilePatterns) {
      try {
        if (process.platform === 'win32') {
          const { stdout } = await runCommand(`dir /s /b ${pattern}`, { cwd, stdioCapBytes: 1000 });
          if (stdout.trim()) foundFiles.push(stdout.trim());
        } else {
          const { stdout } = await runCommand(`find . -name "${pattern}"`, { cwd, stdioCapBytes: 1000 });
          if (stdout.trim()) foundFiles.push(stdout.trim());
        }
      } catch (e) {
        // Ignore individual file errors
      }
    }
    keyFiles = foundFiles.join('\n') || "No key files found";
  } catch (e) {
    keyFiles = "Error finding key files";
  }

  // Get dependencies from package.json
  let dependencies = "Unable to read dependencies";
  try {
    const { readFile } = await import("node:fs/promises");
    const packageJson = JSON.parse(await readFile(`${cwd}/package.json`, 'utf-8'));
    const deps = {
      dependencies: packageJson.dependencies || {},
      devDependencies: packageJson.devDependencies || {},
      scripts: packageJson.scripts || {}
    };
    dependencies = JSON.stringify(deps, null, 2);
  } catch (e) {
    dependencies = "Error reading package.json";
  }

  // Get configuration files
  let configuration = "Unable to read configuration";
  try {
    const configFiles = ['tsconfig.json', 'next.config.js', 'tailwind.config.js', 'eslint.config.js'];
    const configs: string[] = [];
    
    for (const file of configFiles) {
      try {
        const { readFile } = await import("node:fs/promises");
        const content = await readFile(`${cwd}/${file}`, 'utf-8');
        configs.push(`**${file}:**\n${content.slice(0, 500)}${content.length > 500 ? '...' : ''}`);
      } catch (e) {
        // File doesn't exist or can't be read
      }
    }
    configuration = configs.join('\n\n') || "No configuration files found";
  } catch (e) {
    configuration = "Error reading configuration files";
  }

  return { structure, keyFiles, dependencies, configuration };
}

/**
 * Categorize files by type and directory structure
 */
function categorizeFiles(files: string[]): {
  sourceFiles: string[];
  configFiles: string[];
  testFiles: string[];
  docsFiles: string[];
  otherFiles: string[];
  directories: string[];
} {
  const sourceFiles: string[] = [];
  const configFiles: string[] = [];
  const testFiles: string[] = [];
  const docsFiles: string[] = [];
  const otherFiles: string[] = [];
  const directories: string[] = [];

  for (const file of files) {
    const fileName = file.toLowerCase();
    const ext = fileName.split('.').pop() || '';
    
    // Extract directory structure
    const pathParts = file.split(/[\\\/]/);
    if (pathParts.length > 1) {
      const dir = pathParts.slice(0, -1).join('/');
      if (!directories.includes(dir)) {
        directories.push(dir);
      }
    }
    
    // Categorize by file type
    if (['ts', 'tsx', 'js', 'jsx'].includes(ext)) {
      if (fileName.includes('test') || fileName.includes('spec') || fileName.includes('__tests__')) {
        testFiles.push(file);
      } else {
        sourceFiles.push(file);
      }
    } else if (['json', 'js', 'ts', 'yaml', 'yml', 'toml', 'ini'].includes(ext) && 
               (fileName.includes('config') || fileName.includes('package') || fileName.includes('tsconfig'))) {
      configFiles.push(file);
    } else if (['md', 'txt', 'rst'].includes(ext)) {
      docsFiles.push(file);
    } else {
      otherFiles.push(file);
    }
  }

  return { sourceFiles, configFiles, testFiles, docsFiles, otherFiles, directories };
}

/**
 * Format file structure in a readable way
 */
function formatFileStructure(categorized: {
  sourceFiles: string[];
  configFiles: string[];
  testFiles: string[];
  docsFiles: string[];
  otherFiles: string[];
  directories: string[];
}): string {
  const { sourceFiles, configFiles, testFiles, docsFiles, otherFiles, directories } = categorized;
  
  let result = "## Project Structure\n\n";
  
  // Show directory structure
  if (directories.length > 0) {
    result += "**Key Directories:**\n";
    const sortedDirs = directories.sort();
    for (const dir of sortedDirs.slice(0, 20)) { // Limit to first 20 directories
      result += `- ${dir}\n`;
    }
    if (directories.length > 20) {
      result += `- ... and ${directories.length - 20} more directories\n`;
    }
    result += "\n";
  }
  
  // Show file counts by category
  result += "**File Distribution:**\n";
  result += `- Source files: ${sourceFiles.length} (TypeScript/JavaScript)\n`;
  result += `- Test files: ${testFiles.length}\n`;
  result += `- Config files: ${configFiles.length}\n`;
  result += `- Documentation: ${docsFiles.length}\n`;
  result += `- Other files: ${otherFiles.length}\n\n`;
  
  // Show key source files (limit to most important)
  if (sourceFiles.length > 0) {
    result += "**Key Source Files:**\n";
    const importantFiles = sourceFiles.filter(f => 
      f.includes('app/') || f.includes('pages/') || f.includes('components/') || 
      f.includes('lib/') || f.includes('utils/') || f.includes('hooks/')
    ).slice(0, 15);
    
    for (const file of importantFiles) {
      result += `- ${file}\n`;
    }
    if (sourceFiles.length > 15) {
      result += `- ... and ${sourceFiles.length - 15} more source files\n`;
    }
  }
  
  return result;
}