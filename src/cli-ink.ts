#!/usr/bin/env node
/**
 * Ink-based CLI entrypoint
 * Replaces the old REPL with a beautiful React TUI
 */
import React from "react";
import { render } from "ink";
import { App } from "./ui/App.js";

// Load environment
try {
  (await import("dotenv")).config?.();
} catch {}

// TTY detection
if (!process.stdout.isTTY) {
  console.error("Error: This command requires a TTY. Use 'forge ask' for non-interactive mode.");
  process.exit(1);
}

// Enable alternate screen buffer
process.stdout.write("\x1b[?1049h");
process.stdout.write("\x1b[?25l"); // Hide cursor

// Render the app
const { unmount, waitUntilExit } = render(React.createElement(App));

// Cleanup on exit
const cleanup = () => {
  unmount();
  process.stdout.write("\x1b[?25h"); // Show cursor
  process.stdout.write("\x1b[?1049l"); // Exit alternate screen
};

process.on("SIGINT", cleanup);
process.on("SIGTERM", cleanup);
process.on("exit", cleanup);

// Wait for exit
await waitUntilExit();
