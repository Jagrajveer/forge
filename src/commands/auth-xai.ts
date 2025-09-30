import { Command } from "commander";
import prompts from "prompts";
import { setXaiAuth, clearAuthForProvider, maskKey, readStoredKey } from "../config/store.js";

/** Minimal ping against xAI Chat Completions to validate a key. */
async function pingXaiKey(key: string): Promise<{ ok: boolean; text?: string; status: number }> {
  const res = await fetch("https://api.x.ai/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
    body: JSON.stringify({
      model: "grok-code-fast-1",
      messages: [{ role: "user", content: "Reply with: pong" }],
      max_tokens: 4,
    }),
  });
  if (!res.ok) return { ok: false, status: res.status, text: await res.text().catch(() => "") };
  const json = (await res.json()) as any;
  const text: string | undefined = json?.choices?.[0]?.message?.content ?? json?.choices?.[0]?.delta?.content;
  const ok = typeof text === "string" ? /pong/i.test(text) : true;
  return { ok, text, status: res.status };
}

export function registerAuthXaiCommands(program: Command) {
  const auth = program.command("auth").description("Authentication helpers (xAI)");

  auth
    .command("login")
    .description("Log in with an xAI API key (saves to .env and sets provider to xai)")
    .option("--key <value>", "Provide the API key via flag (non-interactive)")
    .action(async (opts: { key?: string }) => {
      let key = opts.key;

      if (!key) {
        const ans = await prompts({
          type: "password",
          name: "key",
          message:
            "Paste your xAI API key (xAI Console → API Keys). We will validate it and write XAI_API_KEY to .env:",
          validate: (v: string) => (v?.trim()?.length ? true : "API key cannot be empty"),
        });
        key = ans.key?.trim();
        if (!key) {
          console.error("Aborted: no key provided.");
          process.exitCode = 1;
          return;
        }
      }

      process.stdout.write("Validating key against xAI… ");
      const pong = await pingXaiKey(key);
      if (!pong.ok) {
        console.error(`\n❌ Key validation failed (HTTP ${pong.status}).`);
        if (pong.text) console.error(pong.text.slice(0, 400));
        process.exitCode = 1;
        return;
      }
      console.log("ok.");

      const { envPath, configPath } = await setXaiAuth(key);
      const masked = maskKey(key);
      console.log(
        [
          "",
          "✅ xAI auth configured!",
          `- Saved key to: ${envPath} (XAI_API_KEY=${masked})`,
          `- Updated: ${configPath} → { provider: "xai", baseUrl: "https://api.x.ai/v1", model: "grok-code-fast-1" }`,
          "",
          "Test with:",
          "  $ npx forge env doctor",
          "  $ npx forge auth info",
          "",
        ].join("\n"),
      );
    });

  auth
    .command("logout")
    .description("Remove the stored xAI key from .env")
    .action(async () => {
      await clearAuthForProvider("xai");
      console.log("Removed XAI_API_KEY from .env");
    });

  auth
    .command("info")
    .description("Show (masked) stored xAI key from .env if present")
    .action(async () => {
      const key = await readStoredKey("xai");
      console.log(`xAI key: ${maskKey(key)}`);
    });
}
