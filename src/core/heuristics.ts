// Minimal, conservative intent heuristics for obvious user asks.
// Only triggers when the model produced no actions.
// We intentionally support a tiny surface area to avoid surprises.

import type { ToolCall } from "./tools/registry.js";

function extractFileName(text: string): string | undefined {
  // Matches:
  // - create a file named test.txt
  // - create new file "test.txt"
  // - make file 'test.txt'
  // - touch file test.txt
  const rx =
    /\b(?:create|make|touch)\s+(?:a|an|the)?\s*(?:new\s+)?file(?:\s+(?:named|called))?\s+(?:"([^"]+)"|'([^']+)'|([^\s"']+))/i;
  const m = text.match(rx);
  if (!m) return undefined;
  return m[1] || m[2] || m[3];
}

function extractInlineContent(text: string): string | undefined {
  // Matches:
  // - with content "hello"
  // - with text 'hello'
  // - containing "hello world"
  const rx =
    /\b(?:with\s+(?:content|text)|containing)\s+(?:"([^"]+)"|'([^']+)'|(.+))$/i;
  const m = text.match(rx);
  if (!m) return undefined;
  const raw = m[1] || m[2] || m[3];
  return (raw ?? "").trim();
}

export function inferToolCallsFromUser(text: string): ToolCall[] {
  const t = text.trim();
  const name = extractFileName(t);
  if (name) {
    const content = extractInlineContent(t) ?? "";
    return [
      {
        tool: "write_file",
        args: { path: name, content },
      },
    ];
  }
  return [];
}
