import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { Pool } from "pg";
import type { ApprovedWorkspaceAuthContext } from "@ka/domain";
import { runMigrations } from "../src/migrate.js";
import { PlatformHealthRepository } from "../src/platform-health-repository.js";

// Synthetic fixtures only; never fall back to shared ka or create a new database.
const databaseUrl = process.env.TEST_DATABASE_URL;
if (!databaseUrl) throw new Error("A dedicated local TEST_DATABASE_URL is required");
const target = new URL(databaseUrl);
if (!["localhost", "127.0.0.1", "[::1]"].includes(target.hostname) || target.port !== "55432" ||
  !/^\/ka_[a-z0-9_]*_test$/.test(target.pathname)) throw new Error("A dedicated local test database is required");

describe("PlatformHealthRepository real PG", () => {
  const pool = new Pool({ connectionString: databaseUrl, max: 2 });
  const repository = new PlatformHealthRepository(pool);
  const ds = "2026-09-07", early = "2026-09-07T01:00:00.000Z", later = "2026-09-07T02:00:00.000Z";
  let auth: ApprovedWorkspaceAuthContext;
  let otherId: string;
  beforeAll(async () => { await runMigrations({ databaseUrl }); }, 30000);
  afterAll(async () => { await pool.end(); });
  beforeEach(async () => {
    const ws = await pool.query<{ id: string }>("INSERT INTO workspaces(name) VALUES($1),($2) RETURNING id",
      [`health-${randomUUID()}`, `health-other-${randomUUID()}`]);
    const workspaceId = ws.rows[0]!.id; otherId = ws.rows[1]!.id;
    auth = { workspaceId, userId: randomUUID(), role: "optimizer", workspaceKind: "personal",
      scope: { kind: "explicit_accounts", accounts: [{ media: "KUAISHOU", accountId: "same", accessLevel: "read" }] } };
    await pool.query(`INSERT INTO accounts(workspace_id,media,account_id) VALUES
      ($1,'KUAISHOU','same'), ($1,'TENCENT','same'), ($1,'KUAISHOU','empty'), ($2,'KUAISHOU','same')`, [workspaceId, otherId]);
    await pool.query(`INSERT INTO account_metrics_daily(workspace_id,media,account_id,ds,computed_at) VALUES
      ($1,'KUAISHOU','same',$3,$4), ($1,'TENCENT','same',$3,$5), ($2,'KUAISHOU','same',$3,'2026-09-07T03:00:00Z'),
      ($1,'KUAISHOU','same','2026-09-06','2026-09-07T04:00:00Z')`, [workspaceId, otherId, ds, early, later]);
  });
  it("excludes newer same-ID cross-media, cross-workspace and other-day observations", async () => {
    expect(await repository.read(auth, ds)).toEqual({ businessDate: ds,
      coverage: { accounts: 1, withData: 1 }, missingSyncTime: 0, dataAsOf: early });
  });
  it("includes both media only with both explicit tuple grants", async () => {
    const scoped = { ...auth, scope: { kind: "explicit_accounts", accounts: [
      { media: "KUAISHOU", accountId: "same", accessLevel: "read" },
      { media: "TENCENT", accountId: "same", accessLevel: "read" },
    ] } };
    expect(await repository.read(scoped, ds)).toMatchObject({ coverage: { accounts: 2, withData: 2 }, dataAsOf: later });
  });
  it("does not drop explicitly granted but not-yet-synced accounts from the denominator", async () => {
    const scoped = { ...auth, scope: { kind: "explicit_accounts", accounts: [
      { media: "KUAISHOU", accountId: "same", accessLevel: "read" },
      { media: "KUAISHOU", accountId: "not-yet-in-master", accessLevel: "read" },
    ] } };
    expect(await repository.read(scoped, ds)).toMatchObject({ coverage: { accounts: 2, withData: 1 } });
  });
  it("empty grants do not expose workspace totals or timestamps", async () => {
    expect(await repository.read({ ...auth, scope: { kind: "explicit_accounts", accounts: [] } }, ds))
      .toEqual({ businessDate: ds, coverage: { accounts: 0, withData: 0 }, missingSyncTime: 0, dataAsOf: null });
  });
  it("team scope covers current workspace only, never parses grants", async () => {
    await pool.query("UPDATE workspaces SET kind='team' WHERE id=$1", [auth.workspaceId]);
    expect(await repository.read({ ...auth, workspaceKind: "team", scope: { kind: "team_workspace_readonly" } }, ds))
      .toEqual({ businessDate: ds, coverage: { accounts: 3, withData: 2 }, missingSyncTime: 0, dataAsOf: later });
  });
  it("retains missing computed_at instead of assigning response time", async () => {
    await pool.query("UPDATE account_metrics_daily SET computed_at=NULL WHERE workspace_id=$1 AND media='KUAISHOU' AND ds=$2", [auth.workspaceId, ds]);
    expect(await repository.read(auth, ds)).toEqual({ businessDate: ds,
      coverage: { accounts: 1, withData: 1 }, missingSyncTime: 1, dataAsOf: null });
  });
});
