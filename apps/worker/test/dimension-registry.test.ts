import { describe, expect, it } from "vitest";
import { createDataQueryRegistry } from "../src/data/query-registry.js";
import { semanticQueryRequestSchema } from "../src/data/semantic-query-request.js";
const registry = createDataQueryRegistry({ today: () => "2026-09-07" });
describe("dimension registry capability boundary", () => {
  it("resolves canonical and legacy syntax through one registry", () => {
    const parsed = semanticQueryRequestSchema.parse({ query_type: "dimension", dimension_type: "account", date_from: "2026-09-01", date_to: "2026-09-05" });
    const resolved = registry.resolve(parsed.queryId, parsed.params, "platform");
    expect(resolved).toMatchObject({ queryId: "account.dimension", rowSchemaVersion: "account.dimension/v3", outputShape: "aggregate",
      params: { dimensionType: "account", dateFrom: "2026-09-01", dateTo: "2026-09-05" } });
  });
  it.each(["task", "biz"])("resolves implemented %s with bounded window", (dimensionType) => {
    expect(registry.resolve("account.dimension", { date: "2026-09-01", dimensionType }, "platform").params.dimensionType).toBe(dimensionType);
  });
  it.each(["agent_type", "resource_position", "bid_tool", "ubp", "deduction_range"])("does not pretend %s is implemented by the account reader", (dimensionType) => {
    expect(() => registry.resolve("account.dimension", { date: "2026-09-01", dimensionType }, "platform")).toThrow(expect.objectContaining({ code: "DIMENSION_UNSUPPORTED" }));
  });
  it.each([{}, { dimensionType: "guessed" }, { dimensionType: "account", taskId: "task" },
    { dimensionType: "account", compare: "wow" }, { dimensionType: "account", sql: "SELECT 1" }])("rejects invalid or unsupported selectors %j", (extra) => {
    expect(() => registry.resolve("account.dimension", { date: "2026-09-01", ...extra }, "platform")).toThrow();
  });
  it("rejects team live fallback and windows beyond 31 days", () => {
    expect(() => registry.resolve("account.dimension", { date: "2026-09-01", dimensionType: "account" }, "ka_data")).toThrow(expect.objectContaining({ code: "VIEW_UNSUPPORTED" }));
    expect(() => registry.resolve("account.dimension", { dateFrom: "2026-08-01", dateTo: "2026-09-01", dimensionType: "account" }, "platform")).toThrow();
  });
});
