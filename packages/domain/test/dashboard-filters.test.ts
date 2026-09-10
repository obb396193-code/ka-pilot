import { describe, expect, it } from "vitest";
import { dashboardFiltersSchema, matchesDashboardFilters, boundedAccountDaysSchema } from "../src/dashboard-filters.js";
const row = { optimizer: "甲", biz: "唤端", placement: "优选", goal: "拉新", taskId: "task-1" };
describe("P211 filter semantics", () => {
  it("OR within a key, AND across keys; resource_position aliases placement", () => {
    expect(matchesDashboardFilters(row, { optimizer: ["乙", "甲"], biz: ["唤端"], resource_position: ["优选"] })).toBe(true);
    expect(matchesDashboardFilters(row, { optimizer: ["甲"], goal: ["回访"] })).toBe(false);
    expect(matchesDashboardFilters(row, { task_id: ["task-2", "task-1"] })).toBe(true);
    expect(matchesDashboardFilters(row, {})).toBe(true);
    expect(matchesDashboardFilters({ ...row, biz: null }, { biz: ["null"] })).toBe(false);
  });
  it.each([{ sql: "SELECT 1" }, { optimizer: [] }, { optimizer: "甲" }, { biz: [null] }, { goal: ["拉新", "拉新"] },
    { resource_position: [""] }, { task_id: ["a\n"] }, { workspaceId: "spoof" }])("rejects malformed/ambiguous filters %j", value => {
    expect(dashboardFiltersSchema.safeParse(value).success).toBe(false);
  });
  it("preserves literal labels and bounds selection", () => {
    expect(dashboardFiltersSchema.parse({ optimizer: ["甲' OR TRUE --"] })).toEqual({ optimizer: ["甲' OR TRUE --"] });
    expect(dashboardFiltersSchema.safeParse({ optimizer: Array.from({ length: 1001 }, (_, i) => String(i)) }).success).toBe(false);
    expect(dashboardFiltersSchema.safeParse({ task_id: ["x".repeat(257)] }).success).toBe(false);
    expect(() => matchesDashboardFilters({ ...row, optimizer: 1 }, {})).toThrow();
  });
  it("strict internal date/tuple scope distinguishes same IDs on different media", () => {
    const day = { media: "KUAISHOU", accountId: "a", ds: "2026-09-01" };
    expect(boundedAccountDaysSchema.parse([day, { ...day, media: "TENCENT" }])).toHaveLength(2);
    expect(boundedAccountDaysSchema.safeParse([day, day]).success).toBe(false);
    expect(boundedAccountDaysSchema.safeParse([{ ...day, ds: "2026-02-31" }]).success).toBe(false);
    expect(boundedAccountDaysSchema.safeParse([{ ...day, workspaceId: "other" }]).success).toBe(false);
  });
});
