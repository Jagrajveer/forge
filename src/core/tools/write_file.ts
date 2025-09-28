import * as fs from "node:fs/promises";
import * as path from "node:path";

export interface WriteFileOptions {
  mkdir?: boolean; // create parent dirs if needed
}

export async function writeFileSafe(relPath: string, content: string, opts: WriteFileOptions = {}) {
  const abs = path.resolve(process.cwd(), relPath);
  if (opts.mkdir) {
    await fs.mkdir(path.dirname(abs), { recursive: true });
  }
  await fs.writeFile(abs, content, "utf8");
  return abs;
}
