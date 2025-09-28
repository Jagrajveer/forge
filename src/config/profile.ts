import * as fs from "node:fs";
import * as path from "node:path";
import { getEnv, type Env } from "./env.js";

export type ProjectProfile = { modelId?: string; baseUrl?: string };
export type ResolvedConfig = {
  apiKey?: string;
  provider: "xai" | "openrouter";
  modelId: string;
  baseUrl: string;
  profilePath?: string;
};

function readJsonIfExists(p: string): unknown | undefined {
  try {
    if (fs.existsSync(p)) return JSON.parse(fs.readFileSync(p, "utf8"));
  } catch {}
  return undefined;
}

function ensureChatCompletionsRoute(
  provider: "xai" | "openrouter",
  rawBase: string | undefined
): string {
  const defaultBase =
    provider === "xai"
      ? "https://api.x.ai/v1/chat/completions"
      : "https://openrouter.ai/api/v1/chat/completions";

  if (!rawBase) return defaultBase;

  // Normalize trailing slashes
  let base = rawBase.replace(/\/+$/, "");
  // If someone set just the host or host + /v1, append /chat/completions
  const needsPath =
    base === "https://api.x.ai" ||
    base === "https://api.x.ai/v1" ||
    base === "https://openrouter.ai/api" ||
    base === "https://openrouter.ai/api/v1";

  if (needsPath) return `${base}/chat/completions`;

  // If it already ends with chat/completions, keep as-is
  if (/\/chat\/completions$/.test(base)) return base;

  // Otherwise, assume they intended the full route; if it doesn't look like one, append it.
  if (!/\/v\d+\/.+/.test(base)) {
    return `${base}/v1/chat/completions`;
  }
  return base;
}

export function loadProfile(cwd: string = process.cwd()): ResolvedConfig {
  const env: Env = getEnv();

  const profileDir = path.join(cwd, ".grokcli");
  const profilePath = path.join(profileDir, "config.json");
  const profile = (readJsonIfExists(profilePath) || {}) as ProjectProfile;

  const providerEnv = env.FORGE_PROVIDER?.toLowerCase();
  const hasGrokKey = Boolean(env.GROK_API_KEY);
  const hasOpenRouter = Boolean(env.OPENROUTER_API_KEY);

  let provider: ResolvedConfig["provider"];
  if (providerEnv === "xai" || providerEnv === "openrouter") {
    provider = providerEnv as ResolvedConfig["provider"];
  } else {
    provider = hasGrokKey ? "xai" : "openrouter";
  }

  const envModel = env.GROK_MODEL_ID || "grok-code-fast-1";
  const modelId = profile.modelId || envModel;

  const baseUrl = ensureChatCompletionsRoute(provider, profile.baseUrl || env.GROK_BASE_URL);

  const apiKey = provider === "xai" ? env.GROK_API_KEY : env.OPENROUTER_API_KEY;

  return {
    apiKey,
    provider,
    modelId,
    baseUrl,
    profilePath: fs.existsSync(profilePath) ? profilePath : undefined
  };
}
