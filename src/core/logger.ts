import pino from "pino";

export type LogLevel = "trace" | "debug" | "info" | "warn" | "error" | "fatal";

export interface LoggerConfig {
  level?: LogLevel;
  pretty?: boolean;
  destination?: string;
}

class Logger {
  private pino: pino.Logger;
  private context: Record<string, unknown> = {};

  constructor(config: LoggerConfig = {}) {
    const { level = "info", pretty = false, destination } = config;

    const pinoConfig: pino.LoggerOptions = {
      level
    };

    // Add pretty transport if pretty is true
    if (pretty) {
      pinoConfig.transport = {
        target: "pino-pretty",
        options: {
          colorize: true,
          translateTime: "SYS:standard",
          ignore: "pid,hostname"
        }
      };
    }

    this.pino = destination 
      ? pino(pinoConfig, pino.destination(destination))
      : pino(pinoConfig);
  }

  setContext(context: Record<string, unknown>): void {
    this.context = { ...this.context, ...context };
  }

  clearContext(): void {
    this.context = {};
  }

  private mergeContext(extra?: Record<string, unknown>): Record<string, unknown> {
    return { ...this.context, ...extra };
  }

  trace(message: string, extra?: Record<string, unknown>): void {
    this.pino.trace(this.mergeContext(extra), message);
  }

  debug(message: string, extra?: Record<string, unknown>): void {
    this.pino.debug(this.mergeContext(extra), message);
  }

  info(message: string, extra?: Record<string, unknown>): void {
    this.pino.info(this.mergeContext(extra), message);
  }

  warn(message: string, extra?: Record<string, unknown>): void {
    this.pino.warn(this.mergeContext(extra), message);
  }

  error(message: string, extra?: Record<string, unknown>): void {
    this.pino.error(this.mergeContext(extra), message);
  }

  fatal(message: string, extra?: Record<string, unknown>): void {
    this.pino.fatal(this.mergeContext(extra), message);
  }

  // Convenience methods for common patterns
  logToolExecution(tool: string, args: any, result?: any, error?: any): void {
    this.info(`Tool execution: ${tool}`, {
      tool,
      args,
      result,
      error: error ? { message: error.message, code: error.code } : undefined
    });
  }

  logUserInput(input: string): void {
    this.info("User input", { input: input.slice(0, 200) + (input.length > 200 ? "..." : "") });
  }

  logAssistantResponse(response: string, actions?: any[]): void {
    this.info("Assistant response", { 
      response: response.slice(0, 200) + (response.length > 200 ? "..." : ""),
      actions: actions?.length || 0
    });
  }

  logError(error: Error, context?: Record<string, unknown>): void {
    this.error("Error occurred", {
      error: {
        message: error.message,
        name: error.name,
        stack: error.stack
      },
      ...context
    });
  }

  logPerformance(operation: string, duration: number, extra?: Record<string, unknown>): void {
    this.info(`Performance: ${operation}`, {
      operation,
      duration,
      ...extra
    });
  }
}

// Global logger instance
let globalLogger: Logger | null = null;

export function createLogger(config?: LoggerConfig): Logger {
  return new Logger(config);
}

export function getLogger(): Logger {
  if (!globalLogger) {
    globalLogger = createLogger({
      level: (process.env.LOG_LEVEL as LogLevel) || "info",
      pretty: process.env.NODE_ENV !== "production"
    });
  }
  return globalLogger;
}

export function setLogLevel(level: LogLevel): void {
  if (globalLogger) {
    globalLogger = createLogger({
      level,
      pretty: process.env.NODE_ENV !== "production"
    });
  } else {
    process.env.LOG_LEVEL = level;
  }
}

export function setGlobalLogger(logger: Logger): void {
  globalLogger = logger;
}

// Convenience functions that use the global logger
export const log = {
  trace: (message: string, extra?: Record<string, unknown>) => getLogger().trace(message, extra),
  debug: (message: string, extra?: Record<string, unknown>) => getLogger().debug(message, extra),
  info: (message: string, extra?: Record<string, unknown>) => getLogger().info(message, extra),
  warn: (message: string, extra?: Record<string, unknown>) => getLogger().warn(message, extra),
  error: (message: string, extra?: Record<string, unknown>) => getLogger().error(message, extra),
  fatal: (message: string, extra?: Record<string, unknown>) => getLogger().fatal(message, extra),
  
  tool: (tool: string, args: any, result?: any, error?: any) => getLogger().logToolExecution(tool, args, result, error),
  user: (input: string) => getLogger().logUserInput(input),
  assistant: (response: string, actions?: any[]) => getLogger().logAssistantResponse(response, actions),
  performance: (operation: string, duration: number, extra?: Record<string, unknown>) => getLogger().logPerformance(operation, duration, extra)
};
