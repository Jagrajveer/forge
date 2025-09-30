import { runCommand } from "./run.js";
import { ToolError, handleError } from "../errors.js";
import { Validator } from "../validation.js";

export interface NpmInstallOptions {
  dev?: boolean;
  global?: boolean;
  packageManager?: "npm" | "yarn" | "pnpm";
}

export interface NpmScriptOptions {
  packageManager?: "npm" | "yarn" | "pnpm";
  args?: string[];
}

export async function npmInstall(packages: string[], options: NpmInstallOptions = {}) {
  try {
    const validator = new Validator();
    validator.validateArray(packages, "packages", { required: true, minLength: 1 });
    validator.throwIfInvalid();

    const { dev = false, global = false, packageManager = "npm" } = options;
    
    const args: string[] = ["install"];
    if (dev) args.push("--save-dev");
    if (global) args.push("--global");
    args.push(...packages);

    const result = await runCommand(packageManager, { args });
    
    if (result.code !== 0) {
      throw new Error(`Package installation failed: ${result.stderr || result.stdout}`);
    }

    return {
      ok: true,
      output: result.stdout,
      packages: packages.length
    };
  } catch (error) {
    const forgeError = handleError(error);
    throw new ToolError("npm", forgeError.message, {
      operation: "install",
      packages,
      options,
      originalError: forgeError
    });
  }
}

export async function npmRunScript(script: string, options: NpmScriptOptions = {}) {
  try {
    const validator = new Validator();
    validator.validateString(script, "script", { required: true, minLength: 1 });
    validator.throwIfInvalid();

    const { packageManager = "npm", args = [] } = options;
    
    const runArgs = ["run", script, ...args];
    const result = await runCommand(packageManager, { args: runArgs });
    
    if (result.code !== 0) {
      throw new Error(`Script execution failed: ${result.stderr || result.stdout}`);
    }

    return {
      ok: true,
      output: result.stdout,
      script,
      exitCode: result.code
    };
  } catch (error) {
    const forgeError = handleError(error);
    throw new ToolError("npm", forgeError.message, {
      operation: "run_script",
      script,
      options,
      originalError: forgeError
    });
  }
}

export async function npmList(options: { global?: boolean; depth?: number } = {}) {
  try {
    const { global = false, depth = 0 } = options;
    
    const args = ["list"];
    if (global) args.push("--global");
    if (depth > 0) args.push(`--depth=${depth}`);

    const result = await runCommand("npm", { args });
    
    return {
      ok: true,
      output: result.stdout,
      global
    };
  } catch (error) {
    const forgeError = handleError(error);
    throw new ToolError("npm", forgeError.message, {
      operation: "list",
      options,
      originalError: forgeError
    });
  }
}

export async function npmOutdated() {
  try {
    const result = await runCommand("npm", { args: ["outdated"] });
    
    return {
      ok: true,
      output: result.stdout,
      hasOutdated: result.code === 0
    };
  } catch (error) {
    const forgeError = handleError(error);
    throw new ToolError("npm", forgeError.message, {
      operation: "outdated",
      originalError: forgeError
    });
  }
}
