import { describe, it, expect } from "vitest";
import { toAtomicUnits, fromAtomicUnits } from "@/lib/x402/units";

describe("toAtomicUnits", () => {
  it("converts a 6-decimal price to atomic units", () => {
    expect(toAtomicUnits("0.15", 6)).toBe("150000");
    expect(toAtomicUnits("2.50", 6)).toBe("2500000");
    expect(toAtomicUnits("0.05", 6)).toBe("50000");
  });

  it("handles whole numbers with no decimal point", () => {
    expect(toAtomicUnits("1", 6)).toBe("1000000");
  });

  it("handles the smallest representable unit", () => {
    expect(toAtomicUnits("0.000001", 6)).toBe("1");
  });

  it("works with 18-decimal tokens", () => {
    expect(toAtomicUnits("0.1", 18)).toBe("100000000000000000");
  });
});

describe("fromAtomicUnits", () => {
  it("round-trips with toAtomicUnits", () => {
    for (const [amount, decimals] of [
      ["0.15", 6],
      ["2.5", 6],
      ["1", 6],
      ["0.1", 18],
    ] as const) {
      const atomic = toAtomicUnits(amount, decimals);
      expect(fromAtomicUnits(atomic, decimals)).toBe(amount);
    }
  });
});
