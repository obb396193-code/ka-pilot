import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { dimensionWindowRowsSchema } from "../src/dimension-window-rows.js";

const names = ["dimension-v3", "dimension-v3-account", "dimension-v3-task", "dimension-v3-biz",
  "dimension-v3-agent_type", "dimension-v3-deduction_range"] as const;

async function fixture(name: typeof names[number] = "dimension-v3-account") {
  const body = JSON.parse(await readFile(new URL(`../../contract/fixtures/data-query/${name}.json`, import.meta.url), "utf8"));
  return { dimension: body.data.source.dimension, rows: body.data.source.rows };
}

describe("dimension v3 row boundary (not source envelope or source availability)", () => {
  it.each(names)("parses authoritative %s rows without local copies", async (name) => {
    const value = await fixture(name);
    expect(dimensionWindowRowsSchema.parse(value)).toEqual(value);
  });
  it("keeps same account ID on different media separate", async () => {
    const value = await fixture(), first = value.rows[0];
    value.rows = [first, { ...structuredClone(first), media: "TENCENT", key: `TENCENT:${first.accountId}` }];
    expect(dimensionWindowRowsSchema.parse(value).rows).toHaveLength(2);
  });
  it.each(["media", "accountId", "metrics", "assessment", "anomaly"])("rejects missing %s", async (key) => {
    const value = await fixture();
    Reflect.deleteProperty(value.rows[0], key);
    expect(dimensionWindowRowsSchema.safeParse(value).success).toBe(false);
  });
  it.each(["media", "accountId"])("rejects present-invalid %s", async (key) => {
    const value = await fixture(); value.rows[0][key] = "with:separator";
    expect(dimensionWindowRowsSchema.safeParse(value).success).toBe(false);
  });
  it("rejects account-only key and mismatched media key", async () => {
    for (const key of ["account-1", "TENCENT:account-1"]) {
      const value = await fixture(); value.rows[0].key = key;
      expect(dimensionWindowRowsSchema.safeParse(value).success).toBe(false);
    }
  });
  it.each(names)("rejects duplicate group identity in %s", async (name) => {
    const value = await fixture(name); value.rows.push(structuredClone(value.rows[0]));
    expect(dimensionWindowRowsSchema.safeParse(value).success).toBe(false);
  });
  it("keeps the unknown group distinct from a literal null label", async () => {
    const value = await fixture("dimension-v3-task");
    const row = value.rows[0];
    value.rows = [{ ...row, key: null, label: null }, { ...row, key: "null" }];
    expect(dimensionWindowRowsSchema.parse(value).rows).toHaveLength(2);
  });
  it("does not let a non-account dimension impersonate an account", async () => {
    const value = await fixture(); value.dimension = "task";
    expect(dimensionWindowRowsSchema.safeParse(value).success).toBe(false);
  });
  it("keeps agency fields limited to the frozen agency dimension", async () => {
    const value = await fixture("dimension-v3-agent_type");
    value.rows[0].agent_type = "guessed";
    expect(dimensionWindowRowsSchema.safeParse(value).success).toBe(false);
    value.rows[0].agent_type = "agency"; value.rows[0].agency_name = null;
    expect(dimensionWindowRowsSchema.safeParse(value).success).toBe(false);
    Reflect.deleteProperty(value.rows[0], "agency_name");
    expect(dimensionWindowRowsSchema.safeParse(value).success).toBe(true);
    value.dimension = "task";
    expect(dimensionWindowRowsSchema.safeParse(value).success).toBe(false);
  });
  it.each(["false", null, 0])("rejects invalid anomaly %s", async (invalid) => {
    const value = await fixture(); value.rows[0].anomaly = invalid;
    expect(dimensionWindowRowsSchema.safeParse(value).success).toBe(false);
  });
  it.each(["bad", Infinity, NaN])("rejects invalid numeric value %s", async (invalid) => {
    const value = await fixture(); value.rows[0].metrics.cashCost.value = invalid;
    expect(dimensionWindowRowsSchema.safeParse(value).success).toBe(false);
  });
  it("preserves missing and zero-denominator states, never fills them with zero", async () => {
    const value = await fixture();
    const missing = value.rows.find((row: { metrics: { cashCost: { availability: string } } }) => row.metrics.cashCost.availability === "missing");
    missing.metrics.ratios.cashCpa = { value: null, state: "undefined" };
    expect(dimensionWindowRowsSchema.parse(value).rows).toEqual(value.rows);
    missing.assessment.onTarget = true;
    missing.assessment.costStatus = "green";
    missing.assessment.costStatusReason = "window_ok";
    expect(dimensionWindowRowsSchema.safeParse(value).success).toBe(false);
  });
  it("reuses conversion-missing assessment checks", async () => {
    const value = await fixture(), row = value.rows[0];
    row.metrics.realConversion = { value: null, availability: "missing" };
    expect(dimensionWindowRowsSchema.safeParse(value).success).toBe(false);
    row.assessment.onTarget = null; row.assessment.costStatus = null;
    row.assessment.costStatusReason = "conversion_missing";
    expect(dimensionWindowRowsSchema.safeParse(value).success).toBe(true);
    row.metrics.cashCost = { value: null, availability: "missing" };
    expect(dimensionWindowRowsSchema.safeParse(value).success).toBe(false);
  });
  it("rejects cash_missing when cash is present and invalid representative prices", async () => {
    const value = await fixture(), row = value.rows[0];
    row.assessment.onTarget = null; row.assessment.costStatus = null;
    row.assessment.costStatusReason = "cash_missing";
    expect(dimensionWindowRowsSchema.safeParse(value).success).toBe(false);
    row.assessment.onTarget = true; row.assessment.costStatus = "green";
    row.assessment.costStatusReason = "window_ok";
    row.assessment.priceVersions = 2;
    expect(dimensionWindowRowsSchema.safeParse(value).success).toBe(false);
    Reflect.deleteProperty(row.assessment, "priceVersions"); row.assessment.price.effectiveDate = null;
    expect(dimensionWindowRowsSchema.safeParse(value).success).toBe(false);
    row.assessment.price = null;
    expect(dimensionWindowRowsSchema.safeParse(value).success).toBe(false);
  });
  it("rejects missing required ratios and extra source fields", async () => {
    const value = await fixture(); Reflect.deleteProperty(value.rows[0].metrics.ratios, "cashCpa");
    expect(dimensionWindowRowsSchema.safeParse(value).success).toBe(false);
    const extra = await fixture(); extra.rows[0].raw_sql = "not-public";
    expect(dimensionWindowRowsSchema.safeParse(extra).success).toBe(false);
  });
  it("allows unknown labels without deriving names", async () => {
    const value = await fixture(); value.rows[0].label = null;
    expect(dimensionWindowRowsSchema.parse(value).rows[0]?.label).toBeNull();
  });
  it("bounds rows with a known extra-row sentinel", async () => {
    const value = await fixture("dimension-v3-task"), row = value.rows[0];
    value.rows = Array.from({ length: 10000 }, (_, index) => ({ ...row, key: `task-${index}` }));
    expect(dimensionWindowRowsSchema.safeParse(value).success).toBe(true);
    value.rows.push({ ...row, key: "sentinel" });
    expect(dimensionWindowRowsSchema.safeParse(value).success).toBe(false);
  }, 30_000); // F-P110-1: 10k strict rows under concurrent suite load; assertions unchanged.
  it.each(["account", "task", "biz", "agent_type", "resource_position", "bid_tool", "ubp", "deduction_range"])(
    "represents empty %s rows, not proof that the source supports this dimension", (dimension) => {
      expect(dimensionWindowRowsSchema.parse({ dimension, rows: [] })).toEqual({ dimension, rows: [] });
    },
  );
  it("rejects unknown dimension or request-style aliases at output boundary", () => {
    for (const dimension of ["is_ubp", "sql", ""]) {
      expect(dimensionWindowRowsSchema.safeParse({ dimension, rows: [] }).success).toBe(false);
    }
  });
});
