import type { UsageMeta } from "../core/usage.js";

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string | object;
}

export interface ChatOptions {
  /** stream tokens as they arrive (SSE / chunked) */
  stream?: boolean;
  /** soft cap for provider */
  maxTokens?: number;
  /** sampling temperature */
  temperature?: number;
  /** hint that we want visible reasoning when available */
  reasoning?: boolean;
}

export interface LLM {
  // Streaming overload
  chat(messages: ChatMessage[], options: ChatOptions & { stream: true }): AsyncIterable<{ content: string; reasoning?: string }>;
  // Non-streaming overload (default)
  chat(
    messages: ChatMessage[],
    options?: ChatOptions & { stream?: false }
  ): Promise<{ text: string; usage?: UsageMeta; reasoning?: string }>;
}
