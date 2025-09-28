import prompts from "prompts";

export async function confirmYN(message: string, initial = false): Promise<boolean> {
  const { ok } = await prompts({
    type: "confirm",
    name: "ok",
    message,
    initial,
  });
  return !!ok;
}
