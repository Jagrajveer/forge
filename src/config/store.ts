import * as fsp from "node:fs/promises";
import * as fs from "node:fs";
import * as path from "node:path";
import type { Profile } from "./profile.js";
import { ensureConfigDir } from "./profile.js";

const CWD = process.cwd();
const ENV_PATH = path.join(CWD, ".env");
const CONFIG_DIR = path.join(CWD, ".forge");
const CONFIG_PATH = path.join(CONFIG_DIR, "config.json");

async function readMaybe(p: string): Promise<string> {
  try {
    return await fsp.readFile(p, "utf8");
  } catch {
    return "";
  }
}

export async function upsertEnvVar(key: string, value?: string): Promise<void> {
  const src = await readMaybe(ENV_PATH);
  const lines = src ? src.split(/\r?\n/) : [];
  let found = false;

  const next = lines
    .map((ln) => {
      if (!ln || ln.trim().startsWith("#")) return ln;
      const idx = ln.indexOf("=");
      if (idx === -1) return ln;
      const k = ln.slice(0, idx).trim();
      if (k === key) {
        found = true;
        return value === undefined ? null : `${key}=${value}`;
      }
      return ln;
    })
    .filter((ln) => ln !== null) as string[];

  if (!found && value !== undefined) next.push(`${key}=${value}`);

  await fsp.writeFile(ENV_PATH, next.join("\n") + "\n", "utf8");
}

export async function removeEnvVar(key: string): Promise<void> {
  await upsertEnvVar(key, undefined);
}

export function maskKey(key?: string): string {
  if (!key) return "(none)";
  if (key.length <= 8) return "*".repeat(key.length);
  return `${key.slice(0, 4)}…${key.slice(-4)}`;
}

export async function readStoredKey(provider: "xai" | "openrouter"): Promise<string | undefined> {
  const src = await readMaybe(ENV_PATH);
  const lines = src ? src.split(/\r?\n/) : [];
  const prefer = provider === "xai" ? "XAI_API_KEY" : "OPENROUTER_API_KEY";

  for (const ln of lines) {
    if (ln?.startsWith(prefer + "=")) return ln.slice(prefer.length + 1).trim();
  }
  return process.env[prefer];
}

export async function updateProfileConfig(patch: Partial<Profile>): Promise<void> {
  await ensureConfigDir();
  let current: Partial<Profile> = {};
  try {
    const raw = await fsp.readFile(CONFIG_PATH, "utf8");
    current = JSON.parse(raw);
  } catch {}
  const next = { ...current, ...patch };
  await fsp.writeFile(CONFIG_PATH, JSON.stringify(next, null, 2) + "\n", "utf8");
}

export async function setXaiAuth(apiKey: string): Promise<{ envPath: string; configPath: string }> {
  await upsertEnvVar("XAI_API_KEY", apiKey);
  await updateProfileConfig({
    provider: "xai",
    baseUrl: "https://api.x.ai/v1",
    model: "grok-code-fast-1",
  } as Partial<Profile>);
  return { envPath: ENV_PATH, configPath: CONFIG_PATH };
}

export async function clearAuthForProvider(provider: "xai" | "openrouter"): Promise<void> {
  if (provider === "xai") await removeEnvVar("XAI_API_KEY");
  else await removeEnvVar("OPENROUTER_API_KEY");
}
