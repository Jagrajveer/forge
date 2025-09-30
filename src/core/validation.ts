import * as path from "node:path";

export class ValidationError extends Error {
  constructor(message: string, public field?: string) {
    super(message);
    this.name = "ValidationError";
  }
}

export interface ValidationResult {
  valid: boolean;
  errors: string[];
}

export class Validator {
  private errors: string[] = [];

  addError(message: string, field?: string): this {
    this.errors.push(field ? `${field}: ${message}` : message);
    return this;
  }

  validateString(value: unknown, field: string, options: {
    required?: boolean;
    minLength?: number;
    maxLength?: number;
    pattern?: RegExp;
    patternMessage?: string;
  } = {}): this {
    const { required = false, minLength, maxLength, pattern, patternMessage } = options;

    if (required && (!value || typeof value !== "string" || value.trim().length === 0)) {
      this.addError("is required", field);
      return this;
    }

    if (value !== undefined && value !== null) {
      if (typeof value !== "string") {
        this.addError("must be a string", field);
        return this;
      }

      if (minLength !== undefined && value.length < minLength) {
        this.addError(`must be at least ${minLength} characters long`, field);
      }

      if (maxLength !== undefined && value.length > maxLength) {
        this.addError(`must be at most ${maxLength} characters long`, field);
      }

      if (pattern && !pattern.test(value)) {
        this.addError(patternMessage || `must match pattern ${pattern}`, field);
      }
    }

    return this;
  }

  validateNumber(value: unknown, field: string, options: {
    required?: boolean;
    min?: number;
    max?: number;
    integer?: boolean;
  } = {}): this {
    const { required = false, min, max, integer = false } = options;

    if (required && (value === undefined || value === null)) {
      this.addError("is required", field);
      return this;
    }

    if (value !== undefined && value !== null) {
      const num = Number(value);
      if (isNaN(num)) {
        this.addError("must be a valid number", field);
        return this;
      }

      if (integer && !Number.isInteger(num)) {
        this.addError("must be an integer", field);
      }

      if (min !== undefined && num < min) {
        this.addError(`must be at least ${min}`, field);
      }

      if (max !== undefined && num > max) {
        this.addError(`must be at most ${max}`, field);
      }
    }

    return this;
  }

  validatePath(value: unknown, field: string, options: {
    required?: boolean;
    mustExist?: boolean;
    mustBeFile?: boolean;
    mustBeDirectory?: boolean;
    maxLength?: number;
  } = {}): this {
    const { required = false, mustExist = false, mustBeFile = false, mustBeDirectory = false, maxLength = 4096 } = options;

    this.validateString(value, field, { required, maxLength });

    if (this.errors.length === 0 && value) {
      const pathStr = value as string;
      
      // Check for path traversal attempts
      if (pathStr.includes("..") || pathStr.includes("~")) {
        this.addError("contains invalid path characters", field);
        return this;
      }

      // Check if path is absolute when it shouldn't be
      if (path.isAbsolute(pathStr) && !mustExist) {
        this.addError("must be a relative path", field);
        return this;
      }
    }

    return this;
  }

  validateArray(value: unknown, field: string, options: {
    required?: boolean;
    minLength?: number;
    maxLength?: number;
    itemValidator?: (item: unknown, index: number) => void;
  } = {}): this {
    const { required = false, minLength, maxLength, itemValidator } = options;

    if (required && (!Array.isArray(value) || value.length === 0)) {
      this.addError("is required and must not be empty", field);
      return this;
    }

    if (value !== undefined && value !== null) {
      if (!Array.isArray(value)) {
        this.addError("must be an array", field);
        return this;
      }

      if (minLength !== undefined && value.length < minLength) {
        this.addError(`must have at least ${minLength} items`, field);
      }

      if (maxLength !== undefined && value.length > maxLength) {
        this.addError(`must have at most ${maxLength} items`, field);
      }

      if (itemValidator) {
        value.forEach((item, index) => {
          try {
            itemValidator(item, index);
          } catch (error) {
            this.addError(`item ${index}: ${error instanceof Error ? error.message : String(error)}`, field);
          }
        });
      }
    }

    return this;
  }

  getResult(): ValidationResult {
    return {
      valid: this.errors.length === 0,
      errors: [...this.errors]
    };
  }

  throwIfInvalid(): void {
    const result = this.getResult();
    if (!result.valid) {
      throw new ValidationError(result.errors.join("; "));
    }
  }
}

// Common validation patterns
export const Patterns = {
  branchName: /^[a-zA-Z0-9._/-]+$/,
  fileName: /^[a-zA-Z0-9._-]+$/,
  // Allow printable ASCII plus CR/LF for multiline messages. Disallow other control chars (incl. TAB)
  commitMessage: /^[\x20-\x7E\r\n]+$/,
  apiKey: /^[a-zA-Z0-9_-]+$/,
  url: /^https?:\/\/.+/,
} as const;

// Convenience functions
export function validateBranchName(name: string): void {
  const validator = new Validator();
  validator.validateString(name, "branchName", {
    required: true,
    minLength: 1,
    maxLength: 250,
    pattern: Patterns.branchName,
    patternMessage: "must contain only alphanumeric characters, dots, underscores, slashes, and hyphens"
  });
  validator.throwIfInvalid();
}

export function validateFilePath(filePath: string): void {
  const validator = new Validator();
  validator.validatePath(filePath, "filePath", {
    required: true,
    maxLength: 4096
  });
  validator.throwIfInvalid();
}

export function validateCommitMessage(message: string): void {
  const validator = new Validator();
  validator.validateString(message, "commitMessage", {
    required: true,
    minLength: 1,
    maxLength: 1000,
    pattern: Patterns.commitMessage,
    patternMessage: "must not contain control characters"
  });
  validator.throwIfInvalid();
}

export function validateApiKey(key: string): void {
  const validator = new Validator();
  validator.validateString(key, "apiKey", {
    required: true,
    minLength: 10,
    maxLength: 200,
    pattern: Patterns.apiKey,
    patternMessage: "must contain only alphanumeric characters, underscores, and hyphens"
  });
  validator.throwIfInvalid();
}
