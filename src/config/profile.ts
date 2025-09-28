// src/config/profile.ts
import { getEnv, type Env, normalizeXaiBaseUrl } from "./env.js";

/**
 * Provider profile resolution
 * ---------------------------
 * - Primary provider: xAI (reads from ENV: XAI_API_KEY, XAI_BASE_URL, XAI_MODEL)
 * - Optional provider: OpenRouter (reads from process.env.* so env.ts doesn’t need to depend on it)
 *
 * Endpoints:
 *   - xAI:         https://api.x.ai/v1/chat/completions
 *   - OpenRouter:  https://openrouter.ai/api/v1/chat/completions
 */

export type Provider = "xai" | "openrouter";

export interface ProviderProfile {
  provider: Provider;
  /** Full chat-completions endpoint URL */
  baseUrl: string;
  /** Provider model id */
  model: string;
  /** Raw API key used for Authorization */
  apiKey: string;
  /** Request headers to use by default */
  headers: Record<string, string>;
}

/** Normalize OpenRouter base so we end up with a host like https://openrouter.ai/api */
function normalizeOpenRouterBaseUrl(input?: string): string {
  const base = (input ?? "").replace(/\/+$/, "");
  // Strip any trailing /api/v1 or /api/v1/chat/completions
  const host = base.replace(/\/api\/v1(?:\/chat\/completions)?$/i, "");
  return host || "https://openrouter.ai";
}

/** Build a full Chat Completions endpoint from a host-ish base */
export function ensureChatCompletionsRoute(provider: Provider, baseUrlOrHost: string): string {
  const trimmed = (baseUrlOrHost || "").replace(/\/+$/, "");
  if (provider === "xai") {
    const host = normalizeXaiBaseUrl(trimmed);
    return `${host}/v1/chat/completions`;
  } else {
    const host = normalizeOpenRouterBaseUrl(trimmed);
    return `${host}/api/v1/chat/completions`;
  }
}

/**
 * Resolve a usable ProviderProfile by combining:
 * - Common defaults
 * - .env (*.local supported via env.ts)
 * - Optional overrides
 */
export function resolveProfile(
  overrides: Partial<Pick<ProviderProfile, "provider" | "baseUrl" | "model" | "apiKey">> = {}
): ProviderProfile {
  const env: Env = getEnv();

  // Allow a user preference via FORGE_PROVIDER, else auto-pick by available key
  const providerEnv = (process.env.FORGE_PROVIDER || "").toLowerCase() as Provider | "";
  const hasXaiKey = Boolean(env.XAI_API_KEY);
  const hasOpenRouterKey = Boolean(process.env.OPENROUTER_API_KEY);

  let provider: Provider =
    overrides.provider ??
    (providerEnv === "openrouter" ? "openrouter" : providerEnv === "xai" ? "xai" : hasXaiKey ? "xai" : "openrouter");

  // Model, base host, and key per provider
  let model =
    overrides.model ??
    (provider === "xai"
      ? env.XAI_MODEL // from ENV (default: grok-3)
      : process.env.OPENROUTER_MODEL || "openrouter/auto");

  const baseHost =
    overrides.baseUrl ??
    (provider === "xai"
      ? env.XAI_BASE_URL // normalized host (e.g., https://api.x.ai)
      : process.env.OPENROUTER_BASE_URL || "https://openrouter.ai");

  const baseUrl = ensureChatCompletionsRoute(provider, baseHost);

  const apiKey =
    overrides.apiKey ??
    (provider === "xai" ? env.XAI_API_KEY || "" : process.env.OPENROUTER_API_KEY || "");

  if (!apiKey) {
    const varName = provider === "xai" ? "XAI_API_KEY" : "OPENROUTER_API_KEY";
    throw new Error(`Missing API key for provider "${provider}". Set ${varName} in your environment.`);
  }

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${apiKey}`,
  };

  // OpenRouter recommends optional headers for ranking/visibility
  if (provider === "openrouter") {
    const ref = process.env.OPENROUTER_HTTP_REFERER;
    const title = process.env.OPENROUTER_TITLE;
    if (ref) headers["HTTP-Referer"] = ref;
    if (title) headers["X-Title"] = title;
  }

  return { provider, baseUrl, model, apiKey, headers };
}

// Optional default export for convenience
export default resolveProfile;
