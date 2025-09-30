// ── FILE: src/config/profile.ts
import * as fs from "node:fs";
import * as path from "node:path";
import os from "node:os";
import { env } from "./env.js";
import { Validator, Patterns } from "../core/validation.js";

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
    if (fs.existsSync(p)) return JSON.parse(fs.readFileSync(p, "utf8")) as T;
  } catch {}
  return {};
}

function writeProfile(p: string, profile: Profile): void {
  ensureConfigDir(p === HOME_CFG ? "global" : "project");
  fs.writeFileSync(p, JSON.stringify(profile, null, 2));
}

export function ensureConfigDir(scope: "project" | "global" = "project") {
  const dir = scope === "global" ? HOME_DIR : PROJECT_DIR;
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

export function loadProfile(): Profile {
  // precedence: ENV > project config > home config > defaults
  const home = readJsonIfExists<Profile>(HOME_CFG);
  const proj = readJsonIfExists<Profile>(PROJECT_CFG);

  const provider =
    (proj.provider as Profile["provider"]) ??
    (env.FORGE_PROVIDER as Profile["provider"]) ??
    "openrouter";

  // sensible defaults per provider
  const model =
    proj.model ??
    (provider === "openrouter" ? env.GROK_MODEL_ID ?? "x-ai/grok-code-fast-1" : "grok-code-fast-1");

  const apiKey =
    proj.apiKey ?? env.GROK_API_KEY ?? env.OPENROUTER_API_KEY ?? process.env.OPENAI_API_KEY;

  const baseUrl =
    proj.baseUrl ??
    env.GROK_BASE_URL ??
    proj.baseUrl ??
    home.baseUrl ??
    (provider === "openrouter" ? "https://openrouter.ai/api/v1" : "https://api.x.ai/v1");

  const tokensPanel = proj.tokensPanel ?? true;
  const defaultTrace = proj.defaultTrace ?? "plan";
  const renderMode = proj.render?.mode ?? "append";

  const profile: Profile = {
    provider,
    model,
    baseUrl,
    apiKey,
    tokensPanel,
    defaultTrace,
    render: { mode: renderMode },
  };

  // Validate the profile
  const validator = new Validator();
  validator
    .validateString(profile.provider, "provider", {
      required: true,
      pattern: /^(xai|openrouter|mock)$/,
      patternMessage: "must be one of: xai, openrouter, mock"
    })
    .validateString(profile.model, "model", {
      required: true,
      minLength: 1,
      maxLength: 100
    })
    .validateString(profile.baseUrl, "baseUrl", {
      pattern: Patterns.url,
      patternMessage: "must be a valid URL"
    })
    .validateString(profile.apiKey, "apiKey", {
      minLength: 10,
      maxLength: 200
    })
    .validateString(profile.defaultTrace, "defaultTrace", {
      pattern: /^(none|plan|verbose)$/,
      patternMessage: "must be one of: none, plan, verbose"
    });

  validator.throwIfInvalid();

  return profile;
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
