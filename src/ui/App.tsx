/**
 * Main Ink application component
 */
import React, { useState, useEffect, useCallback } from "react";
import { Box, useApp, useInput } from "ink";
import { store } from "../state/store.js";
import { chatStream, chat } from "../llm/xai.js";
import { Header } from "./Header.js";
import { Transcript } from "./Transcript.js";
import { Input } from "./Input.js";
import { Footer } from "./Footer.js";

export const App: React.FC = () => {
  const { exit } = useApp();
  const [state, setState] = useState(store.getState());
  const [ctrlCCount, setCtrlCCount] = useState(0);

  // Subscribe to store changes
  useEffect(() => {
    const handler = () => setState(store.getState());
    store.on("change", handler);
    return () => {
      store.off("change", handler);
    };
  }, []);

  // Handle input changes with debouncing
  const handleInputChange = useCallback((value: string) => {
    store.setInput(value);
    
    // Debounced ghost completion to reduce API calls
    if (value.trim().length > 3 && !value.startsWith("/")) {
      // Clear existing timeout
      if (handleInputChange.timeoutId) {
        clearTimeout(handleInputChange.timeoutId);
      }
      
      // Set new timeout for ghost completion
      handleInputChange.timeoutId = setTimeout(() => {
        chat(
          [
            { role: "system", content: "Complete this input briefly (max 8 words):" },
            { role: "user", content: value },
          ],
          { model: state.model, temperature: 0.2, maxTokens: 32 }
        )
          .then((res) => {
            const suggestion = res.text.split("\n")[0].slice(0, 80);
            if (suggestion && suggestion.toLowerCase().startsWith(value.toLowerCase())) {
              store.setGhostSuggestion(suggestion);
            }
          })
          .catch(() => {
            // Ignore ghost completion errors
          });
      }, 300); // 300ms debounce
    } else {
      store.setGhostSuggestion("");
    }
  }, [state.model]);

  // Handle submission
  const handleSubmit = useCallback(async () => {
    const input = state.currentInput.trim();
    if (!input) return;

    // Handle slash commands
    if (input === "/exit" || input === "/quit") {
      exit();
      return;
    }

    if (input === "/help") {
      store.addMessage({
        role: "system",
        content:
          "Commands:\n" +
          "  /help - Show this help\n" +
          "  /status - Show current model and metrics\n" +
          "  /model <name> - Switch model (e.g., grok-4, grok-4-fast)\n" +
          "  /exit - Quit\n\n" +
          "Tips:\n" +
          "  - Tab to accept ghost suggestions\n" +
          "  - Esc to clear input\n" +
          "  - Ctrl+C twice to exit",
      });
      store.clearInput();
      return;
    }

    if (input === "/status") {
      store.addMessage({
        role: "system",
        content:
          `Model: ${state.model}\n` +
          `Metrics:\n` +
          `  Prompt tokens: ${state.metrics.promptTokens}\n` +
          `  Output tokens: ${state.metrics.outputTokens}\n` +
          `  Reasoning tokens: ${state.metrics.reasoningTokens}\n` +
          `  Total tokens: ${state.metrics.totalTokens}\n` +
          `  Last latency: ${state.metrics.latencyMs}ms`,
      });
      store.clearInput();
      return;
    }

    if (input.startsWith("/model ")) {
      const newModel = input.slice(7).trim();
      if (newModel) {
        store.setModel(newModel);
        store.addMessage({
          role: "system",
          content: `Switched to model: ${newModel}`,
        });
      }
      store.clearInput();
      return;
    }

    // Regular message: add to transcript and stream response
    store.addMessage({ role: "user", content: input });
    store.clearInput();
    store.setStreaming(true);
    store.setError(null);

    const messages = state.transcript
      .filter((m) => m.role !== "system")
      .map((m) => ({ role: m.role, content: m.content }));
    messages.push({ role: "user", content: input });

    // Add assistant placeholder
    store.addMessage({ role: "assistant", content: "" });

    const startTime = Date.now();
    let accumulatedContent = "";

    try {
      let lastUpdate = 0;
      const updateInterval = 50; // Update every 50ms to reduce render frequency
      
      for await (const chunk of chatStream(messages, { model: state.model, stream: true })) {
        if (chunk.delta) {
          accumulatedContent += chunk.delta;
          store.updateLastMessage(accumulatedContent);
          
          // Throttle metrics updates
          const now = Date.now();
          if (now - lastUpdate > updateInterval) {
            store.setMetrics({ latencyMs: now - startTime });
            lastUpdate = now;
          }
        }

        if (chunk.summary) {
          store.setStatusSummary(chunk.summary);
        }

        if (chunk.usage) {
          store.setMetrics({
            promptTokens: chunk.usage.prompt_tokens ?? 0,
            outputTokens: chunk.usage.completion_tokens ?? 0,
            reasoningTokens: chunk.usage.completion_tokens_details?.reasoning_tokens ?? 0,
            totalTokens: chunk.usage.total_tokens ?? 0,
            latencyMs: Date.now() - startTime,
          });
        }
      }
    } catch (error: any) {
      store.setError(error?.message || "Unknown error");
      store.addMessage({
        role: "system",
        content: `Error: ${error?.message || "Unknown error"}`,
      });
    } finally {
      store.setStreaming(false);
      store.clearStatusSummary();
    }
  }, [state.currentInput, state.transcript, state.model, exit]);

  // Tab to accept ghost
  const handleTab = useCallback(() => {
    if (state.ghostSuggestion) {
      store.setInput(state.ghostSuggestion);
      store.setGhostSuggestion("");
    }
  }, [state.ghostSuggestion]);

  // Esc to clear
  const handleEscape = useCallback(() => {
    store.clearInput();
  }, []);

  // Ctrl+C handling
  useInput((input, key) => {
    if (key.ctrl && input === "c") {
      if (ctrlCCount === 0) {
        setCtrlCCount(1);
        setTimeout(() => setCtrlCCount(0), 1000);
        store.clearInput();
      } else {
        exit();
      }
    }

    if (key.tab) {
      handleTab();
    }

    if (key.escape) {
      handleEscape();
    }
  });

  return (
    <Box flexDirection="column" height="100%">
      <Header model={state.model} />
      
      <Box flexGrow={1} flexShrink={1} overflow="hidden">
        <Transcript messages={state.transcript} />
      </Box>
      
      <Input
        value={state.currentInput}
        ghost={state.ghostSuggestion}
        onChange={handleInputChange}
        onSubmit={handleSubmit}
        onTab={handleTab}
        onEscape={handleEscape}
      />
      
      <Footer model={state.model} metrics={state.metrics} status={state.statusSummary} />
    </Box>
  );
};
