import type { Outcome, Resolution } from "./types";

export function payoutCentsPerShare(resolution: Resolution, outcome: Outcome): number {
  if (resolution === "CANCELLED") {
    return 50;
  }

  return resolution === outcome ? 100 : 0;
}
