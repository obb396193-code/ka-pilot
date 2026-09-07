import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { accountGapRowsSchema, accountHourlyRowsSchema, operationalQueryRowsSchema } from "../src/operational-query-rows.js";

async function source(name: "hourly" | "gap") {
  return JSON.parse(await readFile(new URL(`../../contract/fixtures/data-query/${name}.json`, import.meta.url), "utf8")).data.source;
}
const missing = { value: null, availability: "missing" };
const undefinedRatio = { value: null, state: "undefined" };

describe("operational query rows (not public admission, auth, lineage or rule evaluation)", () => {
  it.each(["hourly", "gap"] as const)("preserves authoritative %s row projection and version", async (name) => {
    const value = await source(name);
    const projection = { queryId: value.queryId, rowSchemaVersion: value.rowSchemaVersion,
      rows: value.rows, ...(name === "gap" ? { groupBy: value.groupBy } : {}) };
    expect(operationalQueryRowsSchema.parse(projection)).toEqual(projection);
    expect(operationalQueryRowsSchema.safeParse({ ...projection, rowSchemaVersion: "invented/v1" }).success).toBe(false);
    expect(operationalQueryRowsSchema.safeParse({ ...projection, token: "synthetic" }).success).toBe(false);
  });
  it.each(["media", "accountId", "hh", "cumulative", "delta", "ratios", "velocity", "projectedDayCost", "budgetUsage", "lastSyncAt"])(
    "rejects missing hourly %s", async (field) => {
      const value = await source("hourly"); Reflect.deleteProperty(value.rows[0], field);
      expect(accountHourlyRowsSchema.safeParse(value.rows).success).toBe(false);
    });
  it.each([-1, 25, 1.5, "3", null])("rejects invalid hour %s", async (hh) => {
    const value = await source("hourly"); value.rows = [{ ...value.rows[0], hh }];
    expect(accountHourlyRowsSchema.safeParse(value.rows).success).toBe(false);
  });
  it("allows explicit whole-day 24 and unknown sync time without generating a time", async () => {
    const value = await source("hourly"), row = { ...value.rows[0], hh: 24, lastSyncAt: null };
    expect(accountHourlyRowsSchema.parse([row])).toEqual([row]);
    expect(accountHourlyRowsSchema.safeParse([{ ...row, lastSyncAt: "today" }]).success).toBe(false);
  });
  it("keeps same account/hour on different media separate; rejects exact duplicates", async () => {
    const value = await source("hourly"), row = value.rows[0];
    expect(accountHourlyRowsSchema.parse([row, { ...row, media: "TENCENT" }])).toHaveLength(2);
    expect(accountHourlyRowsSchema.safeParse([row, structuredClone(row)]).success).toBe(false);
    expect(accountHourlyRowsSchema.safeParse([{ ...row, media: "KUAISHOU:other" }]).success).toBe(false);
    expect(accountHourlyRowsSchema.safeParse([{ ...row, accountId: "bad:tuple" }]).success).toBe(false);
  });
  it("does not fill a missing hour or adjacent delta with zero", async () => {
    const value = await source("hourly"), missingRow = value.rows.find((r: { hh: number }) => r.hh === 6);
    expect(missingRow.cumulative.cost).toEqual(missing);
    expect(accountHourlyRowsSchema.parse(value.rows)).toEqual(value.rows);
    missingRow.delta.cost = { value: 0, availability: "available" };
    expect(accountHourlyRowsSchema.safeParse(value.rows).success).toBe(false);
  });
  it("checks a missing predecessor per tuple, not input order, and not across accounts", async () => {
    const value = await source("hourly");
    const row7 = value.rows.find((r: { hh: number }) => r.hh === 7);
    row7.delta.cost = { value: 535.2, availability: "available" };
    expect(accountHourlyRowsSchema.safeParse([...value.rows].reverse()).success).toBe(false);
    // A selected window may omit the predecessor even though its reader used it.
    expect(accountHourlyRowsSchema.parse([row7])).toEqual([row7]);
    const row6 = value.rows.find((r: { hh: number }) => r.hh === 6);
    expect(accountHourlyRowsSchema.parse([{ ...row6, media: "TENCENT" }, row7])).toHaveLength(2);
  });
  it.each([NaN, Infinity, "12", null])("rejects present-invalid available number %s", async (invalid) => {
    const value = await source("hourly"); value.rows[0].cumulative.cashCost.value = invalid;
    expect(accountHourlyRowsSchema.safeParse(value.rows).success).toBe(false);
  });
  it("preserves error values but rejects finite CPA without its inputs", async () => {
    const value = await source("hourly"); value.rows = [value.rows[0]];
    value.rows[0].cumulative.cashCost = { value: null, availability: "error" };
    value.rows[0].delta.cashCost = missing;
    expect(accountHourlyRowsSchema.safeParse(value.rows).success).toBe(false);
    value.rows[0].ratios.cashCpa = undefinedRatio;
    expect(accountHourlyRowsSchema.parse(value.rows)).toEqual(value.rows);
  });
  it.each(["group", "conversion", "realConversion", "gap", "preDeductionGap", "deductionRate", "gapStatus"])(
    "rejects missing gap %s", async (field) => {
      const value = await source("gap"); Reflect.deleteProperty(value.rows[0], field);
      expect(accountGapRowsSchema.safeParse(value.rows).success).toBe(false);
    });
  it("keeps undefined pre-deduction values and zero-denominator states", async () => {
    const value = await source("gap"); value.rows = [value.rows[0]];
    value.rows[0].realConversion = { value: 0, availability: "available" };
    value.rows[0].gap = { value: null, state: "infinite" }; value.rows[0].gapStatus = "high";
    expect(accountGapRowsSchema.parse(value.rows)).toEqual(value.rows);
    value.rows[0].conversion = { value: 0, availability: "available" };
    value.rows[0].gap = undefinedRatio; value.rows[0].gapStatus = "missing";
    expect(accountGapRowsSchema.parse(value.rows)).toEqual(value.rows);
  });
  it("rejects finite CPA and gap when the supplied denominator is zero", async () => {
    const hourly = (await source("hourly")).rows[0];
    hourly.cumulative.realConversion = { value: 0, availability: "available" };
    expect(accountHourlyRowsSchema.safeParse([hourly]).success).toBe(false);
    hourly.ratios.cashCpa = { value: null, state: "infinite" };
    hourly.ratios.realCpa = { value: null, state: "infinite" };
    expect(accountHourlyRowsSchema.parse([hourly])).toEqual([hourly]);
    const gap = (await source("gap")).rows[0];
    gap.realConversion = { value: 0, availability: "available" };
    expect(accountGapRowsSchema.safeParse([gap]).success).toBe(false);
  });
  it("checks nested strict fields without accepting private source payload", async () => {
    const hourly = (await source("hourly")).rows[0];
    for (const property of ["cumulative", "delta", "ratios", "velocity"]) {
      const changed = structuredClone(hourly); changed[property].sql = "synthetic";
      expect(accountHourlyRowsSchema.safeParse([changed]).success).toBe(false);
    }
    expect(accountHourlyRowsSchema.safeParse([{ ...hourly, workspaceId: "forged" }]).success).toBe(false);
  });
  it("cannot mark missing inputs normal/high or fabricate a finite gap", async () => {
    const value = await source("gap"), row = value.rows.find((r: { gapStatus: string }) => r.gapStatus === "missing");
    for (const gapStatus of ["normal", "high", "guessed"]) {
      expect(accountGapRowsSchema.safeParse([{ ...row, gapStatus }]).success).toBe(false);
    }
    expect(accountGapRowsSchema.safeParse([{ ...row, gap: { value: 0, state: "finite" } }]).success).toBe(false);
    expect(accountGapRowsSchema.safeParse([{ ...row, gapStatus: "missing", gap: { value: 0, state: "undefined" } }]).success).toBe(false);
  });
  it("keeps unknown and literal-null groups distinct; rejects duplicate keys and extra data", async () => {
    const row = (await source("gap")).rows[0];
    expect(accountGapRowsSchema.parse([{ ...row, group: { key: null, label: null } }, { ...row, group: { key: "null", label: null } }])).toHaveLength(2);
    expect(accountGapRowsSchema.safeParse([row, structuredClone(row)]).success).toBe(false);
    expect(accountGapRowsSchema.safeParse([{ ...row, group: { ...row.group, raw_sql: "synthetic" } }]).success).toBe(false);
    expect(accountGapRowsSchema.safeParse([{ ...row, raw_response: {} }]).success).toBe(false);
  });
  it("has explicit empty results and 10k bounds, not proof of source completeness", async () => {
    expect(accountHourlyRowsSchema.parse([])).toEqual([]); expect(accountGapRowsSchema.parse([])).toEqual([]);
    const row = (await source("gap")).rows[0];
    const rows = Array.from({ length: 10000 }, (_, index) => ({ ...row, group: { key: `group-${index}`, label: null } }));
    expect(accountGapRowsSchema.safeParse(rows).success).toBe(true);
    rows.push({ ...row, group: { key: "sentinel", label: null } });
    expect(accountGapRowsSchema.safeParse(rows).success).toBe(false);
  }, 30000);
});
