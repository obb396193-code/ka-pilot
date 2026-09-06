import type { Pool } from "pg";
import { describe, expect, it, vi } from "vitest";
import { queryMetricDimension } from "../src/semantic-query-dimension.js";
import { SemanticQueryContractError } from "../src/semantic-query-support.js";

const workspaceId = "00000000-0000-4000-8000-000000000001";
const scope = { workspaceId, dateFrom: "2026-08-01", dateTo: "2026-08-31", dimension: "account" as const,
  filters: { accountScopes: [{ media: "KUAISHOU", accountId: "same" }, { media: "TENCENT", accountId: "same" }] } };
const row = (media = "KUAISHOU") => ({ workspace_id: workspaceId, media, dimension_key: "same", dimension_label: "same label",
  row_count: "1", account_count: "1", cost: "10", exposure: "100", click: "10", conversion: "2",
  real_conversion: "1", cash_cost: "8", cost_space: "2", wake_uv: null, potential_uv: null, anomaly_rows: "0" });
function fixture(rows: unknown[]) {
  const query = vi.fn().mockResolvedValue({ rows });
  return { query, connection: { query } as unknown as Pick<Pool, "query"> };
}

describe("dimension internal tuple and result boundary", () => {
  it("preserves two media with the same ID and name, using a tuple GROUP BY and stable tie-break", async () => {
    const f = fixture([row(), row("TENCENT")]);
    const result = await queryMetricDimension(f.connection, scope);
    expect(result.map((value) => value.accountIdentity)).toEqual(scope.filters.accountScopes.map((account) => ({ workspaceId, ...account })));
    const sql = f.query.mock.calls[0]![0] as string;
    expect(sql).toContain("GROUP BY metric.workspace_id, metric.media, metric.account_id, account.account_name");
    expect(sql).toContain('metric.media COLLATE "C"');
    expect(sql).toContain("LIMIT 10001");
    expect(f.query.mock.calls[0]![1]).toContain(JSON.stringify(scope.filters.accountScopes.map((a) => ({ media: a.media, account_id: a.accountId }))));
  });
  it.each([
    { workspace_id: "00000000-0000-4000-8000-000000000002" }, { workspace_id: undefined },
    { media: "TOUTIAO" }, { media: null }, { dimension_key: "other" }, { dimension_key: null },
    { dimension_label: 12 }, { account_count: "2" }, { cost: "" }, { cost: "not-a-number" }, { click: "NaN" },
  ])("rejects invalid or unapproved returned account evidence %j", async (patch) => {
    await expect(queryMetricDimension(fixture([{ ...row(), ...patch }]).connection, scope)).rejects.toBeInstanceOf(SemanticQueryContractError);
  });
  it("rejects duplicate tuple and rows returned for empty grants", async () => {
    await expect(queryMetricDimension(fixture([row(), row()]).connection, scope)).rejects.toBeInstanceOf(SemanticQueryContractError);
    await expect(queryMetricDimension(fixture([row()]).connection, { ...scope, filters: { accountScopes: [] } })).rejects.toBeInstanceOf(SemanticQueryContractError);
  });
  it("retains ordinary media/account selectors without widening a returned row", async () => {
    for (const filters of [{ media: "TENCENT" }, { accountId: "other" }, { accountIds: ["other"] }, { accountIds: [] }]) {
      await expect(queryMetricDimension(fixture([row()]).connection, { ...scope, filters })).rejects.toBeInstanceOf(SemanticQueryContractError);
    }
  });
  it("rejects overflow sentinel and exact 16MB, not just above the boundary", async () => {
    await expect(queryMetricDimension(fixture(Array.from({ length: 10001 }, () => row())).connection, scope)).rejects.toBeInstanceOf(SemanticQueryContractError);
    const result = [row()]; result[0]!.dimension_label = "";
    result[0]!.dimension_label = "x".repeat(16 * 1024 * 1024 - Buffer.byteLength(JSON.stringify(result)));
    expect(Buffer.byteLength(JSON.stringify(result))).toBe(16 * 1024 * 1024);
    await expect(queryMetricDimension(fixture(result).connection, scope)).rejects.toBeInstanceOf(SemanticQueryContractError);
  });
  it("accepts exactly 10000 unique groups because local SQL has a 10001 overflow sentinel", async () => {
    const rows = Array.from({ length: 10000 }, (_, i) => ({ ...row(), dimension_key: `synthetic-${i}` }));
    const result = await queryMetricDimension(fixture(rows).connection, { ...scope, filters: {} });
    expect(result).toHaveLength(10000);
  });
  it("keeps task/biz null groups and missing labels, without inventing account identity", async () => {
    for (const dimension of ["task", "biz"] as const) {
      const query = vi.fn().mockResolvedValueOnce({ rows: [] }).mockResolvedValueOnce({ rows: [{ ...row(), dimension_key: null, dimension_label: null }] });
      const values = await queryMetricDimension({ query } as unknown as Pick<Pool, "query">, { ...scope, dimension });
      expect(values[0]?.dimensionKey).toBeNull(); expect(values[0]?.dimensionLabel).toBeNull();
      expect(values[0]).not.toHaveProperty("accountIdentity");
    }
  });
  it("rejects malformed counts and duplicate task groups", async () => {
    for (const patch of [{ row_count: "1.5" }, { account_count: "-1" }, { anomaly_rows: "2" }, { cost: undefined }]) {
      await expect(queryMetricDimension(fixture([{ ...row(), ...patch }]).connection, scope)).rejects.toBeInstanceOf(SemanticQueryContractError);
    }
    const query = vi.fn().mockResolvedValueOnce({ rows: [] }).mockResolvedValueOnce({ rows: [row(), { ...row(), dimension_label: null }] });
    await expect(queryMetricDimension({ query } as unknown as Pick<Pool, "query">, { ...scope, dimension: "task" })).rejects.toBeInstanceOf(SemanticQueryContractError);
  });
  it("preserves zero observed counts and a missing account name", async () => {
    const result = await queryMetricDimension(fixture([{ ...row(), row_count: 0, account_count: 0,
      anomaly_rows: 0, cost: null, dimension_label: null }]).connection, scope);
    expect(result[0]?.accountIdentity).toEqual({ workspaceId, media: "KUAISHOU", accountId: "same" });
    expect(result[0]?.metrics.cost).toBeNull(); expect(result[0]?.dimensionLabel).toBeNull();
  });
  it("rejects unsupported dimensions before SQL and task overlap before aggregate output", async () => {
    const f = fixture([]);
    await expect(queryMetricDimension(f.connection, { ...scope, dimension: "ubp" as "account" })).rejects.toThrow("Unsupported dimension");
    expect(f.query).not.toHaveBeenCalled();
    const query = vi.fn().mockResolvedValue({ rows: [{ account_id: "same", ds: "2026-08-01", task_ids: ["one", "two"] }] });
    await expect(queryMetricDimension({ query } as unknown as Pick<Pool, "query">, { ...scope, dimension: "task" })).rejects.toThrow("overlapping task mappings");
    expect(query).toHaveBeenCalledTimes(1);
  });
  it("keeps a task filter parameterized on the effective relation", async () => {
    const query = vi.fn().mockResolvedValue({ rows: [] });
    const taskId = "synthetic-task-quoted'";
    await queryMetricDimension({ query } as unknown as Pick<Pool, "query">, { ...scope, dimension: "task", filters: { taskId } });
    const [sql, values] = query.mock.calls[1]!;
    expect(sql).toContain("AND relation.task_id = $4"); expect(sql).not.toContain(taskId);
    expect(values).toContain(taskId);
  });
});
