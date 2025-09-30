import * as fs from "node:fs";
import * as path from "node:path";

import type { Turn } from "./history.js";

const SESSIONS_DIR = path.join(process.cwd(), ".forge", "sessions");

export function readSession(file: string): Turn[] {
  const p = path.isAbsolute(file) ? file : path.join(SESSIONS_DIR, file);
  if (!fs.existsSync(p)) return [];
  const lines = fs.readFileSync(p, "utf8").split(/\r?\n/).filter(Boolean);
  return lines.map((l) => {
    try {
      return JSON.parse(l) as Turn;
    } catch {
      return undefined as unknown as Turn;
    }
  }).filter(Boolean) as Turn[];
}

export function listSessions(dir = SESSIONS_DIR): { file: string; size: number; mtime: Date; roles: string[] }[] {
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((f) => f.endsWith(".jsonl"))
    .map((f) => {
      const p = path.join(dir, f);
      const st = fs.statSync(p);
      const turns = readSession(p);
      const lastRoles = turns.slice(-5).map((t) => t.role);
      return { file: f, size: st.size, mtime: st.mtime, roles: lastRoles };
    })
    .sort((a, b) => b.mtime.getTime() - a.mtime.getTime());
}

export function shortPreview(turns: Turn[], max = 120): string {
  const s = turns.map((t) => `${t.role}: ${t.content}`).join(" | ");
  return s.length > max ? s.slice(0, max - 1) + "…" : s;
}


