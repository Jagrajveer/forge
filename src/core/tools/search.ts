import * as fs from "node:fs/promises";
import * as path from "node:path";
import { ToolError, handleError } from "../errors.js";
import { Validator } from "../validation.js";

export interface SearchOptions {
  pattern: string;
  directory?: string;
  filePattern?: string;
  caseSensitive?: boolean;
  wholeWord?: boolean;
  maxResults?: number;
}

export interface SearchResult {
  file: string;
  line: number;
  column: number;
  content: string;
  match: string;
}

export async function searchInFiles(options: SearchOptions): Promise<SearchResult[]> {
  try {
    const validator = new Validator();
    validator.validateString(options.pattern, "pattern", { required: true, minLength: 1 });
    validator.validateString(options.directory, "directory", { maxLength: 4096 });
    validator.validateString(options.filePattern, "filePattern", { maxLength: 100 });
    validator.validateNumber(options.maxResults, "maxResults", { min: 1, max: 10000 });
    validator.throwIfInvalid();

    const {
      pattern,
      directory = process.cwd(),
      filePattern = "**/*",
      caseSensitive = false,
      wholeWord = false,
      maxResults = 1000
    } = options;

    const results: SearchResult[] = [];
    const searchDir = path.resolve(directory);
    
    // Build regex pattern
    let regexPattern = pattern;
    if (wholeWord) {
      regexPattern = `\\b${regexPattern}\\b`;
    }
    
    const flags = caseSensitive ? "g" : "gi";
    const regex = new RegExp(regexPattern, flags);

    // Simple file pattern matching
    const filePatternRegex = new RegExp(
      filePattern.replace(/\*\*/g, ".*").replace(/\*/g, "[^/]*"),
      "i"
    );

    await searchDirectory(searchDir, regex, filePatternRegex, results, maxResults);

    return results.slice(0, maxResults);
  } catch (error) {
    const forgeError = handleError(error);
    throw new ToolError("search", forgeError.message, {
      operation: "search_in_files",
      options,
      originalError: forgeError
    });
  }
}

async function searchDirectory(
  dir: string,
  regex: RegExp,
  filePattern: RegExp,
  results: SearchResult[],
  maxResults: number
): Promise<void> {
  if (results.length >= maxResults) return;

  try {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    
    for (const entry of entries) {
      if (results.length >= maxResults) break;
      
      const fullPath = path.join(dir, entry.name);
      
      if (entry.isDirectory()) {
        // Skip common directories that shouldn't be searched
        if (shouldSkipDirectory(entry.name)) continue;
        
        await searchDirectory(fullPath, regex, filePattern, results, maxResults);
      } else if (entry.isFile()) {
        // Check if file matches pattern
        if (!filePattern.test(entry.name)) continue;
        
        // Skip binary files and common non-text files
        if (shouldSkipFile(entry.name)) continue;
        
        await searchFile(fullPath, regex, results, maxResults);
      }
    }
  } catch (error) {
    // Skip directories we can't read
    if (error instanceof Error && error.message.includes("EACCES")) {
      return;
    }
    throw error;
  }
}

async function searchFile(
  filePath: string,
  regex: RegExp,
  results: SearchResult[],
  maxResults: number
): Promise<void> {
  try {
    const content = await fs.readFile(filePath, "utf8");
    const lines = content.split("\n");
    
    for (let lineIndex = 0; lineIndex < lines.length; lineIndex++) {
      if (results.length >= maxResults) break;
      
      const line = lines[lineIndex];
      let match;
      
      // Reset regex lastIndex for global regex
      regex.lastIndex = 0;
      
      while ((match = regex.exec(line)) !== null) {
        if (results.length >= maxResults) break;
        
        results.push({
          file: filePath,
          line: lineIndex + 1,
          column: match.index + 1,
          content: line,
          match: match[0]
        });
        
        // Prevent infinite loop with zero-length matches
        if (match.index === regex.lastIndex) {
          regex.lastIndex++;
        }
      }
    }
  } catch (error) {
    // Skip files we can't read or that aren't text
    if (error instanceof Error && 
        (error.message.includes("EACCES") || 
         error.message.includes("ENOENT") ||
         error.message.includes("Invalid character"))) {
      return;
    }
    throw error;
  }
}

function shouldSkipDirectory(name: string): boolean {
  const skipDirs = [
    "node_modules",
    ".git",
    ".svn",
    ".hg",
    "dist",
    "build",
    "out",
    "target",
    ".next",
    ".nuxt",
    ".cache",
    "coverage",
    ".nyc_output",
    ".forge"
  ];
  return skipDirs.includes(name) || name.startsWith(".");
}

function shouldSkipFile(name: string): boolean {
  const skipExtensions = [
    ".exe", ".dll", ".so", ".dylib", ".bin", ".dat", ".db", ".sqlite",
    ".jpg", ".jpeg", ".png", ".gif", ".bmp", ".ico", ".svg", ".webp",
    ".mp3", ".mp4", ".avi", ".mov", ".wav", ".flac",
    ".zip", ".tar", ".gz", ".rar", ".7z",
    ".pdf", ".doc", ".docx", ".xls", ".xlsx", ".ppt", ".pptx"
  ];
  
  const ext = path.extname(name).toLowerCase();
  return skipExtensions.includes(ext) || name.startsWith(".");
}

export async function findFiles(pattern: string, directory = process.cwd()): Promise<string[]> {
  try {
    const validator = new Validator();
    validator.validateString(pattern, "pattern", { required: true });
    validator.validateString(directory, "directory", { maxLength: 4096 });
    validator.throwIfInvalid();

    const files: string[] = [];
    const searchDir = path.resolve(directory);
    
    const filePatternRegex = new RegExp(
      pattern.replace(/\*\*/g, ".*").replace(/\*/g, "[^/]*"),
      "i"
    );

    await findFilesRecursive(searchDir, filePatternRegex, files);
    
    return files;
  } catch (error) {
    const forgeError = handleError(error);
    throw new ToolError("search", forgeError.message, {
      operation: "find_files",
      pattern,
      directory,
      originalError: forgeError
    });
  }
}

async function findFilesRecursive(
  dir: string,
  pattern: RegExp,
  files: string[]
): Promise<void> {
  try {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      
      if (entry.isDirectory()) {
        if (shouldSkipDirectory(entry.name)) continue;
        await findFilesRecursive(fullPath, pattern, files);
      } else if (entry.isFile()) {
        if (pattern.test(entry.name)) {
          files.push(fullPath);
        }
      }
    }
  } catch (error) {
    // Skip directories we can't read
    if (error instanceof Error && error.message.includes("EACCES")) {
      return;
    }
    throw error;
  }
}
