import { describe, expect, it } from "vitest";
import { payoutCentsPerShare } from "@/domain/settlement";

describe("settlement", () => {
  it("pays YES 100 cents and NO 0 cents for YES resolution", () => {
    expect(payoutCentsPerShare("YES", "YES")).toBe(100);
    expect(payoutCentsPerShare("YES", "NO")).toBe(0);
  });

  it("pays NO 100 cents and YES 0 cents for NO resolution", () => {
    expect(payoutCentsPerShare("NO", "NO")).toBe(100);
    expect(payoutCentsPerShare("NO", "YES")).toBe(0);
  });

  it("pays both outcomes 50 cents for CANCELLED resolution", () => {
    expect(payoutCentsPerShare("CANCELLED", "YES")).toBe(50);
    expect(payoutCentsPerShare("CANCELLED", "NO")).toBe(50);
  });
});
