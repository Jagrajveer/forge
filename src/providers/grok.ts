// src/providers/grok.ts
/**
 * GrokProvider (xAI)
 * Env:
 *   XAI_API_KEY or GROK_API_KEY (required)
 *   XAI_BASE_URL or GROK_BASE_URL (host or endpoint; we normalize)
 *   XAI_MODEL or GROK_MODEL (default: grok-3)
 */

export type Role = "system" | "user" | "assistant" | "tool";

export interface ChatMessage {
  role: Role;
  content: string | object;
}

export interface UsageMeta {
  prompt_tokens?: number;
  completion_tokens?: number;
  total_tokens?: number;
  [k: string]: unknown;
}

export interface GrokOptions {
  apiKey?: string;
  baseUrl?: string;
  model?: string;
  headers?: Record<string, string>;
  temperature?: number;
  top_p?: number;
}

type NonStreamResult = { text: string; usage?: UsageMeta; raw?: any };
type ChatStream = AsyncIterable<string>;
type ChatNonStream = Promise<NonStreamResult>;
type ChatReturn = ChatStream | ChatNonStream;

class GrokProvider {
  private apiKey: string;
  public readonly baseUrl: string;   // e.g. https://api.x.ai
  private readonly chatUrl: string;  // e.g. https://api.x.ai/v1/chat/completions
  public readonly model: string;
  private headers: Record<string, string>;
  private temperature?: number;
  private top_p?: number;

  constructor(opts: GrokOptions = {}) {
    const envKey =
      opts.apiKey ??
      process.env.XAI_API_KEY ??
      process.env.GROK_API_KEY ??
      "";

    if (!envKey) {
      throw new Error(
        "Missing API key: set XAI_API_KEY (preferred) or GROK_API_KEY, or pass { apiKey } to GrokProvider."
      );
    }

    const rawBase =
      opts.baseUrl ??
      process.env.XAI_BASE_URL ??
      process.env.GROK_BASE_URL ??
      "https://api.x.ai";

    // Normalize: allow host, host + /v1, or full /v1/chat/completions
    const trimmed = rawBase.replace(/\/+$/, "");
    const normalizedHost = trimmed.replace(/\/v1(?:\/chat\/completions)?$/i, "");
    this.baseUrl = normalizedHost || "https://api.x.ai";
    this.chatUrl = `${this.baseUrl}/v1/chat/completions`;

    this.model =
      opts.model ??
      process.env.XAI_MODEL ??
      process.env.GROK_MODEL ??
      "grok-3";

    this.apiKey = envKey;
    this.headers = {
      "Content-Type": "application/json",
      Authorization: `Bearer ${this.apiKey}`,
      ...(opts.headers ?? {}),
    };

    this.temperature = opts.temperature;
    this.top_p = opts.top_p;
  }

  public static async ping(opts: GrokOptions = {}): Promise<{
    model: string;
    reply: string;
    provider: GrokProvider;
    baseUrl: string;
  }> {
    const provider = new GrokProvider(opts);
    const { text } = await provider.complete([{ role: "user", content: "ping" }]);
    return { model: provider.model, reply: text, provider, baseUrl: provider.baseUrl };
  }

  public chat(messages: ChatMessage[], options?: { stream?: false }): ChatNonStream;
  public chat(messages: ChatMessage[], options: { stream: true }): ChatStream;
  public chat(messages: ChatMessage[], options: { stream?: boolean } = {}): ChatReturn {
    if (options.stream) return this.streamResponse(this.normalizeMessages(messages));
    return this.complete(messages);
  }

  public async complete(messages: ChatMessage[]): Promise<NonStreamResult> {
    const normalized = this.normalizeMessages(messages);
    const res = await this.request(this.chatUrl, normalized, /*stream*/ false);
    const json = await this.safeJson(res);

    if (!res.ok) {
      const hint =
        res.status === 404
          ? ` (tip: check XAI_BASE_URL and XAI_MODEL; try XAI_BASE_URL=https://api.x.ai and XAI_MODEL=grok-3)`
          : "";
      const msg =
        json?.error?.message ??
        json?.message ??
        `xAI error ${res.status} ${res.statusText}${hint}`;
      throw new Error(msg);
    }

    const text = this.extractText(json);
    const usage = this.extractUsage(json);
    return { text, usage, raw: json };
  }

  private async request(
    url: string,
    messages: Array<{ role: Role; content: string }>,
    stream: boolean
  ): Promise<Response> {
    const body: Record<string, unknown> = { model: this.model, messages, stream };
    if (typeof this.temperature === "number") body.temperature = this.temperature;
    if (typeof this.top_p === "number") body.top_p = this.top_p;

    return fetch(url, {
      method: "POST",
      headers: this.headers,
      body: JSON.stringify(body),
    });
  }

  private normalizeMessages(
    messages: ChatMessage[]
  ): Array<{ role: Role; content: string }> {
    return messages.map((m) => ({
      role: m.role,
      content: typeof m.content === "string" ? m.content : JSON.stringify(m.content),
    }));
  }

  private extractText(json: any): string {
    const cc =
      json?.choices?.[0]?.message?.content ??
      json?.choices?.[0]?.delta?.content ??
      json?.choices?.[0]?.text ??
      "";
    if (typeof cc === "string") return cc;
    return Array.isArray(cc)
      ? cc.map((p: any) => (typeof p === "string" ? p : p?.text ?? p?.content ?? "")).join("")
      : "";
  }

  public extractUsage(json: any): UsageMeta | undefined {
    return json?.usage
      ? {
          prompt_tokens: json.usage.prompt_tokens,
          completion_tokens: json.usage.completion_tokens,
          total_tokens: json.usage.total_tokens,
          ...json.usage,
        }
      : undefined;
  }

  private async *streamResponse(
    messages: Array<{ role: Role; content: string }>
  ): AsyncGenerator<string, void, unknown> {
    const res = await this.request(this.chatUrl, messages, /*stream*/ true);

    if (!res.ok) {
      let errText: string | undefined;
      try {
        const j = await res.json();
        errText = j?.error?.message ?? j?.message ?? JSON.stringify(j);
      } catch {
        try { errText = await res.text(); } catch {}
      }
      const hint =
        res.status === 404
          ? ` (tip: check XAI_BASE_URL and XAI_MODEL; try XAI_BASE_URL=https://api.x.ai and XAI_MODEL=grok-3)`
          : "";
      throw new Error(`xAI streaming error ${res.status} ${res.statusText}${hint}${errText ? ` - ${errText}` : ""}`);
    }

    if (!res.body) return;

    const reader = res.body.getReader();
    const decoder = new TextDecoder("utf-8");
    let buffer = "";

    const flushEvents = function* (buf: string): Generator<string, string, void> {
      let rest = buf;
      const sep = /\r?\n\r?\n/;
      while (true) {
        const match = sep.exec(rest);
        if (!match) break;
        const idx = match.index;
        const block = rest.slice(0, idx);
        rest = rest.slice(idx + match[0].length);
        const t = block.trim();
        if (!t) continue;

        if (t.startsWith("data:")) {
          const lines = t
            .split(/\r?\n/)
            .map((l) => (l.startsWith("data:") ? l.slice(5).trimStart() : ""))
            .filter(Boolean);
          const data = lines.join("\n");
          if (data === "[DONE]") yield "__DONE__";
          else yield data;
        } else {
          yield t;
        }
      }
      return rest;
    };

    while (true) {
      const { value, done } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });

      for (const payload of flushEvents(buffer)) {
        if (payload === "__DONE__") return;

        let json: any;
        try { json = JSON.parse(payload); }
        catch { if (payload) yield payload; continue; }

        const chunk: string =
          json?.choices?.[0]?.delta?.content ??
          json?.choices?.[0]?.text ??
          json?.message?.content ??
          "";
        if (chunk) yield chunk;
      }

      const lastSep = Math.max(buffer.lastIndexOf("\n\n"), buffer.lastIndexOf("\r\n\r\n"));
      buffer = lastSep >= 0 ? buffer.slice(lastSep + 2) : buffer;
    }

    const tail = buffer.trim();
    if (tail) {
      try {
        const j = JSON.parse(tail);
        const last =
          j?.choices?.[0]?.delta?.content ?? j?.choices?.[0]?.text ?? j?.message?.content ?? "";
        if (last) yield last;
      } catch {}
    }
  }

  private async safeJson(res: Response): Promise<any> {
    try { return await res.json(); }
    catch {
      try { const t = await res.text(); return { message: t }; }
      catch { return {}; }
    }
  }
}

export default GrokProvider;
export { GrokProvider };
