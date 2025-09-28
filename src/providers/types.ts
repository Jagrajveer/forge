import type { UsageMeta } from "../core/usage.js";

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string | object;
}

export interface LLM {
  // Streaming overload
  chat(messages: ChatMessage[], options: { stream: true }): AsyncIterable<string>;
  // Non-streaming overload (default)
  chat(
    messages: ChatMessage[],
    options?: { stream?: false }
  ): Promise<{ text: string; usage?: UsageMeta }>;
}
