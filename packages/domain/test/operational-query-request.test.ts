import { describe, expect, it } from "vitest";
import { operationalQueryRequestSchema } from "../src/operational-query-request.js";

const hourly = { queryId: "account.hourly", params: { date: "2026-09-08", media: "KUAISHOU" } };
const gap = { queryId: "account.gap", params: { date_from: "2026-09-01", date_to: "2026-09-08", media: "KUAISHOU", groupBy: "account" } };
describe("frozen hourly and gap request boundary", () => {
  it("accepts minimal inputs without invented defaults and normalizes existing compact date syntax", () => {
    expect(operationalQueryRequestSchema.parse(hourly)).toEqual(hourly);
    expect(operationalQueryRequestSchema.parse(gap)).toEqual(gap);
    expect(operationalQueryRequestSchema.parse({ ...hourly, params: { ...hourly.params, date: "20260908" } })).toEqual(hourly);
    expect(operationalQueryRequestSchema.parse({ ...gap, params: { ...gap.params, date_from: "20260901", date_to: "20260908" } })).toEqual(gap);
  });
  it.each([0, 13, 23, 24])("accepts bounded hour %i without treating 24 as a 25th interval", hh => {
    const params = { ...hourly.params, hhFrom: hh, hhTo: hh, accountIds: ["synthetic-same"] };
    expect(operationalQueryRequestSchema.parse({ ...hourly, params })).toEqual({ ...hourly, params });
  });
  it("preserves one-sided optional hour bounds; same-day Gap and leap days are valid", () => {
    expect(operationalQueryRequestSchema.parse({ ...hourly, params: { ...hourly.params, hhFrom: 5 } })).toMatchObject({ params: { hhFrom: 5 } });
    expect(operationalQueryRequestSchema.parse({ ...hourly, params: { ...hourly.params, hhTo: 7 } })).toMatchObject({ params: { hhTo: 7 } });
    expect(operationalQueryRequestSchema.safeParse({ ...gap, params: { ...gap.params, date_from: "2024-02-29", date_to: "2024-02-29" } }).success).toBe(true);
  });
  it.each(["account", "task", "biz"])("accepts frozen Gap grouping %s", groupBy => {
    expect(operationalQueryRequestSchema.parse({ ...gap, params: { ...gap.params, groupBy } })).toMatchObject({ params: { groupBy } });
  });
  it.each(["2026-02-31", "2026-02-29", "2026-13-01", "2026-00-01", "2026-09-00", "2026-9-8", "20260999", "2026-09-08T00:00:00Z", "", null, 20260908])("rejects non-calendar date %s", date => {
    expect(operationalQueryRequestSchema.safeParse({ ...hourly, params: { ...hourly.params, date } }).success).toBe(false);
    expect(operationalQueryRequestSchema.safeParse({ ...gap, params: { ...gap.params, date_to: date } }).success).toBe(false);
  });
  it.each([-1, 25, 1.5, "1", null, NaN, Infinity])("rejects invalid hours %s", hour => {
    for (const key of ["hhFrom", "hhTo"])
      expect(operationalQueryRequestSchema.safeParse({ ...hourly, params: { ...hourly.params, [key]: hour } }).success).toBe(false);
  });
  it("rejects reverse ranges without swapping or clamping", () => {
    expect(operationalQueryRequestSchema.safeParse({ ...hourly, params: { ...hourly.params, hhFrom: 24, hhTo: 23 } }).success).toBe(false);
    expect(operationalQueryRequestSchema.safeParse({ ...gap, params: { ...gap.params, date_from: "2026-09-09" } }).success).toBe(false);
  });
  it.each([[], ["same", "same"], [""], ["unsafe/id"], ["%2F"], [null], "same", null, Array.from({ length: 1001 }, (_, i) => `a${i}`)].map(value => [value]))("rejects malformed, duplicate or unbounded scope arrays", accountIds => {
    for (const base of [hourly, gap])
      expect(operationalQueryRequestSchema.safeParse({ ...base, params: { ...base.params, accountIds } }).success).toBe(false);
  });
  it("accepts the existing1000-object syntax ceiling without claiming grants", () => {
    const accountIds = Array.from({ length: 1000 }, (_, i) => `a${i}`);
    expect(operationalQueryRequestSchema.parse({ ...hourly, params: { ...hourly.params, accountIds } })).toMatchObject({ params: { accountIds } });
  });
  it.each(["kuaishou", "", "A/B", "A".repeat(33), null, 1])("rejects malformed media %s", media => {
    expect(operationalQueryRequestSchema.safeParse({ ...hourly, params: { ...hourly.params, media } }).success).toBe(false);
  });
  it("rejects unknown or cross-query fields and missing required fields", () => {
    const invalid: unknown[] = [null, {}, [], { ...hourly, queryId: "raw.sql" }, { ...hourly, dataView: "ka_data" },
      { ...hourly, workspaceId: "other" }, { ...hourly, params: { date: hourly.params.date } },
      { ...hourly, params: { ...hourly.params, groupBy: "account" } }, { ...hourly, params: { ...hourly.params, sql: "SELECT *" } },
      { ...gap, params: { ...gap.params, groupBy: "material" } }, { ...gap, params: { ...gap.params, hhTo: 24 } },
      { ...gap, params: { date_from: "2026-09-01", date_to: "2026-09-02", media: "KUAISHOU" } }];
    for (const request of invalid) expect(operationalQueryRequestSchema.safeParse(request).success).toBe(false);
  });
});
