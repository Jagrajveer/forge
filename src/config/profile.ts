import * as fs from "node:fs";
import * as path from "node:path";
import { env } from "./env.js";

export interface Profile {
  provider: "xai" | "openrouter" | "mock";
  model: string;
  baseUrl?: string;
  apiKey?: string;
  tokensPanel?: boolean;
  defaultTrace?: "none" | "plan" | "verbose";
  render?: {
    mode: "append" | "refresh";
  };
}

const CONFIG_DIR = path.join(process.cwd(), ".forge");
const CONFIG_PATH = path.join(CONFIG_DIR, "config.json");

function readJsonIfExists<T>(p: string): Partial<T> {
  try {
    if (fs.existsSync(p)) return JSON.parse(fs.readFileSync(p, "utf8"));
    return {};
  } catch {
    return {};
  }
}

function normalizeModelForProvider(provider: Profile["provider"], modelIn: string): string {
  let m = modelIn;
  if (provider === "xai") {
    // xAI expects bare model ids (e.g., "grok-code-fast-1", "grok-4-fast-reasoning")
    m = m.replace(/^x-ai\//i, "");
  } else if (provider === "openrouter") {
    // OpenRouter expects "<provider>/<model>"
    if (!m.includes("/")) m = `x-ai/${m}`;
  }
  return m;
}

export function loadProfile(): Profile {
  const fileCfg = readJsonIfExists<Profile>(CONFIG_PATH);

  const providerEnv = (env.FORGE_PROVIDER ?? "openrouter").toLowerCase() as Profile["provider"];
  const provider = (fileCfg.provider ?? providerEnv) as Profile["provider"];

  const modelRaw = fileCfg.model ?? env.GROK_MODEL_ID ?? "x-ai/grok-code-fast-1";
  const model = normalizeModelForProvider(provider, modelRaw);

  const apiKey =
    fileCfg.apiKey ??
    env.GROK_API_KEY ??
    env.OPENROUTER_API_KEY ??
    process.env.OPENAI_API_KEY;

  // Sensible defaults per provider; users can override with GROK_BASE_URL or config.json
  let baseUrl =
    fileCfg.baseUrl ??
    env.GROK_BASE_URL ??
    (provider === "openrouter" ? "https://openrouter.ai/api/v1" : "https://api.x.ai/v1");

  const renderMode = fileCfg.render?.mode ?? "append";
  const defaultTrace = fileCfg.defaultTrace ?? "plan";
  const tokensPanel = fileCfg.tokensPanel ?? true;

  return {
    provider,
    model,
    baseUrl,
    apiKey,
    tokensPanel,
    defaultTrace,
    render: { mode: renderMode },
  };
}

export function ensureConfigDir() {
  if (!fs.existsSync(CONFIG_DIR)) fs.mkdirSync(CONFIG_DIR, { recursive: true });
}
