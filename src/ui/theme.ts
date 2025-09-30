/**
 * Theme configuration for the Ink TUI
 * Dark-terminal friendly palette and spacing
 */
import chalk from "chalk";

export const colors = {
  // Primary
  primary: chalk.cyan,
  secondary: chalk.blue,
  accent: chalk.magenta,
  
  // Status
  success: chalk.green,
  warning: chalk.yellow,
  error: chalk.red,
  info: chalk.blue,
  
  // UI
  border: chalk.gray,
  borderFocus: chalk.cyan,
  text: chalk.white,
  textDim: chalk.dim,
  textBold: chalk.bold,
  
  // Roles
  user: chalk.blue,
  assistant: chalk.green,
  system: chalk.gray,
};

export const symbols = {
  user: "👤",
  assistant: "🌿",
  system: "ℹ️",
  thinking: "💭",
  lightning: "⚡",
  check: "✔",
  cross: "✖",
  warn: "▲",
};

export const spacing = {
  paddingX: 1,
  paddingY: 0,
  marginX: 0,
  marginY: 0,
};

export const borders = {
  rounded: "round" as const,
  single: "single" as const,
  double: "double" as const,
};

export const layout = {
  headerHeight: 1,
  inputHeight: 3,
  footerHeight: 2,
  minWidth: 40,
};
