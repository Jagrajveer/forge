import type { LLM, ChatMessage } from "./types.js";
import type { UsageMeta } from "../core/usage.js";
import { loadProfile } from "../config/profile.js";
import { getEnv } from "../config/env.js";

type OpenAIStyleResponse = {
  id: string;
  model: string;
  choices: Array<{ message?: { role: string; content: string }; delta?: { content?: string } }>;
  usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number };
  error?: { code?: string | number; message?: string };
};

function canonicalizeModelId(provider: "xai" | "openrouter", modelId: string): string {
  if (provider === "xai") {
    const parts = modelId.split("/");
    return parts[parts.length - 1]; // "x-ai/grok-code-fast-1" -> "grok-code-fast-1"
  }
  if (!modelId.includes("/") && modelId.startsWith("grok-")) return `x-ai/${modelId}`;
  return modelId;
}

async function postOnce(opts: {
  baseUrl: string;
  apiKey: string;
  provider: "xai" | "openrouter";
  modelId: string;
  messages: ChatMessage[];
  stream?: boolean;
}): Promise<Response> {
  const { baseUrl, apiKey, provider, stream } = opts;
  const model = canonicalizeModelId(provider, opts.modelId);
  const payload = {
    model,
    messages: opts.messages.map(m => ({
      role: m.role,
      content: typeof m.content === "string" ? m.content : JSON.stringify(m.content)
    })),
    ...(stream ? { stream: true } : {})
  };
  const headers: Record<string, string> = {
    "content-type": "application/json",
    authorization: `Bearer ${apiKey}`
  };
  if (provider === "openrouter") {
    headers["HTTP-Referer"] = "https://forge.local/cli";
    headers["X-Title"] = "forge-cli";
  }
  const res = await fetch(baseUrl, { method: "POST", headers, body: JSON.stringify(payload) });
  return res;
}

function parseNonStream(json: string): { text: string; usage?: UsageMeta } {
  const data = JSON.parse(json) as OpenAIStyleResponse;
  if (data.error) throw new Error(data.error.message || "Provider returned an error.");
  const text =
    data.choices?.[0]?.message?.content ??
    data.choices?.[0]?.delta?.content ??
    "";
  const usage: UsageMeta | undefined = data.usage
    ? {
        inputTokens: data.usage.prompt_tokens,
        outputTokens: data.usage.completion_tokens,
        totalTokens: data.usage.total_tokens
      }
    : undefined;
  return { text, usage };
}

async function* parseSSEStream(stream: ReadableStream<Uint8Array>): AsyncIterable<string> {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    let nl: number;
    while ((nl = buffer.indexOf("\n")) >= 0) {
      const line = buffer.slice(0, nl).trim();
      buffer = buffer.slice(nl + 1);
      if (!line || line.startsWith(":")) continue; // skip keep-alives/comments
      if (!line.startsWith("data:")) continue;
      const data = line.slice(5).trim();
      if (data === "[DONE]") return;
      try {
        const chunk = JSON.parse(data) as OpenAIStyleResponse;
        if (chunk.error) {
          const msg = chunk.error.message || "Streaming error";
          throw new Error(msg);
        }
        const delta =
          chunk.choices?.[0]?.delta?.content ??
          chunk.choices?.[0]?.message?.content ??
          "";
        if (delta) yield delta;
      } catch {
        // ignore non-JSON payloads from heartbeats
      }
    }
  }
}

export class GrokProvider implements LLM {
  private baseUrl: string;
  private apiKey?: string;
  private modelId: string;
  private provider: "xai" | "openrouter";

  constructor() {
    const cfg = loadProfile();
    this.baseUrl = cfg.baseUrl;
    this.apiKey = cfg.apiKey;
    this.modelId = cfg.modelId;
    this.provider = cfg.provider;
  }

  // Streaming overload
  chat(messages: ChatMessage[], options: { stream: true }): AsyncIterable<string>;
  // Non-streaming overload
  chat(
    messages: ChatMessage[],
    options?: { stream?: false }
  ): Promise<{ text: string; usage?: UsageMeta }>;
  // Implementation
  chat(
    messages: ChatMessage[],
    options: { stream?: boolean } = {}
  ): AsyncIterable<string> | Promise<{ text: string; usage?: UsageMeta }> {
    const env = getEnv();
    if (!this.apiKey) {
      throw new Error(
        "No API key configured. Set GROK_API_KEY (preferred) or OPENROUTER_API_KEY in your environment or .env file."
      );
    }

    const doRequest = async (prov: "xai" | "openrouter", base: string, key: string) => {
      const res = await postOnce({
        baseUrl: base,
        apiKey: key,
        provider: prov,
        modelId: this.modelId,
        messages,
        stream: options.stream
      });

      if (!res.ok) {
        const text = await res.text().catch(() => "");
        let detail = text;
        try {
          const j = JSON.parse(text);
          detail = j?.error?.message || text || res.statusText;
        } catch {}
        throw new Error(`Provider error ${res.status}: ${detail}`);
      }
      return res;
    };

    const tryChain = async (): Promise<Response> => {
      try {
        return await doRequest(this.provider, this.baseUrl, this.apiKey!);
      } catch (err: any) {
        const msg = String(err?.message || err);
        const canFallback = this.provider === "xai" && !!env.OPENROUTER_API_KEY;
        if (canFallback) {
          return await doRequest(
            "openrouter",
            "https://openrouter.ai/api/v1/chat/completions",
            env.OPENROUTER_API_KEY!
          );
        }
        if (this.provider === "xai" && /404/.test(msg)) {
          throw new Error(
            `xAI 404. Check model "grok-code-fast-1", base URL "https://api.x.ai/v1/chat/completions", and key access to Chat + model.`
          );
        }
        throw err;
      }
    };

    if (options.stream) {
      // ✅ Return the *called* async generator (AsyncGenerator ⊆ AsyncIterable). :contentReference[oaicite:2]{index=2}
      const stream = async function* (self: GrokProvider) {
        const res = await tryChain();
        const body = res.body;
        if (!body) throw new Error("No response body for streaming request.");
        yield* parseSSEStream(body);
      }(this);
      return stream;
    } else {
      // Non-streaming: return full text + usage
      return (async () => {
        const res = await tryChain();
        const text = await res.text();
        return parseNonStream(text);
      })();
    }
  }

  static async ping(): Promise<{ model: string; reply: string; provider: string; baseUrl: string }> {
    const client = new GrokProvider();
    const resp = await client.chat(
      [
        { role: "system", content: "You are a helpful assistant." },
        { role: "user", content: "Reply with exactly: pong" }
      ],
      { stream: false }
    );
    return {
      model: client.modelId,
      reply: resp.text.trim(),
      provider: client.provider,
      baseUrl: client.baseUrl
    };
  }
}
