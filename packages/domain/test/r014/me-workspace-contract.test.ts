import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import {
  UNCONFIGURED_LOAD_SCORE, meCountsSchema, meWorkloadSchema, sealMeCounts,
  type MeCountsParts,
} from "../../src/r014/me-workspace-contract.js";

const fixture = (name: string): { data: unknown } =>
  JSON.parse(readFileSync(new URL(`../../../contract/fixtures/${name}`, import.meta.url), "utf8"));

const COMPLETE: MeCountsParts = {
  workItems: { open: 12, p0: 1, p1: 3, opportunity: 2 },
  approvalsToApprove: 1,
  dispatchesReceived: 1,
  runsWaitingConfirmation: 1,
  notificationsUnread: 7,
  changesetsDraft: 2,
};

describe("v1.7.1 me/counts", () => {
  it("parses the frozen fixture", () => {
    expect(meCountsSchema.parse(fixture("me/counts.json").data)).toEqual(COMPLETE);
  });

  it("seals a complete set into the frozen DTO", () => {
    const sealed = sealMeCounts(COMPLETE);
    expect(sealed.complete).toBe(true);
    expect(sealed.complete && sealed.counts).toEqual(COMPLETE);
  });

  it.each([
    ["approvalsToApprove"], ["dispatchesReceived"], ["workItems"], ["notificationsUnread"],
  ])("reports %s as missing instead of counting it as zero", (key) => {
    const sealed = sealMeCounts({ ...COMPLETE, [key]: null } as MeCountsParts);
    expect(sealed.complete).toBe(false);
    expect(sealed.complete === false && sealed.missing).toEqual([key]);
  });

  it("lists every missing source at once", () => {
    const sealed = sealMeCounts({ ...COMPLETE, approvalsToApprove: null, dispatchesReceived: null });
    expect(sealed.complete === false && sealed.missing).toEqual(["approvalsToApprove", "dispatchesReceived"]);
  });
});

describe("v1.7.4 G9 me/workload", () => {
  it("parses the frozen fixture with its unconfigured load score", () => {
    const workload = meWorkloadSchema.parse(fixture("me/workload.json").data);
    expect(workload.loadScore).toEqual(UNCONFIGURED_LOAD_SCORE);
    expect(workload.oncall).toEqual({ today: false, next: { at: "2026-09-08", role: "值守" } });
  });

  it("refuses an invented score while the formula is unconfigured", () => {
    const base = fixture("me/workload.json").data as Record<string, unknown>;
    for (const forged of [
      { value: { value: 0.7, state: "finite" }, source: "not_configured", formula: null },
      { value: { value: null, state: "undefined" }, source: "not_configured", formula: "pending/4" },
    ]) {
      expect(() => meWorkloadSchema.parse({ ...base, loadScore: forged }))
        .toThrow(/must stay undefined instead of being invented/);
    }
  });

  it("requires a formula-sourced score to name its formula", () => {
    const base = fixture("me/workload.json").data as Record<string, unknown>;
    expect(() => meWorkloadSchema.parse({
      ...base, loadScore: { value: { value: 0.7, state: "finite" }, source: "formula", formula: null },
    })).toThrow(/must name its formula/);
    expect(() => meWorkloadSchema.parse({
      ...base, loadScore: { value: { value: 0.7, state: "finite" }, source: "formula", formula: "pending/4" },
    })).not.toThrow();
  });

  it("allows an empty on-call schedule without inventing a next shift", () => {
    const base = fixture("me/workload.json").data as Record<string, unknown>;
    expect(() => meWorkloadSchema.parse({ ...base, oncall: { today: false, next: null } })).not.toThrow();
  });
});
