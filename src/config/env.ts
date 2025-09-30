import * as fs from "node:fs";
import * as path from "node:path";
import * as dotenv from "dotenv";


type Boolish = boolean | undefined;

function loadEnvFiles(): string[] {
  const loaded: string[] = [];
  const cwd = process.cwd();
  const candidates = [".env.local", ".env"];
  for (const file of candidates) {
    const p = path.join(cwd, file);
    if (fs.existsSync(p)) {
      dotenv.config({ path: p });
      loaded.push(p);
    }
  }
  return loaded;
}

const LOADED_ENV_FILES = loadEnvFiles();

export interface Env {
  readonly GROK_API_KEY: string | undefined;
  readonly GROK_MODEL_ID: string | undefined; // default in profile.ts
  readonly GROK_BASE_URL: string | undefined;

  readonly OPENROUTER_API_KEY: string | undefined;

  readonly FORGE_PROVIDER: "xai" | "openrouter" | "mock" | undefined;

  readonly FORGE_ALLOW_DANGEROUS: Boolish;
  readonly FORGE_CMD_TIMEOUT_MS: number | undefined;
  readonly FORGE_TOOL_STDIO_LIMIT: number | undefined;

  readonly LOADED_ENV_FILES: string[];
}

function toBool(v: string | undefined): boolean | undefined {
  if (v === undefined) return undefined;
  return ["1", "true", "yes", "on"].includes(v.toLowerCase());
}

function toInt(v: string | undefined): number | undefined {
  if (v === undefined || v === "") return undefined;
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
}

export const env: Env = {
  GROK_API_KEY: process.env.GROK_API_KEY ?? process.env.XAI_API_KEY, // tolerate legacy
  GROK_MODEL_ID: process.env.GROK_MODEL_ID ?? "x-ai/grok-code-fast-1",
  GROK_BASE_URL: process.env.GROK_BASE_URL, // if calling x.ai directly

  OPENROUTER_API_KEY: process.env.OPENROUTER_API_KEY,

  FORGE_PROVIDER: (process.env.FORGE_PROVIDER as Env["FORGE_PROVIDER"]) ?? "openrouter",

  FORGE_ALLOW_DANGEROUS: toBool(process.env.FORGE_ALLOW_DANGEROUS),
  FORGE_CMD_TIMEOUT_MS: toInt(process.env.FORGE_CMD_TIMEOUT_MS),
  FORGE_TOOL_STDIO_LIMIT: toInt(process.env.FORGE_TOOL_STDIO_LIMIT),

  LOADED_ENV_FILES,
};
