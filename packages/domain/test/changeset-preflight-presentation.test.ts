import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { preflightPresentationDataSchema, preflightPresentationResponseSchema, classifyPreflightObservation } from "../src/changeset-preflight-presentation.js";
const raw = JSON.parse(readFileSync(new URL("../../contract/fixtures/changesets/dry-run-ok.json", import.meta.url), "utf8"));
const sourceOff = JSON.parse(readFileSync(new URL("../../contract/fixtures/changesets/dry-run-source-unavailable.json", import.meta.url), "utf8"));
const fixture = () => { const value = structuredClone(raw); delete value.meta._note; return value; };
const number = (value: number) => ({ type: "number", value });
describe("D6 preflight three-value public contract", () => {
  it("matches frozen success and source-off fixtures, including unknown dataAsOf", () => {
    expect(preflightPresentationResponseSchema.parse(fixture())).toEqual(fixture());
    expect(preflightPresentationResponseSchema.parse(sourceOff)).toEqual(sourceOff);
    const data = fixture(); data.meta.dataAsOf = null;
    expect(preflightPresentationResponseSchema.safeParse(data).success).toBe(true);
  });
  it.each([{ itemId: "311x" }, { itemId: "0311" }, { itemId: "0" }, { itemId: "9223372036854775808" }, { itemId: 311 },
    { observed: undefined }, { observed: null }, { observed: number(41) }, { verdict: "unknown" }, { reason: "secret" },
    { field: "" }, { targetType: "ad" }, { fromValue: undefined }, { observed: { type: "number", value: NaN } }, { extra: true }])("rejects contradictory/invalid item %j", patch => {
    const value = fixture().data; value.items[0] = { ...value.items[0], ...patch };
    expect(preflightPresentationDataSchema.safeParse(value).success).toBe(false);
  });
  it.each([{ status: "success" }, { hash: "a".repeat(16) }, { ttlExpireAt: undefined },
    { ttlExpireAt: "2026-09-06T10:11:59+08:00" }, { checkedAt: "2026-02-31T00:00:00Z" },
    { confirmAllowed: true }, { confirmBlockedReason: null }, { items: [] }])("rejects contradictory header %j", patch => {
    expect(preflightPresentationDataSchema.safeParse({ ...fixture().data, ...patch }).success).toBe(false);
  });
  it("validates summary counters and rejects duplicated items/targets", () => {
    for (const key of ["total", "ok", "changed", "unknown", "blocked"]) {
      const value = fixture().data; value.summary[key]++;
      expect(preflightPresentationDataSchema.safeParse(value).success).toBe(false);
    }
    const dup = fixture().data; dup.items[1].itemId = dup.items[0].itemId;
    expect(preflightPresentationDataSchema.safeParse(dup).success).toBe(false);
    const target = fixture().data; target.items[1].targetId = target.items[0].targetId;
    expect(preflightPresentationDataSchema.safeParse(target).success).toBe(false);
  });
  it("permits all-ok confirmation and preserves an independent server-side block", () => {
    const value = fixture().data; value.items = [value.items[0]];
    value.summary = { total: 1, ok: 1, changed: 0, unknown: 0, blocked: 0 };
    value.confirmAllowed = true; value.confirmBlockedReason = null;
    expect(preflightPresentationDataSchema.safeParse(value).success).toBe(true);
    value.confirmAllowed = false; value.confirmBlockedReason = "等待业务确认";
    expect(preflightPresentationDataSchema.safeParse(value).success).toBe(true);
    value.items[0].verdict = "blocked"; value.items[0].reason = "权限不足";
    value.summary.ok = 0; value.summary.blocked = 1;
    expect(preflightPresentationDataSchema.safeParse(value).success).toBe(true);
    value.confirmAllowed = true; value.confirmBlockedReason = null;
    expect(preflightPresentationDataSchema.safeParse(value).success).toBe(false);
  });
  it("rejects unknown known-value confusion and changed equal-value confusion", () => {
    const unknown = fixture().data; unknown.items[2].observed = number(3000);
    expect(preflightPresentationDataSchema.safeParse(unknown).success).toBe(false);
    const changed = fixture().data; changed.items[1].observed = number(42);
    expect(preflightPresentationDataSchema.safeParse(changed).success).toBe(false);
  });
  it("keeps BIGSERIAL strings lossless and distinguishes exact10k from overflow", () => {
    const value = fixture().data;
    value.items = Array.from({ length: 10000 }, (_, i) => ({ ...value.items[0], itemId: String(i + 1), targetId: `synthetic-${i}` }));
    value.items[0].itemId = "9223372036854775807";
    value.summary = { total: 10000, ok: 10000, changed: 0, unknown: 0, blocked: 0 };
    value.confirmAllowed = true; value.confirmBlockedReason = null;
    expect(preflightPresentationDataSchema.parse(value).items[0]!.itemId).toBe("9223372036854775807");
    value.items.push({ ...value.items[1], itemId: "10001", targetId: "overflow" });
    expect(preflightPresentationDataSchema.safeParse(value).success).toBe(false);
  }, 30000);
  it("classifies observations without synthesizing them or coercing types", () => {
    expect(classifyPreflightObservation(number(40), null)).toBe("unknown");
    expect(classifyPreflightObservation(number(40), number(40))).toBe("ok");
    expect(classifyPreflightObservation(number(40), number(41))).toBe("changed");
    expect(classifyPreflightObservation(number(40), { type: "string", value: "40" })).toBe("changed");
    expect(classifyPreflightObservation({ type: "json", value: { a: 1, b: 2 } }, { type: "json", value: { b: 2, a: 1 } })).toBe("ok");
    expect(() => classifyPreflightObservation(number(40), undefined)).toThrow();
    expect(() => classifyPreflightObservation({ type: "number", value: "40" }, null)).toThrow();
  });
  it("rejects unapproved envelope fields and malformed request/date metadata", () => {
    for (const patch of [{ businessDate: "2026-02-31" }, { workspaceKind: "team" }, { requestId: "bad\nlog" }, { selectedSource: "ka_data" }, { _note: "doc only" }]) {
      const value = fixture(); value.meta = { ...value.meta, ...patch };
      expect(preflightPresentationResponseSchema.safeParse(value).success).toBe(false);
    }
    expect(preflightPresentationResponseSchema.safeParse({ ...fixture(), credential: "secret" }).success).toBe(false);
  });
});
