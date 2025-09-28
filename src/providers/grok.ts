// src/providers/grok.ts
/**
 * GrokProvider
 * ------------
 * Lightweight wrapper around an xAI Grok-compatible Chat Completions API.
 * - Node 20+: uses global fetch + WHATWG streams
 * - Supports non-streaming and streaming responses
 * - Streaming returns an AsyncGenerator<string> (an AsyncIterable)
 *
 * Env vars supported:
 *   - GROK_API_KEY or XAI_API_KEY
 *   - GROK_BASE_URL (default: https://api.x.ai/v1/chat/completions)
 *   - GROK_MODEL   (default: grok-2-latest)
 */

export type Role = "system" | "user" | "assistant" | "tool";

export interface ChatMessage {
  role: Role;
  // Accept string or a structured object (we'll stringify objects)
  content: string | object;
}

export interface UsageMeta {
  prompt_tokens?: number;
  completion_tokens?: number;
  total_tokens?: number;
  // allow provider-specific fields
  [k: string]: unknown;
}

export interface GrokOptions {
  apiKey?: string;
  baseUrl?: string;
  model?: string;
  headers?: Record<string, string>;
  // Optional: temperature, top_p, etc.
  temperature?: number;
  top_p?: number;
}

type NonStreamResult = {
  text: string;
  usage?: UsageMeta;
  raw?: any;
};

type ChatStream = AsyncIterable<string>;
type ChatNonStream = Promise<NonStreamResult>;
type ChatReturn = ChatStream | ChatNonStream;

class GrokProvider {
  private apiKey: string;
  public readonly baseUrl: string;
  public readonly model: string;
  private headers: Record<string, string>;
  private temperature?: number;
  private top_p?: number;

  constructor(opts: GrokOptions = {}) {
    const envKey =
      opts.apiKey ??
      process.env.GROK_API_KEY ??
      process.env.XAI_API_KEY ??
      "";

    if (!envKey) {
      throw new Error(
        "Missing API key: set GROK_API_KEY or XAI_API_KEY, or pass { apiKey } to GrokProvider."
      );
    }

    this.apiKey = envKey;
    this.baseUrl =
      opts.baseUrl ??
      process.env.GROK_BASE_URL ??
      "https://api.x.ai/v1/chat/completions";
    this.model = opts.model ?? process.env.GROK_MODEL ?? "grok-2-latest";
    this.headers = {
      "Content-Type": "application/json",
      Authorization: `Bearer ${this.apiKey}`,
      ...(opts.headers ?? {}),
    };

    this.temperature = opts.temperature;
    this.top_p = opts.top_p;
  }

  /**
   * Static ping helper to satisfy CLI usage:
   * const { model, reply, provider, baseUrl } = await GrokProvider.ping();
   */
  public static async ping(opts: GrokOptions = {}): Promise<{
    model: string;
    reply: string;
    provider: GrokProvider;
    baseUrl: string;
  }> {
    const provider = new GrokProvider(opts);
    const { text } = await provider.complete([{ role: "user", content: "ping" }]);
    return {
      model: provider.model,
      reply: text,
      provider,
      baseUrl: provider.baseUrl,
    };
  }

  /**
   * Overloads so stream=true returns an AsyncIterable (usable in `for await`),
   * while stream=false (or omitted) returns a Promise with the full result.
   */
  public chat(messages: ChatMessage[], options?: { stream?: false }): ChatNonStream;
  public chat(messages: ChatMessage[], options: { stream: true }): ChatStream;
  public chat(messages: ChatMessage[], options: { stream?: boolean } = {}): ChatReturn {
    // NOTE: not async, so we can return the AsyncIterable directly for streaming.
    if (options.stream) {
      const normalized = this.normalizeMessages(messages);
      return this.streamResponse(normalized);
    }
    return this.complete(messages); // Promise<NonStreamResult>
  }

  /**
   * Convenience method for non-streaming completion.
   */
  public async complete(messages: ChatMessage[]): Promise<NonStreamResult> {
    const normalized = this.normalizeMessages(messages);
    const res = await this.request(normalized, /*stream*/ false);
    const json = await this.safeJson(res);

    if (!res.ok) {
      const msg =
        json?.error?.message ??
        json?.message ??
        `Grok API error: ${res.status} ${res.statusText}`;
      throw new Error(msg);
    }

    const text = this.extractText(json);
    const usage = this.extractUsage(json);
    return { text, usage, raw: json };
  }

  /**
   * Internal: perform the POST request to the chat completions endpoint.
   */
  private async request(
    messages: Array<{ role: Role; content: string }>,
    stream: boolean
  ): Promise<Response> {
    const body: Record<string, unknown> = {
      model: this.model,
      messages,
      stream,
    };

    if (typeof this.temperature === "number") body.temperature = this.temperature;
    if (typeof this.top_p === "number") body.top_p = this.top_p;

    return fetch(this.baseUrl, {
      method: "POST",
      headers: this.headers,
      body: JSON.stringify(body),
    });
  }

  /**
   * Internal: normalize message content to strings for the API.
   */
  private normalizeMessages(
    messages: ChatMessage[]
  ): Array<{ role: Role; content: string }> {
    return messages.map((m) => ({
      role: m.role,
      content:
        typeof m.content === "string" ? m.content : JSON.stringify(m.content),
    }));
  }

  /**
   * Internal: extract text in a provider-tolerant way.
   * Supports both Chat Completions ("message.content") and
   * legacy text ("choices[0].text") shapes.
   */
  private extractText(json: any): string {
    // Chat Completions style
    const cc =
      json?.choices?.[0]?.message?.content ??
      json?.choices?.[0]?.delta?.content ??
      json?.choices?.[0]?.text ??
      "";

    if (typeof cc === "string") return cc;

    // If provider sent content as array (e.g., tool messages), flatten text parts
    if (Array.isArray(cc)) {
      return cc
        .map((part) =>
          typeof part === "string" ? part : part?.text ?? part?.content ?? ""
        )
        .join("");
    }
    return "";
  }

  /**
   * Internal: extract usage in a tolerant way.
   */
  public extractUsage(json: any): UsageMeta | undefined {
    const usage: UsageMeta | undefined = json?.usage
      ? {
          prompt_tokens: json.usage.prompt_tokens,
          completion_tokens: json.usage.completion_tokens,
          total_tokens: json.usage.total_tokens,
          ...json.usage,
        }
      : undefined;
    return usage;
  }

  /**
   * Streaming path: returns an AsyncGenerator that yields content chunks.
   * This uses an SSE-style parser tolerant to different shapes:
   * - { choices: [{ delta: { content: "..." } }] }
   * - { choices: [{ text: "..." }] }
   * - { message: { content: "..." } }
   */
  private async *streamResponse(
    messages: Array<{ role: Role; content: string }>
  ): AsyncGenerator<string, void, unknown> {
    const res = await this.request(messages, /*stream*/ true);

    // If the server returns an error, surface it (attempt JSON first).
    if (!res.ok) {
      let errText: string | undefined;
      try {
        const json = await res.json();
        errText = json?.error?.message ?? json?.message ?? JSON.stringify(json);
      } catch {
        try {
          errText = await res.text();
        } catch {
          /* noop */
        }
      }
      throw new Error(
        `Grok API streaming error: ${res.status} ${res.statusText}${
          errText ? ` - ${errText}` : ""
        }`
      );
    }

    if (!res.body) return;

    const reader = res.body.getReader();
    const decoder = new TextDecoder("utf-8");
    let buffer = "";

    const flushEvents = function* (buf: string): Generator<string, string, void> {
      // Split on double newlines (SSE event boundary) but also handle NDJSON/newline chunks.
      let rest = buf;
      const sep = /\r?\n\r?\n/;
      while (true) {
        const match = sep.exec(rest);
        if (!match) break;

        const idx = match.index;
        const eventBlock = rest.slice(0, idx);
        rest = rest.slice(idx + match[0].length);

        const maybe = eventBlock.trim();
        if (!maybe) continue;

        // If it looks like SSE with data: lines
        if (maybe.startsWith("data:")) {
          const lines = maybe
            .split(/\r?\n/)
            .map((l) => (l.startsWith("data:") ? l.slice(5).trimStart() : ""))
            .filter(Boolean);

          const dataPayload = lines.join("\n");

          if (dataPayload === "[DONE]") {
            yield "__DONE__";
            continue;
          }

          yield dataPayload;
        } else {
          // Not SSE; maybe NDJSON or plain JSON blob
          yield maybe;
        }
      }
      return rest;
    };

    while (true) {
      const { value, done } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });

      // Try to flush complete events as they arrive
      for (const payload of flushEvents(buffer)) {
        if (payload === "__DONE__") {
          return; // graceful end of stream
        }

        // Each payload should be a JSON chunk (SSE "data:" line or NDJSON)
        let json: any;
        try {
          json = JSON.parse(payload);
        } catch {
          if (payload) yield payload; // raw text fallback
          continue;
        }

        // Extract chunked content in a tolerant way
        const chunk: string =
          json?.choices?.[0]?.delta?.content ??
          json?.choices?.[0]?.text ??
          json?.message?.content ??
          "";

        if (chunk) yield chunk;
      }

      // Keep only trailing partial data (if any)
      const lastSepIndex =
        Math.max(buffer.lastIndexOf("\n\n"), buffer.lastIndexOf("\r\n\r\n"));
      buffer = lastSepIndex >= 0 ? buffer.slice(lastSepIndex + 2) : buffer;
    }

    // Final attempt on any trailing JSON
    const tail = buffer.trim();
    if (tail) {
      try {
        const json = JSON.parse(tail);
        const last =
          json?.choices?.[0]?.delta?.content ??
          json?.choices?.[0]?.text ??
          json?.message?.content ??
          "";
        if (last) yield last;
      } catch {
        /* ignore */
      }
    }
  }

  /**
   * Safe JSON parse for fetch Response.
   */
  private async safeJson(res: Response): Promise<any> {
    try {
      return await res.json();
    } catch {
      try {
        const t = await res.text();
        return { message: t };
      } catch {
        return {};
      }
    }
  }
}

export default GrokProvider;
export { GrokProvider };
