import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { settingsChangeLogDataSchema, settingsChangeLogPositionSchema, settingsChangeLogRequestSchema, settingsChangeLogResponseSchema } from "../src/settings-change-log.js";

// Captured from the actual HTTP/PG test, synthetic source only. The pre-id legacy fixture was
// retired by arch v1.9.48 ⑤; its shape is still asserted to be rejected below.
const canonical = JSON.parse(readFileSync(new URL("../../contract/fixtures/settings/change-log-v1944.json", import.meta.url), "utf8"));
const assessment = canonical.data.items.find((row: { kind: string; op: string }) => row.kind === "assessment_price" && row.op === "set");

describe("P194 settings change log frozen fixture boundary", () => {
  it("requires v1.9.44 id/op; the retired pre-id shape is not the current contract", () => {
    const legacy = { ...assessment, id: undefined, op: undefined, recomputedDays: 3 };
    expect(settingsChangeLogResponseSchema.safeParse({ ...canonical, data: { items: [legacy], nextCursor: null } }).success).toBe(false);
    expect(settingsChangeLogResponseSchema.parse(canonical)).toEqual(canonical);
  });
  it("accepts empty and bounded pages without fabricating source metadata", () => {
    expect(settingsChangeLogDataSchema.parse({ items: [], nextCursor: null })).toEqual({ items: [], nextCursor: null });
    expect(settingsChangeLogResponseSchema.safeParse({ ...canonical, meta: { ...canonical.meta, dataAsOf: "2026-09-13T00:00:00Z" } }).success).toBe(false);
  });
  it.each([
    { kinds: ["assessment_price"] }, { kinds: ["assessment_price", "daily_budget_cap"] },
    { task_id: "synthetic-task", media: "KUAISHOU" }, {},
  ])("accepts frozen filters %j", input => { expect(settingsChangeLogRequestSchema.safeParse(input).success).toBe(true); });
  it.each([
    { kinds: ["unknown"] }, { kinds: ["assessment_price", "assessment_price"] }, { kinds: [] },
    { task_id: "" }, { media: "KUAISHOU;SQL" }, { cursor: "" }, { cursor: "x".repeat(1025) },
    { workspaceId: "forged" }, { scope: "*" }, { dataSource: "ka_data" }, { pageSize: 10001 },
  ])("rejects unapproved filters %j", input => { expect(settingsChangeLogRequestSchema.safeParse(input).success).toBe(false); });
  it.each([
    { newValue: "38" }, { newValue: NaN }, { newValue: Infinity }, { oldValue: "not-a-number" },
    { effectiveDate: "2026-02-31" }, { at: "2026-02-31T00:00:00Z" }, { at: "" },
    { kind: "arbitrary" }, { scope: { media: "KUAISHOU" } },
    { changedBy: { userId: "not-uuid", name: "synthetic" } }, { rawSql: "secret" },
    { new_value: 38 }, { recomputedDays: -1 },
  ])("rejects corrupt assessment row %j", patch => {
    expect(settingsChangeLogDataSchema.safeParse({ items: [{ ...assessment, ...patch }], nextCursor: null }).success).toBe(false);
  });
  it("v1.9.48 ⑤ accepts a row whose modification time is unknown, without inventing one", () => {
    expect(settingsChangeLogDataSchema.parse({ items: [{ ...assessment, at: null }], nextCursor: null }).items[0]?.at).toBeNull();
  });
  it("pagination state is v2 and records whether the boundary row had a time", () => {
    expect(settingsChangeLogPositionSchema.safeParse({ v: 2, key: "2026-09-01T16:00:00.000000Z", atMissing: true, kind: "assessment_price", id: "7" }).success).toBe(true);
    expect(settingsChangeLogPositionSchema.safeParse({ v: 1, at: "2026-09-01T16:00:00.000000Z", kind: "assessment_price", id: "7" }).success).toBe(false);
    expect(settingsChangeLogPositionSchema.safeParse({ v: 2, key: "2026-09-01T16:00:00.000000Z", kind: "assessment_price", id: "7" }).success).toBe(false);
  });
  it("never coerces scalar and coefficient records into each other", () => {
    const coefficient = canonical.data.items.find((row: { kind: string }) => row.kind === "channel_coefficient");
    for (const newValue of [0.8, null, { coefficient: "0.8", op: "multiply" }, { coefficient: Infinity, op: "divide" }, { coefficient: 1, op: "unknown" }]) {
      expect(settingsChangeLogDataSchema.safeParse({ items: [{ ...coefficient, newValue }], nextCursor: null }).success).toBe(false);
    }
  });
  it("returns missing historical actor/evidence as null and represents revoke without an invented amount", () => {
    const row = { ...assessment, op: "revoke", newValue: null, changedBy: null, evidenceUrl: null };
    expect(settingsChangeLogDataSchema.parse({ items: [row], nextCursor: null }).items).toEqual([row]);
  });
  it.each([{ id: "" }, { id: undefined }, { op: undefined }, { op: "overwrite" }, { op: "revoke", newValue: 38 }, { op: "set", newValue: null }])("rejects malformed version semantics %j", patch => {
    expect(settingsChangeLogDataSchema.safeParse({ items: [{ ...assessment, ...patch }], nextCursor: null }).success).toBe(false);
  });
});
