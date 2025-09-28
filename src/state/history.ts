// src/state/history.ts
import * as fs from "node:fs";
import * as path from "node:path";

const SESSIONS_DIR = path.join(process.cwd(), ".forge", "sessions");

export type Role = "system" | "user" | "assistant" | "tool" | "meta";

export interface Turn {
  ts: string;            // ISO timestamp
  role: Role;
  content: string;       // concatenated text for the turn
  meta?: Record<string, unknown>;
}

/**
 * Minimal JSONL session logger for audits.
 * .forge/sessions/YYYYMMDDTHHMMSS.jsonl
 */
export class SessionLog {
  private filepath: string;

  private constructor(filepath: string) {
    this.filepath = filepath;
  }

  static create(now: Date = new Date()): SessionLog {
    if (!fs.existsSync(SESSIONS_DIR)) fs.mkdirSync(SESSIONS_DIR, { recursive: true });
    const stamp = now.toISOString().replace(/[:.]/g, "").slice(0, 15); // e.g., 20250928T144233
    const file = path.join(SESSIONS_DIR, `${stamp}.jsonl`);
    return new SessionLog(file);
  }

  path(): string {
    return this.filepath;
  }

  append(turn: Turn): void {
    const line = JSON.stringify(turn);
    fs.appendFileSync(this.filepath, line + "\n", "utf8");
  }
}
