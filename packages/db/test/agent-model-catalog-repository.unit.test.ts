import { describe, expect, it, vi } from "vitest";
import type { Pool } from "pg";
import { AgentModelCatalogRepository } from "../src/agent-model-catalog-repository.js";

const auth = { workspaceId: "11111111-1111-4111-8111-111111111111", userId: "22222222-2222-4222-8222-222222222222",
  role: "optimizer", workspaceKind: "personal", scope: { kind: "explicit_accounts", accounts: [] } };
const row = { provider_id: "synthetic", model: "model-a", status: "verified", tested_at: "2026-09-08T01:00:00Z", test_version: "test-v1" };
function setup(rows: unknown[] = [row]) {
  const query = vi.fn(async (sql: string) => ({ rows: sql.includes("agent-model-catalog") ? rows : [] }));
  const release = vi.fn(), connect = vi.fn(async () => ({ query, release, on: vi.fn(), removeListener: vi.fn() }));
  return { query, release, connect, repository: new AgentModelCatalogRepository({ connect } as unknown as Pool) };
}
describe("model catalog repository boundary", () => {
  it("fails malformed context before DB", async () => {
    const s = setup(); await expect(s.repository.list({ ...auth, userId: "bad" })).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(s.connect).not.toHaveBeenCalled();
  });
  it("reads non-business catalog for empty personal and readonly team scope", async () => {
    const s = setup();
    for (const context of [auth, { ...auth, workspaceKind: "team", scope: { kind: "team_workspace_readonly" } }])
      expect(await s.repository.list(context)).toEqual({ items: [{ id: "model-a", provider: "synthetic", label: "model-a", default: false, status: "verified" }] });
    expect(s.query.mock.calls[0]?.[0]).toContain("REPEATABLE READ READ ONLY");
    const sql = s.query.mock.calls.find(c => c[0].includes("agent-model-catalog"))![0];
    expect(sql).toContain("LIMIT 1001"); expect(sql).not.toMatch(/SELECT \*|secret_ref|error_summary|credentials/i);
  });
  it.each(["failed", "disabled"])("projects %s as disabled", async status => {
    expect(await setup([{ ...row, status }]).repository.list(auth)).toMatchObject({ items: [{ status: "disabled", default: false }] });
  });
  it.each([{ tested_at: null }, { test_version: null }])("never claims unproven verified status %j", async patch => {
    expect(await setup([{ ...row, ...patch }]).repository.list(auth)).toMatchObject({ items: [{ status: "documented_unverified" }] });
  });
  it.each([{ status: "bogus" }, { model: 4 }, { tested_at: "invalid" }, { test_version: "" }, { model: "x".repeat(257) }])("rejects present-invalid data %j", async patch => {
    const s = setup([{ ...row, ...patch }]); await expect(s.repository.list(auth)).rejects.toMatchObject({ code: "UPSTREAM_INVALID_RESPONSE" });
    expect(s.query.mock.calls.at(-1)?.[0]).toBe("ROLLBACK");
  });
  it("uses sentinel to distinguish exact 1000 from overflow", async () => {
    const rows = Array.from({ length: 1001 }, (_, i) => ({ ...row, model: `model-${i}` }));
    expect((await setup(rows.slice(0, 1000)).repository.list(auth)).items).toHaveLength(1000);
    await expect(setup(rows).repository.list(auth)).rejects.toMatchObject({ code: "SOURCE_TRUNCATED" });
    await expect(setup([row, row]).repository.list(auth)).rejects.toMatchObject({ code: "UPSTREAM_INVALID_RESPONSE" });
  });
  it("sanitizes DB failures, including commit/rollback errors", async () => {
    const s = setup(); s.query.mockImplementation(async sql => { if (sql === "COMMIT" || sql === "ROLLBACK") throw new Error("SQL secret"); return { rows: sql.includes("agent-model-catalog") ? [row] : [] }; });
    await expect(s.repository.list(auth)).rejects.toThrow(/^Model catalog: SOURCE_UNAVAILABLE$/); expect(s.release).toHaveBeenCalledWith(true);
  });
});
