import type { Pool } from "pg";
import { describe, expect, it, vi } from "vitest";
import { SemanticQueryRepository } from "../src/semantic-query-repository.js";
const workspaceId = "00000000-0000-4000-8000-000000000024";
const scope = { workspaceId, dateFrom: "2026-08-01", dateTo: "2026-08-03",
  filters: { taskId: "task-a", accountScopes: [{ media: "KUAISHOU", accountId: "same" }, { media: "TENCENT", accountId: "same" }] } };
function fixture(expected: unknown, empty = false) {
  const query = vi.fn(async () => ({ rows: [{ data_as_of: null, canonical_rows: empty ? "0" : "2", returned_accounts: empty ? "0" : "1", account_days: empty ? "0" : "2", expected_account_days: expected }] }));
  return { query, repository: new SemanticQueryRepository({ query } as unknown as Pool) };
}
describe("task filtered query lineage", () => {
  it("counts expected effective task/account days in SQL, not grantCount times window days", async () => {
    const f = fixture("3"), result = await f.repository.queryLineage(scope);
    expect(result).toMatchObject({ requestedAccountDays: 3, returnedAccountDays: 2, returnedAccounts: 1 });
    const [sql, values] = f.query.mock.calls[0]! as unknown as [string, unknown[]];
    expect(sql).toContain("expected_metric"); expect(sql).toContain("expected_account_days");
    expect(sql.match(/filtered_relation\.task_id =/g)).toHaveLength(2);
    expect(values).toContain("task-a"); expect(sql).not.toContain("task-a");
    expect(sql).toContain("allowed.media = metric.media");
  });
  it.each([undefined, null, "NaN", "Infinity", "", "-1", "1.5", "9007199254740992"])("rejects invalid expected-day proof %j", async (value) => {
    await expect(fixture(value).repository.queryLineage(scope)).rejects.toThrow();
  });
  it("allows no effective task days as known empty, not six missing grant-days", async () => {
    const f = fixture("0", true);
    expect((await f.repository.queryLineage(scope)).requestedAccountDays).toBe(0);
  });
  it("rejects impossible coverage counts", async () => {
    await expect(fixture("0").repository.queryLineage(scope)).rejects.toThrow();
    await expect(fixture("7").repository.queryLineage(scope)).rejects.toThrow();
  });
});
