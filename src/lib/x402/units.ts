/**
 * Converts a human decimal amount string (e.g. "0.15") to atomic/minimal
 * units (e.g. "150000" for a 6-decimal token like USDT/USDC) using plain
 * string math — avoids floating-point precision issues that
 * `Math.round(Number(x) * 10**decimals)` can introduce on some inputs.
 *
 * Needed because OKX's real Agent Payments Protocol v2 challenge format
 * (`PAYMENT-REQUIRED` header) expresses amounts in atomic units, not
 * decimal strings — confirmed against okx/onchainos-skills'
 * okx-agent-payments-protocol skill.
 */
export function toAtomicUnits(decimalAmount: string, decimals: number): string {
  const trimmed = decimalAmount.trim();
  const negative = trimmed.startsWith("-");
  const unsigned = negative ? trimmed.slice(1) : trimmed;
  const [whole, frac = ""] = unsigned.split(".");
  const fracPadded = (frac + "0".repeat(decimals)).slice(0, decimals);
  const combined = `${whole}${fracPadded}`.replace(/^0+(?=\d)/, "");
  const result = BigInt(combined || "0");
  return (negative ? -result : result).toString();
}

/** Inverse of toAtomicUnits — atomic units back to a human decimal string, for display. */
export function fromAtomicUnits(atomicAmount: string, decimals: number): string {
  const negative = atomicAmount.startsWith("-");
  const unsigned = negative ? atomicAmount.slice(1) : atomicAmount;
  const padded = unsigned.padStart(decimals + 1, "0");
  const whole = padded.slice(0, padded.length - decimals) || "0";
  const frac = padded.slice(padded.length - decimals).replace(/0+$/, "");
  const result = frac ? `${whole}.${frac}` : whole;
  return negative ? `-${result}` : result;
}
