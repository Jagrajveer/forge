/**
 * Command generation and execution with PTY support
 * Proposes shell plans, asks for confirmation, and executes with live streaming
 */
import { spawn as spawnChild } from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";
import prompts from "prompts";
import chalk from "chalk";
import { chat } from "../llm/xai.js";

// PTY spawn will be loaded dynamically if available
let ptySpawn: any = null;
let ptyLoaded = false;

/**
 * Lazy load node-pty if available (runtime check, not compile-time)
 */
async function loadPTY(): Promise<void> {
  if (ptyLoaded) return;
  ptyLoaded = true;
  
  try {
    // Use Function constructor to avoid TypeScript compile-time check
    const dynamicImport = new Function('specifier', 'return import(specifier)');
    const pty = await dynamicImport("node-pty");
    ptySpawn = pty.spawn;
  } catch {
    // node-pty not available, will use child_process fallback
  }
}

export interface CommandStep {
  description: string;
  command: string;
  expected: string;
}

export interface CommandPlan {
  goal: string;
  steps: CommandStep[];
}

export interface ExecutionResult {
  step: number;
  command: string;
  exitCode: number;
  stdout: string;
  stderr: string;
  duration: number;
}

const RECIPES_FILE = path.join(process.cwd(), ".forge", "recipes.json");

/**
 * Suggest a command plan using LLM
 */
export async function suggestCommands(goal: string): Promise<CommandPlan> {
  const prompt = `You are a shell command expert. Given a goal, propose a step-by-step plan with specific shell commands.

Goal: ${goal}

Return JSON in this format:
{
  "goal": "<goal>",
  "steps": [
    {
      "description": "<what this step does>",
      "command": "<exact shell command>",
      "expected": "<what success looks like>"
    }
  ]
}

Be specific, safe, and prefer common Unix/Windows cross-platform commands.`;

  const response = await chat(
    [
      { role: "system", content: "You are a helpful shell command assistant." },
      { role: "user", content: prompt },
    ],
    { model: "grok-4-fast", temperature: 0.2, maxTokens: 1024 }
  );

  try {
    const jsonMatch = response.text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error("No JSON found in response");
    }
    
    const plan: CommandPlan = JSON.parse(jsonMatch[0]);
    return plan;
  } catch (error) {
    throw new Error(`Failed to parse command plan: ${error}`);
  }
}

/**
 * Execute command plan with confirmation and live streaming
 */
export async function executeCommands(
  plan: CommandPlan,
  options: { yes?: boolean; shell?: string } = {}
): Promise<ExecutionResult[]> {
  console.log(chalk.bold(`\n🎯 Goal: ${plan.goal}\n`));
  console.log(chalk.bold(`📋 Plan (${plan.steps.length} steps):\n`));
  
  for (let i = 0; i < plan.steps.length; i++) {
    const step = plan.steps[i];
    console.log(chalk.dim(`  ${i + 1}. ${step.description}`));
    console.log(chalk.green(`     $ ${step.command}`));
    console.log(chalk.dim(`     Expected: ${step.expected}\n`));
  }
  
  if (!options.yes) {
    const { proceed } = await prompts({
      type: "confirm",
      name: "proceed",
      message: "Execute this plan?",
      initial: false,
    });
    
    if (!proceed) {
      console.log(chalk.yellow("Aborted."));
      return [];
    }
  }
  
  const results: ExecutionResult[] = [];
  
  for (let i = 0; i < plan.steps.length; i++) {
    const step = plan.steps[i];
    
    if (!options.yes) {
      const { confirm } = await prompts({
        type: "confirm",
        name: "confirm",
        message: `Run step ${i + 1}: ${step.command}?`,
        initial: true,
      });
      
      if (!confirm) {
        console.log(chalk.yellow(`⊘ Skipped step ${i + 1}`));
        continue;
      }
    }
    
    console.log(chalk.blue(`\n▶ Step ${i + 1}: ${step.description}`));
    console.log(chalk.green(`  $ ${step.command}\n`));
    
    const result = await executeCommandPTY(step.command, options.shell);
    results.push({
      step: i + 1,
      command: step.command,
      ...result,
    });
    
    if (result.exitCode === 0) {
      console.log(chalk.green(`\n✔ Step ${i + 1} succeeded (${result.duration}ms)`));
      
      // Save successful command to recipes
      await saveRecipe({
        goal: plan.goal,
        command: step.command,
        timestamp: Date.now(),
      });
    } else {
      console.log(chalk.red(`\n✖ Step ${i + 1} failed (exit code ${result.exitCode})`));
      
      const { continueOnError } = await prompts({
        type: "confirm",
        name: "continueOnError",
        message: "Continue with remaining steps?",
        initial: false,
      });
      
      if (!continueOnError) {
        break;
      }
    }
  }
  
  return results;
}

/**
 * Execute a single command with live streaming (PTY if available, child_process fallback)
 */
async function executeCommandPTY(
  command: string,
  shell?: string
): Promise<{ exitCode: number; stdout: string; stderr: string; duration: number }> {
  // Try to load PTY first
  await loadPTY();
  
  // Use PTY if available for better interactivity
  if (ptySpawn) {
    return executeWithPTY(command, shell);
  }
  
  // Fallback to child_process
  return executeWithChildProcess(command, shell);
}

/**
 * Execute with node-pty (requires native compilation)
 */
function executeWithPTY(
  command: string,
  shell?: string
): Promise<{ exitCode: number; stdout: string; stderr: string; duration: number }> {
  return new Promise((resolve) => {
    const startTime = Date.now();
    let stdout = "";
    let stderr = "";
    
    const defaultShell = process.platform === "win32" ? "powershell.exe" : "/bin/bash";
    const ptyProcess = ptySpawn(shell || defaultShell, [], {
      name: "xterm-color",
      cols: 80,
      rows: 30,
      cwd: process.cwd(),
      env: process.env as any,
    });
    
    ptyProcess.onData((data: string) => {
      process.stdout.write(data);
      stdout += data;
    });
    
    ptyProcess.onExit(({ exitCode }: { exitCode: number }) => {
      const duration = Date.now() - startTime;
      resolve({
        exitCode: exitCode || 0,
        stdout,
        stderr,
        duration,
      });
    });
    
    // Write command and press Enter
    ptyProcess.write(command + "\r");
    
    // Wait a moment then send exit
    setTimeout(() => {
      ptyProcess.write("exit\r");
    }, 100);
  });
}

/**
 * Execute with child_process (fallback, no PTY)
 */
function executeWithChildProcess(
  command: string,
  shell?: string
): Promise<{ exitCode: number; stdout: string; stderr: string; duration: number }> {
  return new Promise((resolve) => {
    const startTime = Date.now();
    let stdout = "";
    let stderr = "";
    
    const defaultShell = process.platform === "win32" ? "powershell.exe" : "/bin/bash";
    const shellCmd = shell || defaultShell;
    const shellArgs = process.platform === "win32" ? ["-Command", command] : ["-c", command];
    
    const proc = spawnChild(shellCmd, shellArgs, {
      cwd: process.cwd(),
      env: process.env,
      stdio: ["ignore", "pipe", "pipe"],
    });
    
    proc.stdout?.on("data", (data: Buffer) => {
      const text = data.toString();
      process.stdout.write(text);
      stdout += text;
    });
    
    proc.stderr?.on("data", (data: Buffer) => {
      const text = data.toString();
      process.stderr.write(text);
      stderr += text;
    });
    
    proc.on("close", (exitCode: number | null) => {
      const duration = Date.now() - startTime;
      resolve({
        exitCode: exitCode || 0,
        stdout,
        stderr,
        duration,
      });
    });
  });
}

/**
 * Save successful command snippet to recipes
 */
async function saveRecipe(recipe: {
  goal: string;
  command: string;
  timestamp: number;
}): Promise<void> {
  const dir = path.dirname(RECIPES_FILE);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  
  let recipes: any[] = [];
  if (fs.existsSync(RECIPES_FILE)) {
    try {
      recipes = JSON.parse(fs.readFileSync(RECIPES_FILE, "utf8"));
    } catch {}
  }
  
  recipes.push(recipe);
  
  // Keep last 100 recipes
  if (recipes.length > 100) {
    recipes = recipes.slice(-100);
  }
  
  fs.writeFileSync(RECIPES_FILE, JSON.stringify(recipes, null, 2));
}

/**
 * Load command history
 */
export function loadRecipes(): any[] {
  if (!fs.existsSync(RECIPES_FILE)) {
    return [];
  }
  
  try {
    return JSON.parse(fs.readFileSync(RECIPES_FILE, "utf8"));
  } catch {
    return [];
  }
}

/**
 * Print command history
 */
export function printHistory(): void {
  const recipes = loadRecipes();
  
  if (recipes.length === 0) {
    console.log(chalk.dim("No command history yet."));
    return;
  }
  
  console.log(chalk.bold(`\n📜 Command History (last ${recipes.length}):\n`));
  
  for (const recipe of recipes.slice(-20)) {
    const date = new Date(recipe.timestamp).toLocaleString();
    console.log(chalk.dim(`  [${date}]`));
    console.log(chalk.blue(`  Goal: ${recipe.goal}`));
    console.log(chalk.green(`  $ ${recipe.command}\n`));
  }
}
