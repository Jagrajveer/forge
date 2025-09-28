export function printTokenPanel(usage?: {
  input?: number;
  output?: number;
  total?: number;
  estCostUSD?: number;
}) {
  if (!usage) return;
  const parts: string[] = [];
  if (usage.input != null) parts.push(`in: ${usage.input}`);
  if (usage.output != null) parts.push(`out: ${usage.output}`);
  if (usage.total != null) parts.push(`total: ${usage.total}`);
  if (usage.estCostUSD != null) parts.push(`$${usage.estCostUSD.toFixed(4)}`);
  if (parts.length) console.log(`[tokens] ${parts.join("  |  ")}`);
}
