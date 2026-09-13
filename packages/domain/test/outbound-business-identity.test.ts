import { describe, expect, it } from "vitest";
import { prepareOutboundBusinessIdentity } from "../src/outbound-business-identity.js";

const row = { workspaceId: "11111111-1111-4111-8111-111111111111", kind: "job_failed",
  target: "workspace:11111111-1111-4111-8111-111111111111:admins", payload: { jobId: "22222222-2222-4222-8222-222222222222" },
  createdAt: "2026-09-12T18:59:00Z" };
describe("P198 v1.9.48 legacy business identity", () => {
  it("uses verified job date, then run date, then enqueue business day, never processing day", () => {
    expect(prepareOutboundBusinessIdentity({ ...row, jobBusinessDate: "2026-09-10", runBusinessDate: "2026-09-11" }).businessDate).toBe("2026-09-10");
    expect(prepareOutboundBusinessIdentity({ ...row, runBusinessDate: "2026-09-11" }).businessDate).toBe("2026-09-11");
    expect(prepareOutboundBusinessIdentity(row).businessDate).toBe("2026-09-12");
    expect(prepareOutboundBusinessIdentity({ ...row, createdAt: "2026-09-12T19:00:00Z" }).businessDate).toBe("2026-09-13");
    expect(prepareOutboundBusinessIdentity(row).businessKey).toBe(row.payload.jobId);
  });
  it("quality identity uses a stable set of failed checks and ds, not property/insertion order", () => {
    const base = { ...row, kind: "data_quality_failed", payload: { ds: "2026-09-10", failedChecks: ["b", "a"] } };
    expect(prepareOutboundBusinessIdentity(base)).toEqual(prepareOutboundBusinessIdentity({ ...base, payload: { failedChecks: ["a", "b", "a"], ds: "2026-09-10" } }));
    expect(prepareOutboundBusinessIdentity(base).businessDate).toBe("2026-09-10");
    expect(prepareOutboundBusinessIdentity(base).dedupeKey).not.toBe(prepareOutboundBusinessIdentity({ ...base, payload: { ...base.payload, failedChecks: ["a"] } }).dedupeKey);
  });
  it("other kinds use refId or canonical JSON hash, isolating kind/target/workspace", () => {
    const base = { ...row, kind: "future", payload: { b: [2, { z: 1, a: true }], a: null } };
    expect(prepareOutboundBusinessIdentity(base)).toEqual(prepareOutboundBusinessIdentity({ ...base, payload: { a: null, b: [2, { a: true, z: 1 }] } }));
    expect(prepareOutboundBusinessIdentity({ ...base, payload: { refId: "ref", noise: 1 } }).businessKey).toBe("ref");
    expect(prepareOutboundBusinessIdentity(base).dedupeKey).not.toBe(prepareOutboundBusinessIdentity({ ...base, target: "user:other" }).dedupeKey);
  });
  it.each([
    { jobBusinessDate: "2026-02-31" }, { jobBusinessDate: "" }, { runBusinessDate: 123 },
    { payload: {} }, { payload: { jobId: "invalid" } }, { createdAt: null },
    { kind: "future", payload: { n: NaN } }, { kind: "future", payload: { n: undefined } },
    { kind: "future", payload: { refId: false } }, { extra: "browser scope" },
    { kind: "data_quality_failed", payload: { ds: "2026-02-31", failedChecks: [] } },
    { kind: "data_quality_failed", payload: { ds: "2026-09-10", failedChecks: "x" } },
  ])("present-invalid does not silently fall back %j", patch => {
    expect(() => prepareOutboundBusinessIdentity({ ...row, ...patch })).toThrow();
  });
  it("null date hints are missing, not false timestamps", () => {
    expect(prepareOutboundBusinessIdentity({ ...row, jobBusinessDate: null, runBusinessDate: null })).toEqual(prepareOutboundBusinessIdentity(row));
  });
  it("bounds nested/cyclic JSON and does not mutate input", () => {
    const cyclic: Record<string, unknown> = {}; cyclic.self = cyclic;
    expect(() => prepareOutboundBusinessIdentity({ ...row, kind: "future", payload: cyclic })).toThrow();
    const deep: Record<string, unknown> = {}; let cursor = deep;
    for (let i = 0; i < 40; i++) { const next = {}; cursor.next = next; cursor = next; }
    expect(() => prepareOutboundBusinessIdentity({ ...row, kind: "future", payload: deep })).toThrow();
    const before = JSON.stringify(row); prepareOutboundBusinessIdentity(row); expect(JSON.stringify(row)).toBe(before);
  });
  it("refuses the exact16MiB encoded payload boundary and accepts one byte below", () => {
    const bytes = 16 * 1024 * 1024, overhead = Buffer.byteLength(JSON.stringify({ text: "" }));
    expect(() => prepareOutboundBusinessIdentity({ ...row, kind: "future", payload: { text: "x".repeat(bytes - overhead) } })).toThrow();
    expect(prepareOutboundBusinessIdentity({ ...row, kind: "future", payload: { text: "x".repeat(bytes - overhead - 1) } }).dedupeKey).toMatch(/^outbound:v1:/);
  });
  it("rejects excessive JSON nodes and non-JSON values", () => {
    for (const value of [new Date(), Symbol("not-json"), 1n, Array(100001).fill(0), Array(2)]) {
      expect(() => prepareOutboundBusinessIdentity({ ...row, kind: "future", payload: { value } })).toThrow();
    }
  });
});
