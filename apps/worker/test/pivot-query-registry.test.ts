import { describe, expect, it } from "vitest";
import { createDataQueryRegistry } from "../src/data/query-registry.js";
const params = { dimA: "account", dimB: "task", window_from: "2026-09-01", window_to: "2026-09-02", media: "KUAISHOU" };
describe("pivot Registry admission", () => {
  it("resolves the frozen spelling and version without SQL from callers", () => {
    const result = createDataQueryRegistry().resolve("account.pivot2", params, "platform");
    expect(result).toMatchObject({ rowSchemaVersion: "account.pivot2/v1", maxRows: 10000,
      params: { dimA: "account", dimB: "task", dateFrom: "2026-09-01", dateTo: "2026-09-02", media: "KUAISHOU" } });
  });
  it.each(["resource_position", "ubp", "agent_type", "bid_tool", "deduction_range"])("fails unsupported %s before source access", dimA => {
    expect(() => createDataQueryRegistry().resolve("account.pivot2", { ...params, dimA }, "platform"))
      .toThrowError(expect.objectContaining({ code: "DIMENSION_UNSUPPORTED" }));
  });
  it.each([{ ...params, sql: "SELECT 1" }, { ...params, taskIds: ["x", "x"] }, { ...params, taskIds: ["\n"] }, { ...params, filters: { biz: ["x"] } },
    { ...params, window_to: "2026-02-31" }, { ...params, window_to: "2026-10-02" }, { ...params, media: "" },
    { ...params, dateFrom: "2026-09-01" }])("does not ignore unknown or not-yet-supported filters %#", input => {
    expect(() => createDataQueryRegistry().resolve("account.pivot2", input, "platform"))
      .toThrowError(expect.objectContaining({ code: "INVALID_REQUEST" }));
  });
  it.each([{ taskIds: [] }, { taskIds: ["task-a", "启航-task-1"] }])("preserves explicit task IDs %j", ({ taskIds }) => {
    expect(createDataQueryRegistry().resolve("account.pivot2", { ...params, taskIds }, "platform").params).toMatchObject({ taskIds });
  });
  it.each(["ka_data", "reconcile"])("does not borrow %s", view => {
    expect(() => createDataQueryRegistry().resolve("account.pivot2", params, view))
      .toThrowError(expect.objectContaining({ code: "VIEW_UNSUPPORTED" }));
  });
});
