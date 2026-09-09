import { describe, expect, it } from "vitest";
import { ruleDefinitionTargetSchema, ruleDefinitionRecordSchema } from "../src/rule-definition.js";
import { conditionReadRequests } from "../src/condition-tree.js";

const target = { ruleId: "9007199254740993", media: "KUAISHOU", accountId: "same", ds: "2026-09-08" };
const record = { id: target.ruleId, workspace_id: "11111111-1111-4111-8111-111111111111", enabled: true,
  scope: { taskIds: [], accountScopes: [], bizNames: [] }, condition_tree: null,
  availability_policy: "suppress", data_freshness_max_hours: null, fallback_copy: null };
describe("internal rule definition boundary", () => {
  it("preserves int64 IDs and does not turn unknown trees/freshness into defaults", () => {
    expect(ruleDefinitionTargetSchema.parse(target)).toEqual(target);
    expect(ruleDefinitionRecordSchema.parse(record)).toEqual(record);
  });
  it.each(["0", "01", "-1", "1e3", "9223372036854775808", 3])("rejects noncanonical int64 %s", ruleId => {
    expect(ruleDefinitionTargetSchema.safeParse({ ...target, ruleId }).success).toBe(false);
  });
  it.each([{ ds: "2026-02-31" }, { media: "KUAISHOU OR 1=1" }, { accountId: "other;SQL" }, { scope: "all" }])("rejects malformed target %#", patch => {
    expect(ruleDefinitionTargetSchema.safeParse({ ...target, ...patch }).success).toBe(false);
  });
  it.each([{ scope: null }, { scope: { unknown: [] } }, { enabled: "false" },
    { data_freshness_max_hours: 0 }, { data_freshness_max_hours: NaN }, { availability_policy: "zero" },
  ])("present-invalid record does not become a global default %#", patch => {
    expect(ruleDefinitionRecordSchema.safeParse({ ...record, ...patch }).success).toBe(false);
  });
  it("plans deduplicated window/threshold reads without running a fake evaluation", () => {
    const leaf = { metric: "cash_cpa", operator: ">", threshold: "assessment_price", consecutive_days: 2, window_hours: 24 };
    expect(conditionReadRequests({ version: "v1", all: [leaf, leaf] })).toEqual([
      { metric: "cash_cpa", windowHours: 24, dayOffset: 0 }, { metric: "assessment_price", windowHours: 24, dayOffset: 0 },
      { metric: "cash_cpa", windowHours: 24, dayOffset: 1 }, { metric: "assessment_price", windowHours: 24, dayOffset: 1 },
    ]);
    expect(() => conditionReadRequests({ version: "v1", all: [] })).toThrow();
  });
});
