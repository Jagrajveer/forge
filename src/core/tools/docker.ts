import { runCommand } from "./run.js";
import { ToolError, handleError } from "../errors.js";
import { Validator } from "../validation.js";

export interface DockerBuildOptions {
  tag?: string;
  file?: string;
  context?: string;
  args?: Record<string, string>;
}

export interface DockerRunOptions {
  image: string;
  name?: string;
  ports?: string[];
  volumes?: string[];
  environment?: Record<string, string>;
  detach?: boolean;
  interactive?: boolean;
  tty?: boolean;
}

export async function dockerBuild(options: DockerBuildOptions) {
  try {
    const validator = new Validator();
    validator.validateString(options.tag, "tag", { required: true });
    validator.throwIfInvalid();

    const { tag, file, context = ".", args = {} } = options;
    
    const dockerArgs = ["build"];
    if (file) dockerArgs.push("--file", file);
    if (tag) dockerArgs.push("--tag", tag);
    
    // Add build args
    for (const [key, value] of Object.entries(args)) {
      dockerArgs.push("--build-arg", `${key}=${value}`);
    }
    
    dockerArgs.push(context);

    const result = await runCommand("docker", { args: dockerArgs });
    
    if (result.code !== 0) {
      throw new Error(`Docker build failed: ${result.stderr || result.stdout}`);
    }

    return {
      ok: true,
      output: result.stdout,
      tag
    };
  } catch (error) {
    const forgeError = handleError(error);
    throw new ToolError("docker", forgeError.message, {
      operation: "build",
      options,
      originalError: forgeError
    });
  }
}

export async function dockerRun(options: DockerRunOptions) {
  try {
    const validator = new Validator();
    validator.validateString(options.image, "image", { required: true });
    validator.throwIfInvalid();

    const { image, name, ports = [], volumes = [], environment = {}, detach = false, interactive = false, tty = false } = options;
    
    const dockerArgs = ["run"];
    
    if (name) dockerArgs.push("--name", name);
    if (detach) dockerArgs.push("--detach");
    if (interactive) dockerArgs.push("--interactive");
    if (tty) dockerArgs.push("--tty");
    
    // Add port mappings
    for (const port of ports) {
      dockerArgs.push("--publish", port);
    }
    
    // Add volume mappings
    for (const volume of volumes) {
      dockerArgs.push("--volume", volume);
    }
    
    // Add environment variables
    for (const [key, value] of Object.entries(environment)) {
      dockerArgs.push("--env", `${key}=${value}`);
    }
    
    dockerArgs.push(image);

    const result = await runCommand("docker", { args: dockerArgs });
    
    return {
      ok: result.code === 0,
      output: result.stdout,
      error: result.stderr,
      exitCode: result.code,
      image
    };
  } catch (error) {
    const forgeError = handleError(error);
    throw new ToolError("docker", forgeError.message, {
      operation: "run",
      options,
      originalError: forgeError
    });
  }
}

export async function dockerPs(options: { all?: boolean } = {}) {
  try {
    const { all = false } = options;
    
    const args = ["ps"];
    if (all) args.push("--all");

    const result = await runCommand("docker", { args });
    
    return {
      ok: true,
      output: result.stdout,
      containers: result.stdout.split('\n').length - 1 // Subtract header
    };
  } catch (error) {
    const forgeError = handleError(error);
    throw new ToolError("docker", forgeError.message, {
      operation: "ps",
      options,
      originalError: forgeError
    });
  }
}

export async function dockerStop(container: string) {
  try {
    const validator = new Validator();
    validator.validateString(container, "container", { required: true });
    validator.throwIfInvalid();

    const result = await runCommand("docker", { args: ["stop", container] });
    
    return {
      ok: result.code === 0,
      output: result.stdout,
      error: result.stderr,
      container
    };
  } catch (error) {
    const forgeError = handleError(error);
    throw new ToolError("docker", forgeError.message, {
      operation: "stop",
      container,
      originalError: forgeError
    });
  }
}

export async function dockerRemove(container: string, force = false) {
  try {
    const validator = new Validator();
    validator.validateString(container, "container", { required: true });
    validator.throwIfInvalid();

    const args = ["rm"];
    if (force) args.push("--force");
    args.push(container);

    const result = await runCommand("docker", { args });
    
    return {
      ok: result.code === 0,
      output: result.stdout,
      error: result.stderr,
      container
    };
  } catch (error) {
    const forgeError = handleError(error);
    throw new ToolError("docker", forgeError.message, {
      operation: "remove",
      container,
      force,
      originalError: forgeError
    });
  }
}
