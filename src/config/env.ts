// src/config/env.ts
import dotenv from "dotenv";
import * as path from "node:path";
import * as fs from "node:fs";

/**
 * Load .env files robustly and expose normalized config.
 * - Searches from CWD up to filesystem root for `.env.local` then `.env`
 * - Later files override earlier ones (local wins)
 * - Falls back to dotenv.config() default resolution
 */

function tryLoad(p: string, loaded: string[]) {
  try {
    if (fs.existsSync(p)) {
      dotenv.config({ path: p });
      loaded.push(p);
    }
  } catch {
    // ignore file/read errors; diagnostics will show what we managed to load
  }
}

function loadEnvSearch(): string[] {
  const loaded: string[] = [];
  let dir = process.cwd();
  const seen = new Set<string>();

  // Walk up to root, loading .env.local then .env at each level.
  while (true) {
    const local = path.join(dir, ".env.local");
    const base = path.join(dir, ".env");
    if (!seen.has(local)) {
      tryLoad(local, loaded);
      seen.add(local);
    }
    if (!seen.has(base)) {
      tryLoad(base, loaded);
      seen.add(base);
    }
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }

  // Final fallback: default resolution (CWD)
  if (loaded.length === 0) {
    try {
      dotenv.config();
    } catch {
      /* noop */
    }
  }
  return loaded;
}

export function normalizeXaiBaseUrl(input?: string): string {
  const base = (input ?? "").replace(/\/+$/, "");
  const stripped = base.replace(/\/v1(?:\/chat\/completions)?$/i, "");
  return stripped || "https://api.x.ai";
}

const LOADED_ENV_FILES = loadEnvSearch();

const allowDangerous = /^true$/i.test(process.env.FORGE_ALLOW_DANGEROUS || "");
const num = (v?: string) => {
  const n = Number.parseInt(v ?? "");
  return Number.isFinite(n) ? n : undefined;
};

export const ENV = {
  // Auth (xAI primary; accept legacy GROK_* too)
  XAI_API_KEY: process.env.XAI_API_KEY ?? process.env.GROK_API_KEY ?? undefined,

  // Network
  XAI_BASE_URL: normalizeXaiBaseUrl(process.env.XAI_BASE_URL ?? process.env.GROK_BASE_URL),
  XAI_MODEL: process.env.XAI_MODEL ?? process.env.GROK_MODEL ?? "grok-3",

  // Guardrails & limits
  FORGE_ALLOW_DANGEROUS: allowDangerous,
  FORGE_CMD_TIMEOUT_MS: num(process.env.FORGE_CMD_TIMEOUT_MS),
  FORGE_TOOL_STDIO_LIMIT: num(process.env.FORGE_TOOL_STDIO_LIMIT),

  // Debug
  LOADED_ENV_FILES,
} as const;

/** Back-compat: keep older import style alive */
export type Env = typeof ENV;
export function getEnv(): Env {
  return ENV;
}

/** Human-readable diagnostics for `forge env doctor` */
export function envDiagnostics() {
  return {
    cwd: process.cwd(),
    loadedEnvFiles: LOADED_ENV_FILES,
    hasXaiApiKey: Boolean(ENV.XAI_API_KEY),
    xaiBaseUrl: ENV.XAI_BASE_URL,
    xaiModel: ENV.XAI_MODEL,
  };
}
