import * as fs from "node:fs/promises";
import * as path from "node:path";
import { validateFilePath } from "../validation.js";
import { ToolError, handleError } from "../errors.js";

export interface OpenFileOptions {
  maxBytes?: number; // default 200KB
}

export async function openFile(relPath: string, opts: OpenFileOptions = {}): Promise<{
  path: string;
  content: string;
  truncated: boolean;
}> {
  try {
    validateFilePath(relPath);
    
    const abs = path.resolve(process.cwd(), relPath);
    const raw = await fs.readFile(abs);
    const max = opts.maxBytes ?? 200_000;
    if (raw.byteLength > max) {
      const slice = raw.subarray(0, max);
      return { path: abs, content: slice.toString("utf8") + "\n…(truncated)…", truncated: true };
    }
    return { path: abs, content: raw.toString("utf8"), truncated: false };
  } catch (error) {
    const forgeError = handleError(error);
    throw new ToolError("open_file", forgeError.message, {
      filePath: relPath,
      originalError: forgeError
    });
  }
}
