/**
 * Enhanced REPL with persistent header, scrollable transcript, and visible cursor
 * Implements PLAN → DESIGN → EXECUTE agent workflow
 */
import * as fs from "node:fs";
import * as path from "node:path";
import * as readline from "node:readline";
import ansiEscapes from "ansi-escapes";
import chalk from "chalk";
import { chatStream } from "../llm/xai.js";
import type { XAIMessage } from "../llm/xai.js";
import { ContextService } from "./context.js";

interface Message {
  role: "user" | "assistant" | "system";
  content: string;
  timestamp: number;
}

interface Metrics {
  model: string;
  ctx: number;
  prompt: number;
  output: number;
  reason: number;
  latencyMs: number;
}

interface ThinkingStatus {
  now: string;
  next: string;
}

interface ScrollState {
  offset: number;
  maxOffset: number;
}

const CONFIG_DIR = path.join(process.cwd(), ".forge");
const HISTORY_FILE = path.join(CONFIG_DIR, "repl_history.txt");

export class EnhancedREPL {
  private transcript: Message[] = [];
  private inputBuffer = "";
  private ghostSuggestion = "";
  private commandHistory: string[] = [];
  private historyIndex = -1;
  private metrics: Metrics = {
    model: "grok-4-fast",
    ctx: 0,
    prompt: 0,
    output: 0,
    reason: 0,
    latencyMs: 0,
  };
  private thinking: ThinkingStatus = { now: "", next: "" };
  private scroll: ScrollState = { offset: 0, maxOffset: 0 };
  private rl: readline.Interface | null = null;
  private lastRenderTime = 0;
  private readonly FPS_LIMIT = 12;
  private lastFrameHash = "";
  private isStreaming = false;
  private contextService: ContextService;

  constructor(private isTTY: boolean = process.stdout.isTTY || false) {
    this.loadHistory();
    this.loadModel();
    this.contextService = new ContextService();
  }

  private loadHistory(): void {
    try {
      if (fs.existsSync(HISTORY_FILE)) {
        const content = fs.readFileSync(HISTORY_FILE, "utf8");
        this.commandHistory = content.split("\n").filter(Boolean);
      }
    } catch {}
  }

  private saveHistory(): void {
    try {
      if (!fs.existsSync(CONFIG_DIR)) {
        fs.mkdirSync(CONFIG_DIR, { recursive: true });
      }
      fs.writeFileSync(HISTORY_FILE, this.commandHistory.join("\n"));
    } catch {}
  }

  private loadModel(): void {
    try {
      const modelFile = path.join(CONFIG_DIR, "model.json");
      if (fs.existsSync(modelFile)) {
        const data = JSON.parse(fs.readFileSync(modelFile, "utf8"));
        this.metrics.model = data.model || "grok-4-fast";
      }
    } catch {}
  }

  private saveModel(): void {
    try {
      if (!fs.existsSync(CONFIG_DIR)) {
        fs.mkdirSync(CONFIG_DIR, { recursive: true });
      }
      const modelFile = path.join(CONFIG_DIR, "model.json");
      fs.writeFileSync(modelFile, JSON.stringify({ model: this.metrics.model }));
    } catch {}
  }

  /**
   * Render the complete UI (throttled to FPS_LIMIT)
   */
  private render(): void {
    const now = Date.now();
    const frameDelta = now - this.lastRenderTime;
    const minFrameTime = 1000 / this.FPS_LIMIT;

    if (frameDelta < minFrameTime) return;

    const frame = this.buildFrame();
    const frameHash = this.hashFrame(frame);

    // Dedupe: only render if changed
    if (frameHash === this.lastFrameHash) return;

    this.lastFrameHash = frameHash;
    this.lastRenderTime = now;

    if (this.isTTY) {
      // Clear and redraw
      process.stdout.write(ansiEscapes.clearScreen);
      process.stdout.write(ansiEscapes.cursorTo(0, 0));
      process.stdout.write(frame);
    } else {
      // Non-TTY: just append
      process.stdout.write(frame + "\n");
    }
  }

  private buildFrame(): string {
    const lines: string[] = [];
    const termWidth = (process.stdout as any).columns || 80;
    const termHeight = (process.stdout as any).rows || 24;

    // 1. PERSISTENT HEADER (always visible)
    lines.push(this.renderHeader());
    lines.push(chalk.dim("─".repeat(termWidth)));

    // 2. SCROLLABLE TRANSCRIPT
    const transcriptHeight = termHeight - 8; // Reserve space for header, input, footer
    const transcriptLines = this.renderTranscript(transcriptHeight);
    lines.push(...transcriptLines);

    // 3. INPUT FIELD (rounded border, focus state)
    lines.push(chalk.dim("─".repeat(termWidth)));
    lines.push(this.renderInput());

    // 4. STICKY FOOTER (metrics + thinking)
    lines.push(chalk.dim("─".repeat(termWidth)));
    lines.push(this.renderFooter());

    // 5. THINKING LANE (replaces in place)
    if (this.thinking.now || this.thinking.next) {
      lines.push(this.renderThinking());
    }

    return lines.join("\n");
  }

  private renderHeader(): string {
    return [
      chalk.bold.cyan("💬 forge"),
      chalk.dim(" | "),
      chalk.dim("/help /status /model /exit"),
      chalk.dim(" | "),
      chalk.magenta(`[${this.metrics.model}]`),
    ].join("");
  }

  private renderTranscript(maxLines: number): string[] {
    const lines: string[] = [];

    if (this.transcript.length === 0) {
      lines.push(chalk.dim("  Start a conversation..."));
      return lines;
    }

    // Render messages with scroll offset
    const visibleMessages = this.transcript.slice(
      Math.max(0, this.transcript.length - maxLines - this.scroll.offset)
    );

    for (const msg of visibleMessages) {
      if (msg.role === "user") {
        lines.push(chalk.blue.bold("👤 You:"));
        lines.push(`  ${msg.content}`);
      } else if (msg.role === "assistant") {
        lines.push(chalk.green.bold("🌿 Assistant:"));
        lines.push(`  ${msg.content}`);
      } else {
        lines.push(chalk.dim(`ℹ️  ${msg.content}`));
      }
      lines.push(""); // spacing
    }

    // Update max scroll offset
    this.scroll.maxOffset = Math.max(0, this.transcript.length - maxLines);

    return lines.slice(0, maxLines);
  }

  private renderInput(): string {
    const prompt = chalk.gray("> ");
    const input = this.inputBuffer;
    const ghost = this.ghostSuggestion && this.ghostSuggestion.startsWith(input)
      ? chalk.dim(this.ghostSuggestion.slice(input.length))
      : "";

    return `╭─ Input ${"─".repeat(60)}╮\n│ ${prompt}${input}${ghost}${" ".repeat(60)}│\n╰${"─".repeat(70)}╯`;
  }

  private renderFooter(): string {
    const parts: string[] = [];
    parts.push(chalk.yellow("⚡"));
    parts.push(chalk.white(this.metrics.model));
    parts.push(chalk.dim("|"));
    parts.push(chalk.dim("ctx"), this.metrics.ctx.toString());
    parts.push(chalk.dim("|"));
    parts.push(chalk.dim("prompt"), this.metrics.prompt.toString());
    parts.push(chalk.dim("|"));
    parts.push(chalk.dim("out"), this.metrics.output.toString());
    parts.push(chalk.dim("|"));
    parts.push(chalk.dim("reason"), this.metrics.reason.toString());
    parts.push(chalk.dim("|"));
    parts.push(`${this.metrics.latencyMs}ms`);

    // Tiny bars
    const maxTokens = 100000;
    const bar = this.renderBar(this.metrics.ctx, maxTokens, 10);
    parts.push(chalk.dim("|"));
    parts.push(bar);

    return parts.join(" ");
  }

  private renderBar(value: number, max: number, width: number): string {
    const filled = Math.round((value / max) * width);
    return chalk.cyan("█".repeat(filled)) + chalk.dim("░".repeat(width - filled));
  }

  private renderThinking(): string {
    const lines: string[] = [];
    if (this.thinking.now) {
      lines.push(chalk.dim("💭 Now: ") + chalk.cyan(this.thinking.now));
    }
    if (this.thinking.next) {
      lines.push(chalk.dim("   Next: ") + chalk.dim(this.thinking.next));
    }
    return lines.join("\n");
  }

  private hashFrame(frame: string): string {
    // Simple hash for frame deduplication
    let hash = 0;
    for (let i = 0; i < frame.length; i++) {
      hash = (hash << 5) - hash + frame.charCodeAt(i);
      hash |= 0;
    }
    return hash.toString();
  }

  /**
   * Handle slash commands
   */
  private async handleCommand(command: string): Promise<boolean> {
    if (command === "/exit" || command === "/quit") {
      return true; // Signal exit
    }

    if (command === "/help") {
      this.addMessage({
        role: "system",
        content:
          "Commands:\n" +
          "  /help - Show this help\n" +
          "  /status - Show metrics\n" +
          "  /model <name> - Switch model\n" +
          "  /context <query> - Get context for query\n" +
          "  /exit - Quit\n" +
          "\n" +
          "Shortcuts:\n" +
          "  Tab - Accept ghost suggestion\n" +
          "  Esc - Clear input\n" +
          "  Wheel/PgUp/PgDn - Scroll transcript\n" +
          "  Up/Down - Command history (when input non-empty)\n" +
          "  Alt+Up/Alt+Down - Force history navigation",
      });
      return false;
    }

    if (command === "/status") {
      const stats = await this.contextService.getStats();
      this.addMessage({
        role: "system",
        content:
          `Model: ${this.metrics.model}\n` +
          `Context: ${this.metrics.ctx} tokens\n` +
          `Prompt: ${this.metrics.prompt} tokens\n` +
          `Output: ${this.metrics.output} tokens\n` +
          `Reasoning: ${this.metrics.reason} tokens\n` +
          `Last latency: ${this.metrics.latencyMs}ms\n\n` +
          `RAG Stats:\n` +
          `  Files: ${stats.ragStats.totalFiles}\n` +
          `  Chunks: ${stats.ragStats.totalChunks}\n` +
          `  Size: ${Math.round(stats.ragStats.totalSize / 1024)}KB\n\n` +
          `MCP Status:\n` +
          `  Servers: ${stats.connectedServers}/${stats.totalServers} connected`,
      });
      return false;
    }

    if (command.startsWith("/context ")) {
      const query = command.slice(9).trim();
      if (!query) {
        this.addMessage({
          role: "system",
          content: "Usage: /context <query>",
        });
        return false;
      }

      try {
        const contextResult = await this.contextService.getContext(query);
        const contextDisplay = this.contextService.formatContextForDisplay(contextResult);
        
        this.addMessage({
          role: "system",
          content: `Context for "${query}":\n\n${contextDisplay}`,
        });
      } catch (error) {
        this.addMessage({
          role: "system",
          content: `Failed to get context: ${error}`,
        });
      }
      return false;
    }

    if (command.startsWith("/model ")) {
      const newModel = command.slice(7).trim();
      if (newModel) {
        this.metrics.model = newModel;
        this.saveModel();
        this.addMessage({ role: "system", content: `Switched to model: ${newModel}` });
      }
      return false;
    }

    return false;
  }

  /**
   * Add message to transcript
   */
  private addMessage(msg: Omit<Message, "timestamp">): void {
    this.transcript.push({
      ...msg,
      timestamp: Date.now(),
    });
    // Auto-scroll to bottom
    this.scroll.offset = 0;
  }

  /**
   * Stream chat response
   */
  private async streamResponse(userMessage: string): Promise<void> {
    this.isStreaming = true;
    this.thinking.now = "Getting context";
    this.thinking.next = "Generating response";

    // Get intelligent context
    let context = "";
    try {
      const contextResult = await this.contextService.getContext(userMessage);
      context = this.contextService.formatContextForLLM(contextResult);
      
      if (context) {
        this.thinking.now = "Context retrieved";
        this.thinking.next = "Generating response";
        this.render();
      }
    } catch (error) {
      console.warn(chalk.yellow(`Context retrieval failed: ${error}`));
    }

    this.thinking.now = "Generating response";
    this.thinking.next = "";

    const messages: XAIMessage[] = this.transcript
      .filter((m) => m.role !== "system")
      .map((m) => ({ role: m.role, content: m.content }));

    // Add context as system message if available
    if (context) {
      messages.unshift({ role: "system", content: context });
    }

    messages.push({ role: "user", content: userMessage });

    const startTime = Date.now();
    let accumulated = "";

    // Add placeholder for assistant message
    this.addMessage({ role: "assistant", content: "" });

    try {
      const stream = chatStream(messages, { model: this.metrics.model, stream: true });

      for await (const chunk of stream) {
        if (chunk.delta) {
          accumulated += chunk.delta;
          // Update last message
          const lastIdx = this.transcript.length - 1;
          this.transcript[lastIdx].content = accumulated;
          this.metrics.latencyMs = Date.now() - startTime;
          this.render();
        }

        if (chunk.summary) {
          this.thinking.now = chunk.summary.current || "";
          this.thinking.next = chunk.summary.next || "";
        }

        if (chunk.usage) {
          this.metrics.prompt = chunk.usage.prompt_tokens || 0;
          this.metrics.output = chunk.usage.completion_tokens || 0;
          this.metrics.reason =
            chunk.usage.completion_tokens_details?.reasoning_tokens || 0;
          this.metrics.ctx = this.metrics.prompt + this.metrics.output + this.metrics.reason;
        }
      }
    } catch (error: any) {
      this.addMessage({ role: "system", content: `Error: ${error.message}` });
    } finally {
      this.isStreaming = false;
      this.thinking.now = "";
      this.thinking.next = "";
      this.render();
    }
  }

  /**
   * Start the REPL
   */
  async start(): Promise<void> {
    if (this.isTTY) {
      // Enable alternate screen, bracketed paste, show cursor
      process.stdout.write(ansiEscapes.enterAlternativeScreen);
      process.stdout.write("\x1b[?2004h"); // Bracketed paste
      process.stdout.write(ansiEscapes.cursorShow);
    }

    // Initial render
    this.render();

    // Setup readline
    this.rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
      terminal: this.isTTY,
      prompt: "",
    });

    readline.emitKeypressEvents(process.stdin);
    if (process.stdin.isTTY) {
      process.stdin.setRawMode(true);
    }

    // Handle keypresses
    process.stdin.on("keypress", async (str, key: any) => {
      await this.handleKeypress(str, key);
    });

    // Keep process alive
    await new Promise<void>((resolve) => {
      this.rl!.on("close", () => resolve());
    });

    await this.cleanup();
  }

  private async handleKeypress(str: string, key: any): Promise<void> {
    // Ctrl+C
    if (key.ctrl && key.name === "c") {
      await this.cleanup();
      process.exit(0);
    }

    // Enter
    if (key.name === "return") {
      await this.handleSubmit();
      return;
    }

    // Tab - accept ghost
    if (key.name === "tab") {
      if (this.ghostSuggestion) {
        this.inputBuffer = this.ghostSuggestion;
        this.ghostSuggestion = "";
      }
      this.render();
      return;
    }

    // Escape - clear input
    if (key.name === "escape") {
      this.inputBuffer = "";
      this.ghostSuggestion = "";
      this.render();
      return;
    }

    // Backspace
    if (key.name === "backspace") {
      this.inputBuffer = this.inputBuffer.slice(0, -1);
      this.render();
      return;
    }

    // Up/Down - command history (only if input non-empty or Alt pressed)
    if (key.name === "up" && (key.meta || this.inputBuffer.length > 0)) {
      this.navigateHistory(-1);
      return;
    }

    if (key.name === "down" && (key.meta || this.inputBuffer.length > 0)) {
      this.navigateHistory(1);
      return;
    }

    // PgUp/PgDn - scroll transcript
    if (key.name === "pageup") {
      this.scroll.offset = Math.min(this.scroll.offset + 5, this.scroll.maxOffset);
      this.render();
      return;
    }

    if (key.name === "pagedown") {
      this.scroll.offset = Math.max(this.scroll.offset - 5, 0);
      this.render();
      return;
    }

    // Regular character input
    if (str && str.length === 1 && !key.ctrl && !key.meta) {
      this.inputBuffer += str;
      this.render();
    }
  }

  private navigateHistory(direction: number): void {
    if (this.commandHistory.length === 0) return;

    this.historyIndex += direction;
    this.historyIndex = Math.max(-1, Math.min(this.historyIndex, this.commandHistory.length - 1));

    if (this.historyIndex === -1) {
      this.inputBuffer = "";
    } else {
      this.inputBuffer = this.commandHistory[this.commandHistory.length - 1 - this.historyIndex];
    }

    this.render();
  }

  private async handleSubmit(): Promise<void> {
    const input = this.inputBuffer.trim();
    if (!input) return;

    // Save to history
    this.commandHistory.push(input);
    this.saveHistory();
    this.historyIndex = -1;

    // Clear input
    this.inputBuffer = "";
    this.ghostSuggestion = "";

    // Check for slash command
    if (input.startsWith("/")) {
      const shouldExit = await this.handleCommand(input);
      if (shouldExit) {
        await this.cleanup();
        process.exit(0);
      }
      this.render();
      return;
    }

    // Add user message
    this.addMessage({ role: "user", content: input });
    this.render();

    // Stream response
    await this.streamResponse(input);
  }

  private async cleanup(): Promise<void> {
    if (this.isTTY) {
      process.stdout.write("\x1b[?2004l"); // Disable bracketed paste
      process.stdout.write(ansiEscapes.exitAlternativeScreen);
      process.stdout.write(ansiEscapes.cursorShow);
    }
    
    // Close context service
    await this.contextService.close();
  }
}

/**
 * Start enhanced REPL
 */
export async function startEnhancedREPL(): Promise<void> {
  const repl = new EnhancedREPL();
  await repl.start();
}
