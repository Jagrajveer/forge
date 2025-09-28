// src/state/memory.ts
import * as fs from "node:fs";
import * as path from "node:path";

const CONFIG_DIR = path.join(process.cwd(), ".forge");
const MEMORY_PATH = path.join(CONFIG_DIR, "MEMORY.md");

/** Ensure .forge exists. Safe to call multiple times. */
export function ensureConfigDir() {
  if (!fs.existsSync(CONFIG_DIR)) fs.mkdirSync(CONFIG_DIR, { recursive: true });
}

/** Loads .forge/MEMORY.md if present. Returns undefined when absent. */
export function loadMemory(): string | undefined {
  try {
    ensureConfigDir();
    if (fs.existsSync(MEMORY_PATH)) {
      return fs.readFileSync(MEMORY_PATH, "utf8");
    }
  } catch {
    // ignore read errors; treat as no memory
  }
  return undefined;
}

/** Returns absolute path to the memory file. */
export function memoryPath(): string {
  return MEMORY_PATH;
}
