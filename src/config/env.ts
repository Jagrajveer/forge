import "dotenv/config";
import { z } from "zod";

console.log(process.env)

export const EnvSchema = z.object({
  FORGE_PROVIDER: z.enum(["xai", "openrouter"]).optional(),
  GROK_API_KEY: z.string().optional().transform(v => (v && v.trim()) || undefined),
  OPENROUTER_API_KEY: z.string().optional().transform(v => (v && v.trim()) || undefined),
  GROK_MODEL_ID: z.string().default("grok-code-fast-1"),
  GROK_BASE_URL: z.string().optional().transform(v => (v && v.trim()) || undefined),

  // optional safety/exec knobs (not enforced here yet)
  FORGE_ALLOW_DANGEROUS: z.string().optional(),
  FORGE_CMD_TIMEOUT_MS: z.string().optional(),
  FORGE_TOOL_STDIO_LIMIT: z.string().optional()
});

export type Env = z.infer<typeof EnvSchema>;

let cachedEnv: Env | null = null;

export function getEnv(): Env {
  if (cachedEnv) return cachedEnv;
  const parsed = EnvSchema.safeParse(process.env);
  if (!parsed.success) {
    const msg = parsed.error.issues.map(i => `${i.path.join(".")}: ${i.message}`).join("; ");
    throw new Error(`Invalid environment variables: ${msg}`);
  }
  cachedEnv = parsed.data;
  return cachedEnv;
}
