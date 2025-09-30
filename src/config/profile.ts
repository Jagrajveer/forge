// ── FILE: src/config/profile.ts
import * as fs from "node:fs";
import * as path from "node:path";
import os from "node:os";
import { env } from "./env.js";

export interface Profile {
  provider: "xai" | "openrouter" | "mock";
  model: string;
  baseUrl?: string;
  apiKey?: string;
  tokensPanel?: boolean;
  defaultTrace?: "none" | "plan" | "verbose";
  render?: { mode: "append" | "refresh" };
}

const PROJECT_DIR = path.join(process.cwd(), ".forge");
const PROJECT_CFG = path.join(PROJECT_DIR, "config.json");
const HOME_DIR = path.join(os.homedir(), ".forge");
const HOME_CFG = path.join(HOME_DIR, "config.json");

function readJsonIfExists<T>(p: string): Partial<T> {
  try {
    if (fs.existsSync(p)) return JSON.parse(fs.readFileSync(p, "utf8"));
  } catch { /* ignore */ }
  return {};
}

function normalizeModel(provider: Profile["provider"], modelIn: string): string {
  let m = modelIn;
  if (provider === "xai") m = m.replace(/^x-ai\//i, "");
  if (provider === "openrouter" && !m.includes("/")) m = `x-ai/${m}`;
  return m;
}

export function ensureConfigDir(scope: "project" | "global" = "project") {
  const dir = scope === "global" ? HOME_DIR : PROJECT_DIR;
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

export function loadProfile(): Profile {
  // precedence: ENV > project config > home config > defaults
  const home = readJsonIfExists<Profile>(HOME_CFG);
  const proj = readJsonIfExists<Profile>(PROJECT_CFG);

  const provider = (env.FORGE_PROVIDER ?? proj.provider ?? home.provider ?? "openrouter") as Profile["provider"];
  const modelRaw = env.GROK_MODEL_ID ?? proj.model ?? home.model ?? "x-ai/grok-code-fast-1";
  const model = normalizeModel(provider, modelRaw);

  const apiKey =
    env.GROK_API_KEY ?? env.OPENROUTER_API_KEY ?? proj.apiKey ?? home.apiKey ?? process.env.OPENAI_API_KEY;

  const baseUrl =
    env.GROK_BASE_URL ??
    proj.baseUrl ??
    home.baseUrl ??
    (provider === "openrouter" ? "https://openrouter.ai/api/v1" : "https://api.x.ai/v1");

  const tokensPanel = proj.tokensPanel ?? home.tokensPanel ?? true;
  const defaultTrace = proj.defaultTrace ?? home.defaultTrace ?? "plan";
  const renderMode = proj.render?.mode ?? home.render?.mode ?? "append";

  return { provider, model, baseUrl, apiKey, tokensPanel, defaultTrace, render: { mode: renderMode } };
}

function writeProfile(p: string, data: Profile) {
  fs.writeFileSync(p, JSON.stringify(data, null, 2) + "\n", "utf8");
}

export function saveProfile(update: Partial<Profile>, scope: "project" | "global" = "project"): Profile {
  ensureConfigDir(scope);
  const base = scope === "global" ? readJsonIfExists<Profile>(HOME_CFG) : readJsonIfExists<Profile>(PROJECT_CFG);
  const next: Profile = {
    provider: (update.provider ?? base.provider ?? "openrouter") as Profile["provider"],
    model: update.model ?? base.model ?? "x-ai/grok-code-fast-1",
    baseUrl: update.baseUrl ?? base.baseUrl,
    apiKey: update.apiKey ?? base.apiKey,
    tokensPanel: update.tokensPanel ?? base.tokensPanel ?? true,
    defaultTrace: update.defaultTrace ?? base.defaultTrace ?? "plan",
    render: { mode: update.render?.mode ?? base.render?.mode ?? "append" },
  };
  writeProfile(scope === "global" ? HOME_CFG : PROJECT_CFG, next);
  return next;
}

export function clearApiKey(scope: "project" | "global" = "project"): Profile {
  ensureConfigDir(scope);
  const base = scope === "global" ? readJsonIfExists<Profile>(HOME_CFG) : readJsonIfExists<Profile>(PROJECT_CFG);
  const next: Profile = {
    provider: (base.provider ?? "openrouter") as Profile["provider"],
    model: base.model ?? "x-ai/grok-code-fast-1",
    baseUrl: base.baseUrl,
    apiKey: undefined,
    tokensPanel: base.tokensPanel ?? true,
    defaultTrace: base.defaultTrace ?? "plan",
    render: { mode: base.render?.mode ?? "append" },
  };
  writeProfile(scope === "global" ? HOME_CFG : PROJECT_CFG, next);
  return next;
}
