import * as fs from "node:fs";
import * as path from "node:path";
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

const CONFIG_DIR = path.join(process.cwd(), ".forge");
const CONFIG_PATH = path.join(CONFIG_DIR, "config.json");

function readJsonIfExists<T>(p: string): Partial<T> {
  try {
    if (fs.existsSync(p)) return JSON.parse(fs.readFileSync(p, "utf8")) as T;
  } catch {}
  return {};
}

export function loadProfile(): Profile {
  const fileCfg = readJsonIfExists<Profile>(CONFIG_PATH);

  const provider =
    (fileCfg.provider as Profile["provider"]) ??
    (env.FORGE_PROVIDER as Profile["provider"]) ??
    "openrouter";

  // sensible defaults per provider
  const model =
    fileCfg.model ??
    (provider === "openrouter" ? env.GROK_MODEL_ID ?? "x-ai/grok-code-fast-1" : "grok-code-fast-1");

  const apiKey =
    fileCfg.apiKey ?? env.GROK_API_KEY ?? env.OPENROUTER_API_KEY ?? process.env.OPENAI_API_KEY;

  const baseUrl =
    fileCfg.baseUrl ??
    env.GROK_BASE_URL ??
    (provider === "openrouter" ? "https://openrouter.ai/api/v1" : "https://api.x.ai/v1");

  const tokensPanel = fileCfg.tokensPanel ?? true;
  const defaultTrace = fileCfg.defaultTrace ?? "plan";
  const renderMode = fileCfg.render?.mode ?? "append";

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

export function ensureConfigDir() {
  if (!fs.existsSync(CONFIG_DIR)) fs.mkdirSync(CONFIG_DIR, { recursive: true });
}
