import { describe, expect, it } from "vitest";
import { createDataQueryRegistry } from "../src/data/query-registry.js";
const registry = createDataQueryRegistry({ today: () => "2026-09-06" });
describe("public window params", () => {
  it("retains compare and preset through the canonical registry", () => {
    const query = registry.resolve("account.summary", { date_from: "2026-09-01", date_to: "2026-09-06", preset: "month_to_date", compare: "wow" }, "platform");
    expect(query.params).toMatchObject({ dateFrom: "2026-09-01", dateTo: "2026-09-06", preset: "month_to_date", compare: "wow" });
  });
  it("allows trend preset but does not silently accept unsupported trend comparisons", () => {
    expect(registry.resolve("account.trend", { date: "2026-09-06", preset: "today" }, "ka_data").params.preset).toBe("today");
    expect(() => registry.resolve("account.trend", { date: "2026-09-06", compare: "dod" }, "ka_data")).toThrow();
  });
  it.each([{ compare: "bad" }, { preset: "bad" }, { sql: "SELECT *" }])("rejects invalid or undeclared fields", (params) => {
    expect(() => registry.resolve("account.summary", { date: "2026-09-06", ...params }, "platform")).toThrow();
  });
});
