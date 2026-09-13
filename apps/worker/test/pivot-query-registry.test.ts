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
  it.each([{ ...params, sql: "SELECT 1" }, { ...params, taskIds: ["x", "x"] }, { ...params, taskIds: ["\n"] },
    { ...params, filters: { unknownFacet: ["x"] } },
    { ...params, window_to: "2026-02-31" }, { ...params, window_to: "2026-10-02" }, { ...params, media: "" },
    // v1.9.34 ⑩：两种日期拼法都认，但**不能混用**——混着给说明调用方自己没想清楚哪个生效，
    // 静默挑一个的代价是查了一个谁都没要求的窗口。给不全同理。
    { ...params, dateFrom: "2026-09-01" }, { dimA: "account", dimB: "task", media: "KUAISHOU" },
    { dimA: "account", dimB: "task", media: "KUAISHOU", dateFrom: "2026-09-01" }])(
    "does not ignore unknown or not-yet-supported filters %#", input => {
    expect(() => createDataQueryRegistry().resolve("account.pivot2", input, "platform"))
      .toThrowError(expect.objectContaining({ code: "INVALID_REQUEST" }));
  });
  it.each([{ taskIds: [] }, { taskIds: ["task-a", "启航-task-1"] }])("preserves explicit task IDs %j", ({ taskIds }) => {
    expect(createDataQueryRegistry().resolve("account.pivot2", { ...params, taskIds }, "platform").params).toMatchObject({ taskIds });
  });
  /** v1.9.34 ⑩：pivot2 键名与 summary 对齐（`dateFrom/dateTo` + `filters`），旧拼法保留一版。 */
  it("accepts the summary spelling and dashboard filters, normalizing to one shape", () => {
    const result = createDataQueryRegistry().resolve("account.pivot2",
      { dimA: "account", dimB: "task", dateFrom: "2026-09-01", dateTo: "2026-09-02", media: "KUAISHOU",
        filters: { biz: ["启航"] } }, "platform");
    expect(result.params).toMatchObject({ dateFrom: "2026-09-01", dateTo: "2026-09-02", filters: { biz: ["启航"] } });
    // 旧拼法归一化成同一个形状：下游只认 dateFrom/dateTo，不用两边都判一遍。
    expect(createDataQueryRegistry().resolve("account.pivot2", params, "platform").params)
      .toMatchObject({ dateFrom: "2026-09-01", dateTo: "2026-09-02" });
  });
  /** v1.9.34 ⑦：两条轴开放到命名维度与任意清洗段；不支持时把可用清单一并交出去。 */
  it.each(["optimizer", "goal", "placement", "segment:city", "segment:A_1"])("admits %s", dimA => {
    expect(createDataQueryRegistry().resolve("account.pivot2", { ...params, dimA }, "platform").params)
      .toMatchObject({ dimA });
  });
  it("names the usable dimensions instead of making the caller guess", () => {
    expect(() => createDataQueryRegistry().resolve("account.pivot2", { ...params, dimA: "ubp" }, "platform"))
      .toThrowError(expect.objectContaining({ code: "DIMENSION_UNSUPPORTED",
        details: { supported: ["account", "task", "biz", "optimizer", "goal", "placement", "segment:<key>"] } }));
  });
  it("keeps segments out of account.dimension, whose resolver only knows named dimensions", () => {
    // 段只对透视开放。这里放行不会立刻出错，会在更深的地方炸成一个调用方看不懂的解析错误。
    expect(() => createDataQueryRegistry().resolve("account.dimension",
      { dateFrom: "2026-09-01", dateTo: "2026-09-02", dimensionType: "segment:city", media: "KUAISHOU" }, "platform"))
      .toThrowError(expect.objectContaining({ code: "DIMENSION_UNSUPPORTED",
        details: { supported: ["account", "task", "biz", "optimizer", "goal", "placement"] } }));
  });
  it.each(["ka_data", "reconcile"])("does not borrow %s", view => {
    expect(() => createDataQueryRegistry().resolve("account.pivot2", params, view))
      .toThrowError(expect.objectContaining({ code: "VIEW_UNSUPPORTED" }));
  });
});
