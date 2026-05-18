import { describe, expect, it } from "vitest";
import { assertCentPrice, assertPositiveQuantity, cents } from "@/domain/money";

describe("money helpers", () => {
  it("accepts integer cent amounts", () => {
    expect(cents(125)).toBe(125);
  });

  it("rejects non-integer cent amounts", () => {
    expect(() => cents(1.5)).toThrow("Money amounts must be integer cents");
  });

  it("accepts market prices from 1 to 99 cents", () => {
    expect(assertCentPrice(1)).toBe(1);
    expect(assertCentPrice(99)).toBe(99);
  });

  it("rejects invalid market prices", () => {
    expect(() => assertCentPrice(0)).toThrow("Price must be between 1 and 99 cents");
    expect(() => assertCentPrice(100)).toThrow("Price must be between 1 and 99 cents");
  });

  it("requires positive whole-share quantities", () => {
    expect(assertPositiveQuantity(3)).toBe(3);
    expect(() => assertPositiveQuantity(0)).toThrow("Quantity must be a positive integer");
    expect(() => assertPositiveQuantity(1.25)).toThrow("Quantity must be a positive integer");
  });
});
