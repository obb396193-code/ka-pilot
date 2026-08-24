import { safeDivide } from "./metrics.js";
import type { RatioValue } from "./types.js";

export interface ConversionGapInput {
  mediaConversion?: number | null;
  realConversion?: number | null;
}

export interface ConversionGapResult {
  status: "matched" | "mismatch" | "undefined" | "missing";
  difference: number | null;
  gap: RatioValue;
  evidence: {
    mediaConversion: number | null;
    realConversion: number | null;
  };
}

function normalizeCount(value: number | null | undefined, field: string): number | null {
  if (value === null || value === undefined) return null;
  if (!Number.isFinite(value) || value < 0) {
    throw new Error(`${field} must be a finite nonnegative number`);
  }
  return value;
}

export function reconcileConversionGap(input: ConversionGapInput): ConversionGapResult {
  const mediaConversion = normalizeCount(input.mediaConversion, "mediaConversion");
  const realConversion = normalizeCount(input.realConversion, "realConversion");
  const evidence = { mediaConversion, realConversion };
  if (mediaConversion === null || realConversion === null) {
    return {
      status: "missing",
      difference: null,
      gap: { value: null, state: "undefined" },
      evidence,
    };
  }

  const difference = mediaConversion - realConversion;
  const base = safeDivide(mediaConversion, realConversion, {
    infiniteWhenPositiveNumerator: true,
  });
  const gap: RatioValue =
    base.state === "finite"
      ? { value: (base.value as number) - 1, state: "finite" }
      : base;
  return {
    status:
      gap.state !== "finite" ? "undefined" : difference === 0 ? "matched" : "mismatch",
    difference,
    gap,
    evidence,
  };
}
