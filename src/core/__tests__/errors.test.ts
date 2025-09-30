import { describe, it, expect } from "vitest";
import { 
  ForgeError, 
  ToolError, 
  ValidationError, 
  NetworkError, 
  ConfigurationError, 
  ExecutionError,
  handleError,
  isRetryableError,
  getErrorDisplayMessage
} from "../errors.js";

describe("Error Classes", () => {
  it("should create ForgeError with proper properties", () => {
    const error = new ForgeError("Test message", "TEST_ERROR", { key: "value" });
    expect(error.message).toBe("Test message");
    expect(error.code).toBe("TEST_ERROR");
    expect(error.context).toEqual({ key: "value" });
    expect(error.name).toBe("ForgeError");
  });

  it("should create ToolError with tool context", () => {
    const error = new ToolError("git", "Operation failed", { operation: "commit" });
    expect(error.message).toBe("Operation failed");
    expect(error.code).toBe("TOOL_GIT_ERROR");
    expect(error.context?.tool).toBe("git");
    expect(error.context?.operation).toBe("commit");
  });

  it("should create ValidationError with field context", () => {
    const error = new ValidationError("Invalid input", "fieldName", { value: "test" });
    expect(error.message).toBe("Invalid input");
    expect(error.code).toBe("VALIDATION_ERROR");
    expect(error.context?.field).toBe("fieldName");
  });

  it("should create NetworkError with status code", () => {
    const error = new NetworkError("Connection failed", 500, { url: "https://api.example.com" });
    expect(error.message).toBe("Connection failed");
    expect(error.code).toBe("NETWORK_ERROR");
    expect(error.context?.statusCode).toBe(500);
  });

  it("should create ConfigurationError with config key", () => {
    const error = new ConfigurationError("Invalid config", "apiKey", { file: "config.json" });
    expect(error.message).toBe("Invalid config");
    expect(error.code).toBe("CONFIGURATION_ERROR");
    expect(error.context?.configKey).toBe("apiKey");
  });

  it("should create ExecutionError with command and exit code", () => {
    const error = new ExecutionError("Command failed", "git commit", 1, { cwd: "/tmp" });
    expect(error.message).toBe("Command failed");
    expect(error.code).toBe("EXECUTION_ERROR");
    expect(error.context?.command).toBe("git commit");
    expect(error.context?.exitCode).toBe(1);
  });
});

describe("handleError", () => {
  it("should wrap Error objects", () => {
    const originalError = new Error("Original error");
    const wrapped = handleError(originalError);
    expect(wrapped).toBeInstanceOf(ForgeError);
    expect(wrapped.message).toBe("Original error");
    expect(wrapped.context?.originalError).toBe("Original error");
  });

  it("should detect file not found errors", () => {
    const error = new Error("ENOENT: no such file or directory");
    const wrapped = handleError(error);
    expect(wrapped.code).toBe("FILE_NOT_FOUND");
  });

  it("should detect permission denied errors", () => {
    const error = new Error("EACCES: permission denied");
    const wrapped = handleError(error);
    expect(wrapped.code).toBe("PERMISSION_DENIED");
  });

  it("should detect connection refused errors", () => {
    const error = new Error("ECONNREFUSED: connection refused");
    const wrapped = handleError(error);
    expect(wrapped).toBeInstanceOf(NetworkError);
  });

  it("should detect timeout errors", () => {
    const error = new Error("Operation timed out");
    const wrapped = handleError(error);
    expect(wrapped).toBeInstanceOf(ExecutionError);
  });

  it("should handle non-Error objects", () => {
    const wrapped = handleError("String error");
    expect(wrapped).toBeInstanceOf(ForgeError);
    expect(wrapped.message).toBe("Unknown error: String error");
  });

  it("should preserve ForgeError instances", () => {
    const original = new ForgeError("Test", "TEST");
    const wrapped = handleError(original);
    expect(wrapped).toBe(original);
  });
});

describe("isRetryableError", () => {
  it("should identify retryable network errors", () => {
    const error = new NetworkError("Server error", 500);
    expect(isRetryableError(error)).toBe(true);
  });

  it("should identify retryable rate limit errors", () => {
    const error = new NetworkError("Rate limited", 429);
    expect(isRetryableError(error)).toBe(true);
  });

  it("should identify retryable timeout errors", () => {
    const error = new ExecutionError("Operation timed out", "git push");
    expect(isRetryableError(error)).toBe(true);
  });

  it("should not identify non-retryable errors", () => {
    const error = new ValidationError("Invalid input");
    expect(isRetryableError(error)).toBe(false);
  });

  it("should not identify client errors as retryable", () => {
    const error = new NetworkError("Not found", 404);
    expect(isRetryableError(error)).toBe(false);
  });
});

describe("getErrorDisplayMessage", () => {
  it("should format validation errors", () => {
    const error = new ValidationError("Invalid input", "fieldName");
    const message = getErrorDisplayMessage(error);
    expect(message).toBe("Validation failed: Invalid input");
  });

  it("should format tool errors", () => {
    const error = new ToolError("git", "Operation failed");
    const message = getErrorDisplayMessage(error);
    expect(message).toBe("Git operation failed: Operation failed");
  });

  it("should format network errors with status code", () => {
    const error = new NetworkError("Server error", 500);
    const message = getErrorDisplayMessage(error);
    expect(message).toBe("Network error (500): Server error");
  });

  it("should format execution errors with command", () => {
    const error = new ExecutionError("Command failed", "git commit", 1);
    const message = getErrorDisplayMessage(error);
    expect(message).toBe("Execution failed (git commit) [exit code: 1]: Command failed");
  });

  it("should return message for unknown errors", () => {
    const error = new ForgeError("Unknown error", "UNKNOWN");
    const message = getErrorDisplayMessage(error);
    expect(message).toBe("Unknown error");
  });
});