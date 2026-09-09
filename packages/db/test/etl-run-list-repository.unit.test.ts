import { describe, expect, it, vi } from "vitest";
import type { Pool } from "pg";
// Use public barrel: catch missing/stale exports at the integration boundary.
import { EtlRunListRepository } from "../src/index.js";
const auth = { workspaceId: "11111111-1111-4111-8111-111111111111", userId: "22222222-2222-4222-8222-222222222222", role: "admin",
  workspaceKind: "personal", scope: { kind: "explicit_accounts", accounts: [] } };
const row = { workspace_id: auth.workspaceId, id: "9007199254740993", job_id: "33333333-3333-4333-8333-333333333333",
  run_kind: "incr", status: "done", business_date: "2026-09-09", started_at: new Date("2026-09-09T01:00:00Z"),
  finished_at: new Date("2026-09-09T02:00:00Z"), rows_ingested: 1, step_failed: null,
  scope_valid: true, warnings_valid: true, oversized: false, has_execution: false, warnings: [] };
function setup(rows: unknown[] = [row], summary: unknown[] = [{ total: "1", data_as_of: row.finished_at }]) {
  const query = vi.fn(async (sql: string, params?: unknown[]) => { void params;
    return { rows: sql.includes("etl-run-page-summary") ? summary : sql.includes("etl-run-page-items") ? rows : [] }; });
  const release = vi.fn(), connect = vi.fn(async () => ({ query, release, on: vi.fn(), removeListener: vi.fn() }));
  return { repo: new EtlRunListRepository({ connect } as unknown as Pool), query, release };
}
describe("ETL page projection boundary", () => {
  it("keeps bigint and binds workspace/page rather than interpolating input", async () => {
    const state = setup(); const result = await state.repo.list(auth, {});
    expect(result.data.items[0]?.runId).toBe("9007199254740993");
    expect(state.query.mock.calls.find(call => call[0].includes("etl-run-page-items"))?.[1]).toEqual([auth.workspaceId, 50, 0, 16 * 1024 * 1024]);
    expect(state.release).toHaveBeenCalledWith(false);
  });
  it.each([{ workspace_id: "foreign" }, { scope_valid: "true" }, { warnings_valid: false }, { oversized: null },
    { has_execution: "false" }, { warnings: null }, { run_kind: "toString" }, { run_kind: "private" },
    { rows_ingested: -1 }, { rows_ingested: "1" }, { started_at: "2026-09-09T01:00:00Z" },
    { finished_at: new Date(NaN) }, { has_execution: true, execution_attempt: null }])("rejects malformed DB projection %#", async patch => {
    const state = setup([{ ...row, ...patch }]);
    await expect(state.repo.list(auth, {})).rejects.toMatchObject({ code: "UPSTREAM_INVALID_RESPONSE" });
    expect(state.query.mock.calls.at(-1)?.[0]).toBe("ROLLBACK");
  });
  it.each([[], [{ total: "1", data_as_of: null }, { total: "1", data_as_of: null }],
    [{ total: "NaN", data_as_of: null }], [{ total: "9007199254740992", data_as_of: null }],
    [{ total: "0", data_as_of: null }], [{ total: "1", data_as_of: "fake-clock" }]].map(summary => ({ summary })))("rejects summary corruption %#", async ({ summary }) => {
    await expect(setup([row], summary).repo.list(auth, {})).rejects.toMatchObject({ code: "UPSTREAM_INVALID_RESPONSE" });
  });
  it("maps known timeout separately without returning driver SQL/body details", async () => {
    for (const [failure, code] of [[{ code: "57014", message: "private SQL" }, "UPSTREAM_TIMEOUT"],
      [new Error("private URL/token"), "SOURCE_UNAVAILABLE"]] as const) {
      const state = setup(); state.query.mockImplementation(async () => { throw failure; });
      await expect(state.repo.list(auth, {})).rejects.toThrow(`ETL run list: ${code}`);
    }
  });
});
