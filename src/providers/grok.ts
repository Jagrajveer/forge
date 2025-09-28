/* Provider adapter for Grok via OpenRouter or direct x.ai */
import { loadProfile } from "../config/profile.js";

export interface UsageMeta {
  inputTokens?: number;
  outputTokens?: number;
  costUSD?: number;
  model?: string;
}

export interface LLM {
  chat(
    messages: Array<{ role: "system" | "user" | "assistant"; content: string }>,
    options?: {
      stream?: boolean;
      maxTokens?: number;
      temperature?: number;
      reasoning?: boolean;
    }
  ): AsyncIterable<string> | Promise<{ text: string; usage?: UsageMeta }>;
}

export class GrokProvider implements LLM {
  constructor(private cfg = loadProfile()) {}

  /** Ensure base URL matches provider expectations and includes version segment when needed. */
  private normalizedBaseUrl(): string {
    let base = this.cfg.baseUrl ?? (this.cfg.provider === "openrouter"
      ? "https://openrouter.ai/api/v1"
      : "https://api.x.ai/v1");

    // Trim trailing slashes
    base = base.replace(/\/+$/, "");

    // If calling x.ai directly and /vN is missing, add /v1
    try {
      const u = new URL(base);
      const isXai = /(^|\.)x\.ai$/i.test(u.hostname);
      const hasV = /\/v\d+(\/|$)?/i.test(u.pathname);
      if (isXai && !hasV) {
        base = `${base}/v1`; // xAI uses /v1/chat/completions
      }
    } catch {
      // if not a valid URL, leave as-is
    }
    return base;
  }

  private endpoint(): string {
    const base = this.normalizedBaseUrl();
    return `${base}/chat/completions`;
  }

  private headers(): Record<string, string> {
    const h: Record<string, string> = { "Content-Type": "application/json" };
    if (this.cfg.apiKey) h["Authorization"] = `Bearer ${this.cfg.apiKey}`;
    // Extra headers are OK for OpenRouter; harmless for xAI, but we can keep them generic.
    h["HTTP-Referer"] = "https://github.com/savant-ai/forge";
    h["X-Title"] = "forge-cli";
    return h;
  }

  chat(
    messages: Array<{ role: "system" | "user" | "assistant"; content: string }>,
    options: { stream?: boolean; maxTokens?: number; temperature?: number; reasoning?: boolean } = {}
  ): AsyncIterable<string> | Promise<{ text: string; usage?: UsageMeta }> {
    const body: any = {
      model: this.cfg.model, // normalized in profile loader
      messages,
      stream: Boolean(options.stream),
      temperature: options.temperature ?? 0.3,
      max_tokens: options.maxTokens ?? 2048,
    };

    // xAI & OpenRouter both accept OpenAI-style Chat Completions; xAI streams via SSE, too. :contentReference[oaicite:1]{index=1}
    if (options.reasoning) {
      // Best-effort hint; ignored by providers that don't use it.
      body.reasoning = { effort: "medium" };
    }

    // STREAMING: return a true async generator (not a Promise)
    if (body.stream) {
      const self = this;
      return (async function* () {
        const res = await fetch(self.endpoint(), {
          method: "POST",
          headers: self.headers(),
          body: JSON.stringify(body),
        });

        if (!res.ok) {
          const txt = await res.text().catch(() => "");
          // Helpful tip for common misconfig: missing /v1 on xAI base
          if (res.status === 404) {
            throw new Error(
              `Grok request failed: 404 Not Found\n` +
              `Hint: if you're using xAI directly, the base URL must include /v1 (e.g., https://api.x.ai/v1). Response:\n${txt}`
            );
          }
          throw new Error(`Grok request failed: ${res.status} ${res.statusText}\n${txt}`);
        }

        const reader = res.body?.getReader();
        if (!reader) return;

        const decoder = new TextDecoder();
        let buf = "";

        while (true) {
          const { value, done } = await reader.read();
          if (done) break;
          buf += decoder.decode(value, { stream: true });

          // SSE lines: "data: {...}" (xAI & OpenRouter) :contentReference[oaicite:2]{index=2}
          const lines = buf.split(/\r?\n/);
          buf = lines.pop() ?? "";
          for (const raw of lines) {
            const line = raw.trim();
            if (!line.startsWith("data:")) continue;
            const payload = line.slice(5).trim();
            if (!payload) continue;
            if (payload === "[DONE]") return;
            try {
              const json = JSON.parse(payload);
              const delta =
                json.choices?.[0]?.delta?.content ??
                json.choices?.[0]?.message?.content ??
                "";
              if (delta) yield String(delta);
            } catch {
              // ignore malformed partials
            }
          }
        }

        // Flush a final complete event if it’s sitting in the buffer
        const tail = buf.trim();
        if (tail.startsWith("data:")) {
          const payload = tail.slice(5).trim();
          if (payload && payload !== "[DONE]") {
            try {
              const json = JSON.parse(payload);
              const delta =
                json.choices?.[0]?.delta?.content ??
                json.choices?.[0]?.message?.content ??
                "";
              if (delta) yield String(delta);
            } catch {}
          }
        }
      })();
    }

    // NON-STREAMING
    const doFetch = async () => {
      const res = await fetch(this.endpoint(), {
        method: "POST",
        headers: this.headers(),
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const txt = await res.text().catch(() => "");
        if (res.status === 404) {
          throw new Error(
            `Grok request failed: 404 Not Found\n` +
            `Hint: if you're using xAI directly, the base URL must include /v1 (e.g., https://api.x.ai/v1). Response:\n${txt}`
          );
        }
        throw new Error(`Grok request failed: ${res.status} ${res.statusText}\n${txt}`);
      }

      const json: any = await res.json();
      const text =
        json.choices?.[0]?.message?.content ??
        json.choices?.[0]?.delta?.content ??
        "";
      const usage: UsageMeta | undefined = json.usage
        ? {
            inputTokens: json.usage.prompt_tokens,
            outputTokens: json.usage.completion_tokens,
            costUSD: json.usage.total_cost,
            model: json.model,
          }
        : undefined;
      return { text, usage };
    };

    return doFetch();
  }
}
