/**
 * xAI Grok client with SSE streaming support
 * Compatible with OpenAI-style chat completions API
 */
import { fetch } from "undici";

export interface XAIMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface XAIOptions {
  model?: string;
  stream?: boolean;
  temperature?: number;
  maxTokens?: number;
}

export interface XAIUsage {
  prompt_tokens?: number;
  completion_tokens?: number;
  total_tokens?: number;
  completion_tokens_details?: {
    reasoning_tokens?: number;
  };
}

export interface XAIStreamChunk {
  delta?: string;
  usage?: XAIUsage;
  summary?: {
    current: string;
    next: string;
  };
  model?: string;
}

function getBaseUrl(): string {
  const raw = process.env.XAI_BASE_URL || process.env.GROK_BASE_URL || "https://api.x.ai/v1";
  try {
    const u = new URL(raw);
    const isXai = /(^|\.)x\.ai$/i.test(u.hostname);
    const hasVersion = /\/v\d+(\/|$)?/i.test(u.pathname);
    const normalized = raw.replace(/\/$/, "");
    if (isXai && !hasVersion) return normalized + "/v1";
    return normalized;
  } catch {
    return raw.replace(/\/$/, "");
  }
}

function getApiKey(): string {
  // Load dotenv if available
  try {
    require("dotenv").config?.();
  } catch {}
  
  const key = process.env.XAI_API_KEY || process.env.GROK_API_KEY;
  if (!key) {
    throw new Error(
      "XAI_API_KEY is required. Set it in your .env file or environment:\n" +
      "  export XAI_API_KEY=xai-...\n" +
      "Get your key from https://console.x.ai/"
    );
  }
  return key;
}

export async function* chatStream(
  messages: XAIMessage[],
  options: XAIOptions = {}
): AsyncGenerator<XAIStreamChunk, void, unknown> {
  const model = options.model || process.env.FORGE_MODEL || "grok-4-fast";
  const body = {
    model,
    messages,
    stream: true,
    temperature: options.temperature ?? 0.3,
    max_tokens: options.maxTokens ?? 2048,
  };

  const res = await fetch(`${getBaseUrl()}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${getApiKey()}`,
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    throw new Error(`xAI request failed: ${res.status} ${res.statusText}\n${txt}`);
  }

  const reader = res.body?.getReader();
  if (!reader) throw new Error("No body reader available");

  const decoder = new TextDecoder();
  let buf = "";
  let lastUsage: XAIUsage | undefined;
  let modelId = model;

  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;

      buf += decoder.decode(value, { stream: true });
      const lines = buf.split(/\r?\n/);
      buf = lines.pop() ?? "";

      for (const raw of lines) {
        const line = raw.trim();
        if (!line.startsWith("data:")) continue;
        
        const payload = line.slice(5).trim();
        if (!payload || payload === "[DONE]") continue;

        try {
          const json = JSON.parse(payload);
          
          // Extract model ID
          if (json.model) modelId = json.model;
          
          // Extract usage
          if (json.usage) lastUsage = json.usage;
          
          // Extract content delta
          const delta = json.choices?.[0]?.delta?.content;
          
          // Extract reasoning (if present, we'll use it for status summaries)
          const reasoning = json.choices?.[0]?.delta?.reasoning_content;
          
          if (delta || reasoning) {
            const chunk: XAIStreamChunk = { delta: delta || undefined };
            
            // Generate status summary from reasoning if available
            if (reasoning) {
              chunk.summary = generateSummary(reasoning);
            }
            
            yield chunk;
          }
        } catch (err) {
          // Skip malformed JSON
          continue;
        }
      }
    }

    // Yield final usage
    if (lastUsage) {
      yield { usage: lastUsage, model: modelId };
    }
  } finally {
    reader.releaseLock();
  }
}

/**
 * Generate public-facing status summaries from reasoning content
 * This extracts high-level intent without revealing internal chain-of-thought
 */
function generateSummary(reasoning: string): { current: string; next: string } {
  // Simple heuristic: extract first and last sentences, truncate to ≤10 words
  const sentences = reasoning
    .split(/[.!?]+/)
    .map((s) => s.trim())
    .filter(Boolean);

  const current = truncate(sentences[0] || "Processing", 10);
  const next = truncate(sentences[sentences.length - 1] || "Continuing", 10);

  return { current, next };
}

function truncate(text: string, maxWords: number): string {
  const words = text.split(/\s+/).slice(0, maxWords);
  return words.join(" ");
}

/**
 * Non-streaming variant for simple requests (ghost completions, etc.)
 */
export async function chat(
  messages: XAIMessage[],
  options: XAIOptions = {}
): Promise<{ text: string; usage?: XAIUsage; model?: string }> {
  const model = options.model || process.env.FORGE_MODEL || "grok-4-fast";
  const body = {
    model,
    messages,
    stream: false,
    temperature: options.temperature ?? 0.3,
    max_tokens: options.maxTokens ?? 2048,
  };

  const res = await fetch(`${getBaseUrl()}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${getApiKey()}`,
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    throw new Error(`xAI request failed: ${res.status} ${res.statusText}\n${txt}`);
  }

  const json: any = await res.json();
  const text = json.choices?.[0]?.message?.content ?? "";
  const usage = json.usage || undefined;
  const modelId = json.model || model;

  return { text, usage, model: modelId };
}
