import { describe, expect, it, vi } from "vitest";
import type { QueryResult, QueryResultRow } from "pg";
import type { ApprovedWorkspaceAuthContext } from "@ka/domain";
import { PlatformHealthRepository, PlatformHealthContractError,
  type PlatformHealthClient } from "../src/platform-health-repository.js";

const auth: ApprovedWorkspaceAuthContext = {
  workspaceId: "00000000-0000-4000-8000-000000000001",
  userId: "00000000-0000-4000-8000-000000000002", role: "optimizer", workspaceKind: "personal",
  scope: { kind: "explicit_accounts", accounts: [{ media: "KUAISHOU", accountId: "same", accessLevel: "read" }] },
};
const date = "2026-09-07";
const timestamp = "2026-09-07T01:00:00.000Z";
const normal = { accounts: "1", with_data: "1", missing_sync_time: "0", data_as_of: timestamp };
function fake(row: unknown = normal, failure = false, rowCount = 1, rollbackFailure = false) {
  const calls: { sql: string; values?: unknown[] }[] = [];
  const client: PlatformHealthClient = {
    query: async <Row extends QueryResultRow>(sql: string, values?: unknown[]): Promise<QueryResult<Row>> => {
      calls.push({ sql, ...(values ? { values } : {}) });
      if (sql.includes("platform-health-coverage") && failure) throw new Error("synthetic database failure");
      if (sql === "ROLLBACK" && rollbackFailure) throw new Error("synthetic rollback failure");
      return { rows: (sql.includes("platform-health-coverage") ? Array.from({ length: rowCount }, () => row) : []) as Row[],
        rowCount: 1, command: "SELECT", oid: 0, fields: [] };
    }, release: vi.fn(),
  };
  const connect = vi.fn(async () => client);
  return { repository: new PlatformHealthRepository({ connect }), calls, client, connect };
}
describe("PlatformHealthRepository boundary", () => {
  it("binds trusted tuples and date in one RR/RO snapshot, without generating a timestamp", async () => {
    const f = fake();
    expect(await f.repository.read(auth, date)).toEqual({ businessDate: date,
      coverage: { accounts: 1, withData: 1 }, missingSyncTime: 0, dataAsOf: timestamp });
    expect(f.calls.map(c => c.sql.split("\n")[0])).toEqual([
      "BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY", "/* platform-health-coverage */", "COMMIT",
    ]);
    expect(f.calls[1]?.values).toEqual([auth.workspaceId, date, "personal",
      JSON.stringify([{ media: "KUAISHOU", account_id: "same" }])]);
    expect(f.calls[1]?.sql).not.toContain("same");
    expect(f.client.release).toHaveBeenCalledOnce();
  });
  it("passes no account grants for approved team scope", async () => {
    const f = fake();
    await f.repository.read({ ...auth, workspaceKind: "team", scope: { kind: "team_workspace_readonly" } }, date);
    expect(f.calls[1]?.values?.slice(2)).toEqual(["team", "[]"]);
  });
  it("preserves empty scope as zero observations, not ready", async () => {
    const f = fake({ accounts: "0", with_data: "0", missing_sync_time: "0", data_as_of: null });
    const value = await f.repository.read({ ...auth, scope: { kind: "explicit_accounts", accounts: [] } }, date);
    expect(value).toEqual({ businessDate: date, coverage: { accounts: 0, withData: 0 }, missingSyncTime: 0, dataAsOf: null });
    expect(f.calls[1]?.values?.[3]).toBe("[]");
  });
  it("preserves partially and wholly missing timestamps", async () => {
    expect((await fake({ ...normal, accounts: "2", with_data: "2", missing_sync_time: "1" })
      .repository.read({ ...auth, workspaceKind: "team", scope: { kind: "team_workspace_readonly" } }, date)).missingSyncTime).toBe(1);
    expect((await fake({ ...normal, missing_sync_time: "1", data_as_of: null })
      .repository.read(auth, date)).dataAsOf).toBeNull();
  });
  it.each([null, "", "NaN", "Infinity", "1.2", "-1", "9007199254740993", true])("rejects invalid count %s", async (value) => {
    const f = fake({ ...normal, accounts: value });
    await expect(f.repository.read(auth, date)).rejects.toBeInstanceOf(PlatformHealthContractError);
    expect(f.calls.at(-1)?.sql).toBe("ROLLBACK"); expect(f.client.release).toHaveBeenCalledOnce();
  });
  it.each([
    { ...normal, accounts: "0" }, { ...normal, missing_sync_time: "2" },
    { ...normal, data_as_of: null }, { ...normal, data_as_of: "secret-invalid-time" },
    { ...normal, missing_sync_time: "1" },
    { accounts: "0", with_data: "0", missing_sync_time: "0", data_as_of: timestamp },
  ])("rejects internally inconsistent observation %#", async (row) => {
    await expect(fake(row).repository.read(auth, date)).rejects.toThrow("Invalid platform health observation");
  });
  it("rejects duplicate tuples and invalid auth/date before opening DB", async () => {
    const f = fake();
    const duplicate = { ...auth, scope: { kind: "explicit_accounts", accounts: [auth.scope.accounts[0], auth.scope.accounts[0]] } };
    for (const input of [null, { ...auth, workspaceKind: "team" }, duplicate, { ...auth, sql: "synthetic" }]) {
      await expect(f.repository.read(input, date)).rejects.toThrow();
    }
    await expect(f.repository.read(auth, "2026-02-31")).rejects.toThrow();
    expect(f.connect).not.toHaveBeenCalled();
  });
  it("rolls back connection-query failure without leaking it as an observation", async () => {
    const f = fake(normal, true);
    await expect(f.repository.read(auth, date)).rejects.toThrow("synthetic database failure");
    expect(f.calls.at(-1)?.sql).toBe("ROLLBACK"); expect(f.client.release).toHaveBeenCalledOnce();
  });
  it("requires exactly one aggregate row and the exact personal denominator", async () => {
    for (const rows of [0, 2]) await expect(fake(normal, false, rows).repository.read(auth, date)).rejects.toBeInstanceOf(PlatformHealthContractError);
    await expect(fake({ ...normal, accounts: "2" }).repository.read(auth, date)).rejects.toBeInstanceOf(PlatformHealthContractError);
  });
  it("accepts pg Date and numeric counts but rejects invalid dates and unsafe numbers", async () => {
    expect((await fake({ accounts: 1, with_data: 1, missing_sync_time: 0, data_as_of: new Date(timestamp) })
      .repository.read(auth, date)).dataAsOf).toBe(timestamp);
    for (const invalid of [new Date(NaN), "2026-02-31T00:00:00Z", "2026-09-07T99:00:00Z", 123]) {
      await expect(fake({ ...normal, data_as_of: invalid }).repository.read(auth, date)).rejects.toBeInstanceOf(PlatformHealthContractError);
    }
    for (const invalid of [NaN, Infinity, 1.2, -1]) {
      await expect(fake({ ...normal, accounts: invalid }).repository.read(auth, date)).rejects.toBeInstanceOf(PlatformHealthContractError);
    }
  });
  it("preserves the original failure if rollback fails, and still releases", async () => {
    const f = fake(normal, true, 1, true);
    await expect(f.repository.read(auth, date)).rejects.toThrow("synthetic database failure");
    expect(f.client.release).toHaveBeenCalledOnce();
  });
});
