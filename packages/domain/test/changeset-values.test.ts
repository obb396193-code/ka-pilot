import { describe, expect, it } from "vitest";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { changeValueSchema, sameChangeValue, hashChangeSetDraft } from "../src/changeset-values.js";

const value = (n: number) => ({ type: "number", value: n });
const item = { target_type: "unit", target_id: "u-1", field: "bid", from_value: value(10), to_value: value(11) };
const ttlExpireAt = "2026-09-06T12:00:00Z";

describe("strict change value boundary", () => {
  it.each([value(0), { type: "string", value: "1" }, { type: "boolean", value: false },
    { type: "json", value: { nested: [1, true, null, "v"] } }, { type: "schedule168", value: "01".repeat(84) },
    { type: "number", value: 10, media_default: true }])("accepts a frozen typed value %j", (input) => {
    expect(changeValueSchema.parse(input)).toEqual(input);
  });
  it.each([null, "10", { type: "number", value: "10" }, value(NaN), value(Infinity),
    { type: "boolean", value: 1 }, { type: "string", value: null }, { type: "number", value: 1, media_default: false },
    { type: "number", value: 1, accountId: "injected" }, { type: "schedule168", value: "1".repeat(167) },
    { type: "schedule168", value: "2".repeat(168) }, { type: "json", value: undefined },
    { type: "json", value: { missing: undefined } }, { type: "json", value: new Date() },
    { type: "json", value: [NaN] }, { type: "json", value: new Array(2) }])("rejects malformed typed value %j", (input) => {
    expect(changeValueSchema.safeParse(input).success).toBe(false);
  });
  it("rejects cycles, accessors, symbol keys and deep/large objects without invoking them", () => {
    const cycle: Record<string, unknown> = {}; cycle.self = cycle;
    let called = false;
    const getter = Object.defineProperty({}, "value", { enumerable: true, get() { called = true; return 1; } });
    let deep: unknown = 1; for (let n = 0; n < 70; n++) deep = { deep };
    for (const input of [cycle, getter, { [Symbol("secret")]: 1 }, deep, Array(10001).fill(1)]) {
      expect(changeValueSchema.safeParse({ type: "json", value: input }).success).toBe(false);
    }
    expect(called).toBe(false);
  });
  it("does not coerce types and preserves JSON key/array semantics", () => {
    expect(sameChangeValue(value(1), { type: "string", value: "1" })).toBe(false);
    expect(sameChangeValue(value(1), { type: "boolean", value: true })).toBe(false);
    expect(sameChangeValue(value(1), { ...value(1), media_default: true })).toBe(false);
    expect(sameChangeValue({ type: "json", value: { b: [2, 1], a: 1 } }, { type: "json", value: { a: 1, b: [2, 1] } })).toBe(true);
    expect(sameChangeValue({ type: "json", value: [1, 2] }, { type: "json", value: [2, 1] })).toBe(false);
  });
  it("accepts shared JSON subtrees but rejects hidden fields and throwing reflection", () => {
    const shared = { x: 1 };
    expect(changeValueSchema.safeParse({ type: "json", value: [shared, shared] }).success).toBe(true);
    const hidden = Object.defineProperty({}, "hidden", { value: 1 });
    const proxy = new Proxy({}, { ownKeys() { throw new Error("private upstream error"); } });
    for (const entry of [hidden, proxy]) expect(changeValueSchema.safeParse({ type: "json", value: entry }).success).toBe(false);
    let invoked = false;
    const outer = Object.defineProperty({ type: "number" }, "value", { enumerable: true, get() { invoked = true; return 1; } });
    expect(changeValueSchema.safeParse(outer).success).toBe(false);
    expect(invoked).toBe(false);
  });
  it("bounds UTF-8 bytes and string/node resources without truncating values", () => {
    expect(changeValueSchema.safeParse({ type: "string", value: "x".repeat(16 * 1024 * 1024) }).success).toBe(false);
    expect(changeValueSchema.safeParse({ type: "string", value: "字".repeat(6 * 1024 * 1024) }).success).toBe(false);
    expect(changeValueSchema.safeParse({ type: "json", value: Object.fromEntries(Array.from({ length: 10002 }, (_, i) => [String(i), 0])) }).success).toBe(false);
    expect(changeValueSchema.safeParse({ type: "json", value: Object.assign([], { extra: 1 }) }).success).toBe(false);
  });
  it("reads frozen change item values directly from the arch fixture", () => {
    const fixture = JSON.parse(readFileSync(new URL("../../contract/fixtures/changesets/detail.json", import.meta.url), "utf8"));
    for (const row of fixture.data.items) { expect(changeValueSchema.safeParse(row.fromValue).success).toBe(true); expect(changeValueSchema.safeParse(row.toValue).success).toBe(true); }
  });
});

describe("stable draft hash", () => {
  it("matches the frozen formula with independently written canonical JSON", () => {
    const canonical = '[{"field":"bid","from_value":{"type":"number","value":10},"target_id":"u-1","target_type":"unit","to_value":{"type":"number","value":11}}]';
    expect(hashChangeSetDraft({ items: [item], ttlExpireAt })).toBe(createHash("sha256").update(canonical + ttlExpireAt).digest("hex"));
  });
  it("normalizes item order without mutating the input", () => {
    const other = { ...item, target_id: "u-2" }, items = [other, item];
    const before = JSON.stringify(items);
    expect(hashChangeSetDraft({ items, ttlExpireAt })).toBe(hashChangeSetDraft({ items: [item, other], ttlExpireAt }));
    expect(JSON.stringify(items)).toBe(before);
  });
  it("retains sub-millisecond TTL precision rather than rounding through Date", () => {
    expect(hashChangeSetDraft({ items: [item], ttlExpireAt: "2026-09-06T12:00:00.000001Z" })).not.toBe(hashChangeSetDraft({ items: [item], ttlExpireAt: "2026-09-06T12:00:00.000002Z" }));
  });
  it.each([{ target_type: "campaign" }, { target_id: "u-2" }, { field: "budget" },
    { from_value: value(9) }, { to_value: { type: "string", value: "11" } }])("changes hash for execution-relevant difference %j", (patch) => {
    expect(hashChangeSetDraft({ items: [{ ...item, ...patch }], ttlExpireAt })).not.toBe(hashChangeSetDraft({ items: [item], ttlExpireAt }));
  });
  it("rejects duplicate targets, invalid time, empty items and unexpected fields", () => {
    for (const draft of [{ items: [], ttlExpireAt }, { items: [item, item], ttlExpireAt },
      { items: [item], ttlExpireAt: "2026-02-31T00:00:00Z" }, { items: [item], ttlExpireAt, note: "not hashed" },
      { items: [{ ...item, target_type: "sql" }], ttlExpireAt }]) expect(() => hashChangeSetDraft(draft)).toThrow();
    expect(hashChangeSetDraft({ items: [item], ttlExpireAt: "2026-09-06T12:00:01Z" })).not.toBe(hashChangeSetDraft({ items: [item], ttlExpireAt }));
  });
});
