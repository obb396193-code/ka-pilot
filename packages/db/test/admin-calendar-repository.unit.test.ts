import { describe, expect, it, vi } from "vitest";
import type { Pool } from "pg";
import { AdminCalendarRepository } from "../src/admin-calendar-repository.js";
const auth = { workspaceId: "11111111-1111-4111-8111-111111111111", userId: "22222222-2222-4222-8222-222222222222", role: "admin", workspaceKind: "personal", scope: { kind: "explicit_accounts", accounts: [] } };
const row = { workspace_id: auth.workspaceId, id: "1", event_date: "2026-09-08", event_type: "promo", label: "synthetic", affects_baseline: true, threshold_profile: null };
function setup(rows: unknown[] = [row]) {
  const query = vi.fn(async (sql: string, values?: unknown[]) => { void values; return { rows: sql.includes("admin-calendar") ? rows : [] }; });
  const release = vi.fn(), connect = vi.fn(async () => ({ query, release, on: vi.fn(), removeListener: vi.fn() }));
  return { query, connect, release, repo: new AdminCalendarRepository({ connect } as unknown as Pool) };
}
describe("admin calendar repository boundary", () => {
  it("validates context and represents empty configuration without fabricated entries", async () => {
    const s = setup([]);
    await expect(s.repo.list({ ...auth, userId: "invalid" })).rejects.toMatchObject({ code: "FORBIDDEN" }); expect(s.connect).not.toHaveBeenCalled();
    expect(await s.repo.list(auth)).toEqual({ workspaceId: auth.workspaceId, items: [] });
  });
  it.each(["optimizer", "operator", "lead"])("rejects %s before DB", async role => {
    const s = setup(); await expect(s.repo.list({ ...auth, role })).rejects.toMatchObject({ code: "FORBIDDEN" }); expect(s.connect).not.toHaveBeenCalled();
  });
  it("reads only bound workspace in RR/RO and allows admin empty grants", async () => {
    const s = setup(); expect(await s.repo.list(auth)).toMatchObject({ workspaceId: auth.workspaceId, items: [{ id: 1, thresholdProfile: null }] });
    expect(s.query.mock.calls[0]![0]).toContain("REPEATABLE READ READ ONLY");
    const call = s.query.mock.calls.find(c => c[0].includes("admin-calendar"))!;
    expect(call[0]).toContain("WHERE workspace_id=$1"); expect(call[0]).toContain("LIMIT 10001"); expect(call[1]).toEqual([auth.workspaceId]);
  });
  it.each([{ workspace_id: "foreign" }, { id: "9007199254740993" }, { event_date: "2026-02-31" }, { label: null }, { affects_baseline: null }, { event_type: null }, { threshold_profile: "" }])("rejects invalid row %j", async patch => {
    const s = setup([{ ...row, ...patch }]); await expect(s.repo.list(auth)).rejects.toMatchObject({ code: "UPSTREAM_INVALID_RESPONSE" }); expect(s.query.mock.calls.at(-1)![0]).toBe("ROLLBACK");
  });
  it("distinguishes 10000 from sentinel overflow and rejects duplicates", async () => {
    const rows = Array.from({ length: 10001 }, (_, i) => ({ ...row, id: String(10001 - i) }));
    expect((await setup(rows.slice(0, 10000)).repo.list(auth)).items).toHaveLength(10000);
    await expect(setup(rows).repo.list(auth)).rejects.toMatchObject({ code: "SOURCE_TRUNCATED" });
    await expect(setup([row, row]).repo.list(auth)).rejects.toMatchObject({ code: "UPSTREAM_INVALID_RESPONSE" });
  });
  it("sanitizes failures and distinguishes server query timeout", async () => {
    for (const [failure, code] of [[new Error("SQL secret"), "SOURCE_UNAVAILABLE"], [{ code: "57014", message: "SQL secret" }, "UPSTREAM_TIMEOUT"]] as const) {
      const s = setup(); s.query.mockImplementation(async () => { throw failure; });
      await expect(s.repo.list(auth)).rejects.toThrow(`Calendar request: ${code}`);
    }
  });
});
