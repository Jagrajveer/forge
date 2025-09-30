/**
 * Minimal global state store for REPL
 * Uses event emitter pattern for reactive updates
 */
import { EventEmitter } from "node:events";

export interface Message {
  role: "user" | "assistant" | "system";
  content: string;
  timestamp: number;
}

export interface Metrics {
  promptTokens: number;
  outputTokens: number;
  reasoningTokens: number;
  totalTokens: number;
  latencyMs: number;
}

export interface StatusSummary {
  current: string;
  next: string;
}

export interface StoreState {
  transcript: Message[];
  model: string;
  currentInput: string;
  ghostSuggestion: string;
  metrics: Metrics;
  statusSummary: StatusSummary;
  isStreaming: boolean;
  error: string | null;
}

class Store extends EventEmitter {
  private state: StoreState = {
    transcript: [],
    model: "grok-4-fast",
    currentInput: "",
    ghostSuggestion: "",
    metrics: {
      promptTokens: 0,
      outputTokens: 0,
      reasoningTokens: 0,
      totalTokens: 0,
      latencyMs: 0,
    },
    statusSummary: {
      current: "",
      next: "",
    },
    isStreaming: false,
    error: null,
  };

  getState(): Readonly<StoreState> {
    return { ...this.state };
  }

  setModel(model: string) {
    this.state.model = model;
    this.emit("change");
  }

  setInput(input: string) {
    this.state.currentInput = input;
    this.emit("change");
  }

  setGhostSuggestion(suggestion: string) {
    this.state.ghostSuggestion = suggestion;
    this.emit("change");
  }

  addMessage(message: Omit<Message, "timestamp">) {
    this.state.transcript.push({
      ...message,
      timestamp: Date.now(),
    });
    this.emit("change");
  }

  updateLastMessage(content: string) {
    if (this.state.transcript.length > 0) {
      const last = this.state.transcript[this.state.transcript.length - 1];
      last.content = content;
      this.emit("change");
    }
  }

  setMetrics(metrics: Partial<Metrics>) {
    this.state.metrics = { ...this.state.metrics, ...metrics };
    this.emit("change");
  }

  setStatusSummary(summary: Partial<StatusSummary>) {
    this.state.statusSummary = { ...this.state.statusSummary, ...summary };
    this.emit("change");
  }

  clearStatusSummary() {
    this.state.statusSummary = { current: "", next: "" };
    this.emit("change");
  }

  setStreaming(isStreaming: boolean) {
    this.state.isStreaming = isStreaming;
    if (!isStreaming) {
      this.clearStatusSummary();
    }
    this.emit("change");
  }

  setError(error: string | null) {
    this.state.error = error;
    this.emit("change");
  }

  clearInput() {
    this.state.currentInput = "";
    this.state.ghostSuggestion = "";
    this.emit("change");
  }

  reset() {
    this.state = {
      transcript: [],
      model: this.state.model, // Keep model
      currentInput: "",
      ghostSuggestion: "",
      metrics: {
        promptTokens: 0,
        outputTokens: 0,
        reasoningTokens: 0,
        totalTokens: 0,
        latencyMs: 0,
      },
      statusSummary: { current: "", next: "" },
      isStreaming: false,
      error: null,
    };
    this.emit("change");
  }
}

export const store = new Store();
