import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { settingsChangeLogDataSchema, settingsChangeLogRequestSchema, settingsChangeLogResponseSchema } from "../src/settings-change-log.js";

const fixture = JSON.parse(readFileSync(new URL("../../contract/fixtures/settings/change-log.json", import.meta.url), "utf8"));

describe("P194 settings change log frozen fixture boundary", () => {
  it("accepts the canonical fixture without changing any wire key or missing value", () => {
    expect(settingsChangeLogResponseSchema.parse(fixture)).toEqual(fixture);
  });
  it("accepts empty and bounded pages without fabricating source metadata", () => {
    expect(settingsChangeLogDataSchema.parse({ items: [], nextCursor: null })).toEqual({ items: [], nextCursor: null });
    expect(settingsChangeLogResponseSchema.safeParse({ ...fixture, meta: { ...fixture.meta, dataAsOf: "2026-09-13T00:00:00Z" } }).success).toBe(false);
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
    { effectiveDate: "2026-02-31" }, { at: "2026-02-31T00:00:00Z" }, { at: null },
    { kind: "arbitrary" }, { scope: { media: "KUAISHOU" } },
    { changedBy: { userId: "not-uuid", name: "synthetic" } }, { rawSql: "secret" },
    { new_value: 38 }, { recomputedDays: -1 },
  ])("rejects corrupt assessment row %j", patch => {
    expect(settingsChangeLogDataSchema.safeParse({ items: [{ ...fixture.data.items[1], ...patch }], nextCursor: null }).success).toBe(false);
  });
  it("never coerces scalar and coefficient records into each other", () => {
    const coefficient = fixture.data.items[2];
    for (const newValue of [0.8, null, { coefficient: "0.8", op: "multiply" }, { coefficient: Infinity, op: "divide" }, { coefficient: 1, op: "unknown" }]) {
      expect(settingsChangeLogDataSchema.safeParse({ items: [{ ...coefficient, newValue }], nextCursor: null }).success).toBe(false);
    }
  });
});
