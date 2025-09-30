export class ForgeError extends Error {
  constructor(
    message: string,
    public code: string,
    public context?: Record<string, unknown>
  ) {
    super(message);
    this.name = "ForgeError";
  }
}

export class ToolError extends ForgeError {
  constructor(
    tool: string,
    message: string,
    context?: Record<string, unknown>
  ) {
    super(message, `TOOL_${tool.toUpperCase()}_ERROR`, { tool, ...context });
    this.name = "ToolError";
  }
}

export class ValidationError extends ForgeError {
  constructor(
    message: string,
    field?: string,
    context?: Record<string, unknown>
  ) {
    super(message, "VALIDATION_ERROR", { field, ...context });
    this.name = "ValidationError";
  }
}

export class NetworkError extends ForgeError {
  constructor(
    message: string,
    statusCode?: number,
    context?: Record<string, unknown>
  ) {
    super(message, "NETWORK_ERROR", { statusCode, ...context });
    this.name = "NetworkError";
  }
}

export class ConfigurationError extends ForgeError {
  constructor(
    message: string,
    configKey?: string,
    context?: Record<string, unknown>
  ) {
    super(message, "CONFIGURATION_ERROR", { configKey, ...context });
    this.name = "ConfigurationError";
  }
}

export class ExecutionError extends ForgeError {
  constructor(
    message: string,
    command?: string,
    exitCode?: number,
    context?: Record<string, unknown>
  ) {
    super(message, "EXECUTION_ERROR", { command, exitCode, ...context });
    this.name = "ExecutionError";
  }
}

// Error handling utilities
export function handleError(error: unknown): ForgeError {
  if (error instanceof ForgeError) {
    return error;
  }

  if (error instanceof Error) {
    // Check for common error patterns
    if (error.message.includes("ENOENT")) {
      return new ForgeError(
        `File or directory not found: ${error.message}`,
        "FILE_NOT_FOUND",
        { originalError: error.message }
      );
    }

    if (error.message.includes("EACCES")) {
      return new ForgeError(
        `Permission denied: ${error.message}`,
        "PERMISSION_DENIED",
        { originalError: error.message }
      );
    }

    if (error.message.includes("ECONNREFUSED")) {
      return new NetworkError(
        `Connection refused: ${error.message}`,
        undefined,
        { originalError: error.message }
      );
    }

    if (error.message.toLowerCase().includes("timeout") || error.message.toLowerCase().includes("timed out")) {
      return new ExecutionError(
        `Operation timed out: ${error.message}`,
        undefined,
        undefined,
        { originalError: error.message }
      );
    }

    // Generic error wrapper
    return new ForgeError(
      error.message,
      "UNKNOWN_ERROR",
      { originalError: error.message, stack: error.stack }
    );
  }

  // Non-Error objects
  return new ForgeError(
    `Unknown error: ${String(error)}`,
    "UNKNOWN_ERROR",
    { originalError: error }
  );
}

export function isRetryableError(error: ForgeError): boolean {
  // Check for specific retryable conditions first
  if (error.code === "NETWORK_ERROR" && error.context?.statusCode) {
    const statusCode = error.context.statusCode as number;
    return statusCode >= 500 || statusCode === 429; // Server errors or rate limiting
  }

  if (error.code === "EXECUTION_ERROR") {
    return error.message.toLowerCase().includes("timeout") || error.message.toLowerCase().includes("timed out");
  }

  // Check general retryable codes
  const retryableCodes = [
    "NETWORK_ERROR",
    "EXECUTION_ERROR", // if it's a timeout
  ];

  if (retryableCodes.includes(error.code)) {
    return true;
  }

  return false;
}

export function getErrorDisplayMessage(error: ForgeError): string {
  const context = error.context || {};
  
  switch (error.code) {
    case "VALIDATION_ERROR":
      return `Validation failed: ${error.message}`;
    
    case "TOOL_OPEN_FILE_ERROR":
      return `Failed to open file: ${error.message}`;
    
    case "TOOL_WRITE_FILE_ERROR":
      return `Failed to write file: ${error.message}`;
    
    case "TOOL_GIT_ERROR":
      return `Git operation failed: ${error.message}`;
    
    case "TOOL_RUN_ERROR":
      return `Command execution failed: ${error.message}`;
    
    case "NETWORK_ERROR":
      const statusCode = context.statusCode as number;
      return `Network error${statusCode ? ` (${statusCode})` : ""}: ${error.message}`;
    
    case "CONFIGURATION_ERROR":
      return `Configuration error: ${error.message}`;
    
    case "EXECUTION_ERROR":
      const command = context.command as string;
      const exitCode = context.exitCode as number;
      return `Execution failed${command ? ` (${command})` : ""}${exitCode ? ` [exit code: ${exitCode}]` : ""}: ${error.message}`;
    
    default:
      return error.message;
  }
}

export function logError(error: ForgeError, logger?: (message: string) => void): void {
  const logFn = logger || console.error;
  
  logFn(`[${error.code}] ${getErrorDisplayMessage(error)}`);
  
  if (error.context && Object.keys(error.context).length > 0) {
    logFn("Context:", error.context);
  }
  
  if (error.stack) {
    logFn("Stack trace:", error.stack);
  }
}
