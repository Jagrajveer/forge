import * as readline from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";

/**
 * Ask a yes/no question in the terminal and resolve to true/false.
 * Uses native readline (promises) to avoid nested interactive libraries.
 */
export async function confirmYN(message: string, defaultYes = false): Promise<boolean> {
  const rl = readline.createInterface({ input, output });
  const suffix = defaultYes ? " [Y/n] " : " [y/N] ";
  try {
    const ans = (await rl.question(`${message}${suffix}`)).trim().toLowerCase();
    if (!ans) return defaultYes;
    return ans === "y" || ans === "yes";
  } finally {
    rl.close();
  }
}
