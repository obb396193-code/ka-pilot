import { describe, expect, it } from "vitest";

import { incrementalEtlPayloadSchema } from "../src/etl/payload.js";

const basePayload = {
  workspaceId: "00000000-0000-4000-8000-000000000024",
  userId: "user-1",
  ds: "2026-08-24",
};

describe("incremental ETL payload hour boundary", () => {
  it("accepts the verified 0 through 24 cumulative-hour range", () => {
    expect(incrementalEtlPayloadSchema.parse({ ...basePayload, hh: 0 }).hh).toBe(0);
    expect(incrementalEtlPayloadSchema.parse({ ...basePayload, hh: 24 }).hh).toBe(24);
  });

  it("rejects values outside the product-owned boundary", () => {
    expect(incrementalEtlPayloadSchema.safeParse({ ...basePayload, hh: -1 }).success).toBe(false);
    expect(incrementalEtlPayloadSchema.safeParse({ ...basePayload, hh: 25 }).success).toBe(false);
  });
});
