import { z } from "zod";

/** Discriminated union for tool actions the model can request. */
export const Action = z.discriminatedUnion("tool", [
  z.object({ tool: z.literal("open_file"), path: z.string() }),
  z.object({
    tool: z.literal("run"),
    cmd: z.string(),
    timeoutSec: z.number().int().positive().optional(),
  }),
  z.object({
    tool: z.literal("apply_patch"),
    path: z.string(),
    patch: z.string(),
  }),
  z.object({
    tool: z.literal("write_file"),
    path: z.string(),
    content: z.string(),
  }),
  z.object({
    tool: z.literal("git"),
    subtool: z.string(),
    args: z.record(z.any()).optional(),
  }),
  z.object({
    tool: z.literal("npm"),
    subtool: z.string(),
    args: z.record(z.any()).optional(),
  }),
  z.object({
    tool: z.literal("docker"),
    subtool: z.string(),
    args: z.record(z.any()).optional(),
  }),
  z.object({
    tool: z.literal("search"),
    subtool: z.string(),
    args: z.record(z.any()).optional(),
  }),
]);

/** Contract the model streams back (optionally inside ```json fences). */
export const ModelJSON = z.object({
  plan: z.array(z.string()).default([]),
  rationale: z.string().optional(),
  actions: z.array(Action).default([]),
  message_markdown: z.string().optional(),
});

export type ModelJSONT = z.infer<typeof ModelJSON>;

/** Parse the model output into the structured contract, with helpful errors. */
export function parseModelJSON(input: string): ModelJSONT {
  const json = extractJsonObject(input);
  const parsed = ModelJSON.safeParse(json);
  if (!parsed.success) {
    const err = parsed.error.issues.map(i => `${i.path.join(".")}: ${i.message}`).join("; ");
    throw new Error(`Model JSON did not match schema: ${err}`);
  }
  return parsed.data;
}

/** Accept raw JSON or a fenced ```json block; choose the last well-formed object. */
export function extractJsonObject(text: string): unknown {
  const fenceMatch = Array.from(text.matchAll(/```json\s*([\s\S]*?)\s*```/g)).map(m => m[1]);
  const candidates = fenceMatch.length ? fenceMatch : [text];
  let lastGood: unknown = {};
  for (const c of candidates) {
    try {
      lastGood = JSON.parse(c);
    } catch {
      // ignore malformed candidates
    }
  }
  return lastGood;
}
