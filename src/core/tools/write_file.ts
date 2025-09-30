import * as fs from "node:fs/promises";
import * as path from "node:path";
import { validateFilePath } from "../validation.js";
import { ToolError, handleError } from "../errors.js";

export interface WriteFileOptions {
  mkdir?: boolean; // create parent dirs if needed
}

export async function writeFileSafe(relPath: string, content: string, opts: WriteFileOptions = {}) {
  try {
    validateFilePath(relPath);
    
    // Validate content size
    const maxSize = 10 * 1024 * 1024; // 10MB
    if (Buffer.byteLength(content, "utf8") > maxSize) {
      throw new Error(`File content too large: ${Buffer.byteLength(content, "utf8")} bytes. Maximum ${maxSize} bytes allowed.`);
    }
    
    const abs = path.resolve(process.cwd(), relPath);
    if (opts.mkdir) {
      await fs.mkdir(path.dirname(abs), { recursive: true });
    }
    await fs.writeFile(abs, content, "utf8");
    return abs;
  } catch (error) {
    const forgeError = handleError(error);
    throw new ToolError("write_file", forgeError.message, {
      filePath: relPath,
      contentSize: Buffer.byteLength(content, "utf8"),
      originalError: forgeError
    });
  }
}
