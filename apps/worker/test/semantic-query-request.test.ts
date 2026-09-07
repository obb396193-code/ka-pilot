import { describe, expect, it } from "vitest";
import { semanticQueryRequestSchema } from "../src/data/semantic-query-request.js";
import { createDataQueryRegistry } from "../src/data/query-registry.js";
import { readFileSync } from "node:fs";

describe("semantic query syntax adapter", () => {
  const vectors = JSON.parse(readFileSync(new URL("../../../packages/domain/test/fixtures/semantic-query-syntax.json", import.meta.url), "utf8")) as { input: unknown; expected: unknown }[];
  it.each(vectors)("matches the shared BFF/Worker syntax vector $input", ({ input, expected }) => {
    const actual = semanticQueryRequestSchema.safeParse(input);
    if (expected === null) expect(actual.success).toBe(false);
    else { expect(actual.success).toBe(true); if (actual.success) expect(actual.data).toEqual(expected); }
  });
  it("preserves date endpoints, preset and comparison for the same registry", () => {
    const body = semanticQueryRequestSchema.parse({ query_type: "summary", date_from: "2026-08-23", date_to: "2026-08-24",
      compare: "wow", preset: "custom", filters: { media: "KUAISHOU", account_id: "same" } });
    expect(body).toEqual({ queryId: "account.summary", params: { date_from: "2026-08-23", date_to: "2026-08-24",
      compare: "wow", preset: "custom", media: "KUAISHOU", accountIds: ["same"] } });
    expect(createDataQueryRegistry().resolve(body.queryId, body.params, "platform").params).toMatchObject({
      dateFrom: "2026-08-23", dateTo: "2026-08-24", compare: "wow", preset: "custom", accountIds: ["same"],
    });
  });
  it("maps page/page_size without providing an independent validation/default path", () => {
    const parse = (page_size: unknown) => semanticQueryRequestSchema.parse({ query_type: "table", date: "2026-08-24", page: 2, page_size });
    const valid = parse(20);
    expect(createDataQueryRegistry().resolve(valid.queryId, valid.params, "platform").params).toMatchObject({ page: 2, pageSize: 20 });
    for (const value of [0, 501, "20", null]) {
      const invalid = parse(value);
      expect(() => createDataQueryRegistry().resolve(invalid.queryId, invalid.params, "platform")).toThrow();
    }
  });
  it.each([
    null, [], { query_type: "summary", filters: null }, { query_type: "summary", filters: { sql: "SELECT 1" } },
    { query_type: "summary", params: {} }, { query_type: "summary", workspaceId: "forged" },
    { query_type: "summary", queryId: "account.summary" }, { query_type: "admin/data/reconcile" },
  ])("rejects invalid syntax without leaking input in an issue %j", (input) => {
    expect(semanticQueryRequestSchema.safeParse(input).success).toBe(false);
  });
  it.each(["dimension", "health", "tier"])("does not fake unregistered %s capability", (query_type) => {
    expect(semanticQueryRequestSchema.safeParse({ query_type, date: "2026-08-24" }).success).toBe(false);
  });
  it.each([{ filters: { owner: "synthetic" } }, { columns: ["cost"] }, { dimension_type: "task" }])(
    "never drops a valid-but-not-yet-implemented selector %j", (selectors) => {
      const body = semanticQueryRequestSchema.parse({ query_type: "table", date: "2026-08-24", ...selectors });
      expect(() => createDataQueryRegistry().resolve(body.queryId, body.params, "platform")).toThrow();
    },
  );
  it("canonical syntax stays unchanged and keeps source selection server-side", () => {
    const input = { queryId: "account.trend", params: { date: "2026-08-24" } };
    expect(semanticQueryRequestSchema.parse(input)).toEqual(input);
    expect(semanticQueryRequestSchema.safeParse({ ...input, dataView: "ka_data" }).success).toBe(false);
  });
});
