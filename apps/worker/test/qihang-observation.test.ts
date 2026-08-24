import { describe, expect, it } from "vitest";

import { createQihangObservation } from "../src/qihang/observation.js";

describe("Qihang observation", () => {
  it("is stable across row order and object key order", () => {
    const observedAt = new Date("2026-08-20T06:32:00.000Z");
    const left = createQihangObservation("account_offline", [
      { account_id: "a-2", ds: "20260819", cost_api: 20 },
      { ds: "20260819", cost_api: 10, account_id: "a-1" },
    ], observedAt);
    const right = createQihangObservation("account_offline", [
      { account_id: "a-1", cost_api: 10, ds: "20260819" },
      { cost_api: 20, ds: "20260819", account_id: "a-2" },
    ], observedAt);

    expect(left.fingerprint).toBe(right.fingerprint);
    expect(left.availability).toBe("observed_unverified");
    expect(left.rowCount).toBe(2);
  });

  it("records an empty offline response as not observed", () => {
    const observation = createQihangObservation(
      "account_offline",
      [],
      new Date("2026-08-20T06:32:00.000Z"),
    );

    expect(observation).toEqual({
      resource: "account_offline",
      rowCount: 0,
      fingerprint: expect.stringMatching(/^[a-f0-9]{64}$/),
      observedAt: "2026-08-20T06:32:00.000Z",
      lastSyncTime: null,
      availability: "not_observed",
    });
  });

  it("uses the greatest last sync time without retaining source rows", () => {
    const observation = createQihangObservation("account_realtime", [
      { account_id: "sensitive-a", last_sync_time: "2026-08-20 14:30:00" },
      { account_id: "sensitive-b", last_sync_time: "2026-08-20 14:31:00" },
    ], new Date("2026-08-20T06:32:00.000Z"));

    expect(observation.lastSyncTime).toBe("2026-08-20 14:31:00");
    expect(JSON.stringify(observation)).not.toContain("sensitive");
  });
});
