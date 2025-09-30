import { describe, it, expect } from "vitest";
import { Validator, validateBranchName, validateFilePath, validateCommitMessage, validateApiKey, Patterns } from "../validation.js";

describe("Validator", () => {
  it("should validate strings correctly", () => {
    const validator = new Validator();
    validator.validateString("test", "field", { required: true, minLength: 2, maxLength: 10 });
    expect(validator.getResult().valid).toBe(true);
  });

  it("should catch validation errors", () => {
    const validator = new Validator();
    validator.validateString("", "field", { required: true });
    const result = validator.getResult();
    expect(result.valid).toBe(false);
    expect(result.errors).toContain("field: is required");
  });

  it("should validate numbers correctly", () => {
    const validator = new Validator();
    validator.validateNumber(5, "field", { min: 1, max: 10, integer: true });
    expect(validator.getResult().valid).toBe(true);
  });

  it("should validate paths correctly", () => {
    const validator = new Validator();
    validator.validatePath("test/file.txt", "field", { required: true });
    expect(validator.getResult().valid).toBe(true);
  });

  it("should reject path traversal attempts", () => {
    const validator = new Validator();
    validator.validatePath("../secret.txt", "field", { required: true });
    const result = validator.getResult();
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes("invalid path characters"))).toBe(true);
  });
});

describe("validateBranchName", () => {
  it("should accept valid branch names", () => {
    expect(() => validateBranchName("feature/new-feature")).not.toThrow();
    expect(() => validateBranchName("bugfix-123")).not.toThrow();
    expect(() => validateBranchName("release/v1.0.0")).not.toThrow();
  });

  it("should reject invalid branch names", () => {
    expect(() => validateBranchName("")).toThrow();
    expect(() => validateBranchName("feature with spaces")).toThrow();
    expect(() => validateBranchName("feature@special")).toThrow();
    expect(() => validateBranchName("a".repeat(251))).toThrow();
  });
});

describe("validateFilePath", () => {
  it("should accept valid file paths", () => {
    expect(() => validateFilePath("src/file.ts")).not.toThrow();
    expect(() => validateFilePath("test/file.test.js")).not.toThrow();
  });

  it("should reject invalid file paths", () => {
    expect(() => validateFilePath("")).toThrow();
    expect(() => validateFilePath("../secret.txt")).toThrow();
    expect(() => validateFilePath("~/home/file.txt")).toThrow();
  });
});

describe("validateCommitMessage", () => {
  it("should accept valid commit messages", () => {
    expect(() => validateCommitMessage("feat: add new feature")).not.toThrow();
    expect(() => validateCommitMessage("fix: resolve bug")).not.toThrow();
  });

  it("should reject invalid commit messages", () => {
    expect(() => validateCommitMessage("")).toThrow();
    expect(() => validateCommitMessage("a".repeat(1001))).toThrow();
    expect(() => validateCommitMessage("message with\0null")).toThrow();
  });
});

describe("validateApiKey", () => {
  it("should accept valid API keys", () => {
    expect(() => validateApiKey("sk-1234567890abcdef")).not.toThrow();
    expect(() => validateApiKey("api_key_123")).not.toThrow();
  });

  it("should reject invalid API keys", () => {
    expect(() => validateApiKey("")).toThrow();
    expect(() => validateApiKey("short")).toThrow();
    expect(() => validateApiKey("key with spaces")).toThrow();
    expect(() => validateApiKey("key@special")).toThrow();
  });
});

describe("Patterns", () => {
  it("should match valid patterns", () => {
    expect(Patterns.branchName.test("feature/new-feature")).toBe(true);
    expect(Patterns.fileName.test("file.txt")).toBe(true);
    expect(Patterns.commitMessage.test("feat: add feature")).toBe(true);
    expect(Patterns.apiKey.test("sk-1234567890")).toBe(true);
    expect(Patterns.url.test("https://api.example.com")).toBe(true);
  });

  it("should reject invalid patterns", () => {
    expect(Patterns.branchName.test("feature with spaces")).toBe(false);
    expect(Patterns.fileName.test("file with spaces.txt")).toBe(false);
    expect(Patterns.commitMessage.test("message\0with\0null")).toBe(false);
    expect(Patterns.apiKey.test("key with spaces")).toBe(false);
    expect(Patterns.url.test("not-a-url")).toBe(false);
  });
});