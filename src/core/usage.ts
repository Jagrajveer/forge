export type UsageMeta = {
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
  costUSD?: number;
};

const PRICE_PER_M_INPUT = 0.20; // xAI grok-code-fast-1 input $/M :contentReference[oaicite:2]{index=2}
const PRICE_PER_M_OUTPUT = 1.50; // output $/M :contentReference[oaicite:3]{index=3}

export class UsageCounter {
  input = 0;
  output = 0;
  cost = 0;

  add(u?: UsageMeta) {
    if (!u) return;
    this.input += u.inputTokens ?? 0;
    this.output += u.outputTokens ?? 0;
    if (u.costUSD != null) {
      this.cost += u.costUSD;
    } else {
      const cost =
        (this.input / 1_000_000) * PRICE_PER_M_INPUT +
        (this.output / 1_000_000) * PRICE_PER_M_OUTPUT;
      this.cost = cost;
    }
  }

  summarize() {
    const total = this.input + this.output;
    return {
      inputTokens: this.input,
      outputTokens: this.output,
      totalTokens: total,
      estCostUSD: Number(this.cost.toFixed(6))
    };
  }
}
