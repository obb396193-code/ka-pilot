// Synthetic objects only; fixed isolated local DB, no production credentials.
import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import type { ApprovedWorkspaceAuthContext } from "@ka/domain";
import { beforeAll, afterAll, describe, expect, it } from "vitest";
import { SettingsChangeLogRepository } from "../src/settings-change-log-repository.js";
import { runMigrations } from "../src/migrate.js";

const databaseUrl = process.env.TEST_DATABASE_URL;
if (!databaseUrl) throw new Error("Explicit TEST_DATABASE_URL required");
const db = new URL(databaseUrl);
if (!["127.0.0.1", "localhost"].includes(db.hostname) || db.port !== "55432" || !/^\/ka_[a-z0-9_]+_test$/.test(db.pathname)) throw new Error("Isolated local test database required");

describe("P194 change log actual PostgreSQL", { timeout: 30000 }, () => {
  const pool = new Pool({ connectionString: databaseUrl, max: 4 });
  const repo = new SettingsChangeLogRepository(pool);
  const spaces: string[] = [], identities: string[] = [];
  async function seed(kind: "personal" | "team" = "personal"): Promise<ApprovedWorkspaceAuthContext> {
    const workspaceId = randomUUID(), userId = randomUUID(), identityId = randomUUID();
    spaces.push(workspaceId); identities.push(identityId);
    await pool.query("INSERT INTO workspaces(id,name,kind) VALUES($1,'synthetic-change-log',$2)", [workspaceId, kind]);
    await pool.query("INSERT INTO users(id,workspace_id,name,role) VALUES($1,$2,'Synthetic','optimizer')", [userId, workspaceId]);
    await pool.query("INSERT INTO auth_identities(id,provider,provider_subject,display_name) VALUES($1::uuid,'internal_test',$1::text,'Synthetic')", [identityId]);
    await pool.query("INSERT INTO workspace_memberships(workspace_id,user_id,identity_id,role) VALUES($1,$2,$3,'optimizer')", [workspaceId, userId, identityId]);
    await pool.query("INSERT INTO accounts(workspace_id,media,account_id) VALUES($1,'KUAISHOU','same'),($1,'TENCENT','same')", [workspaceId]);
    await pool.query("INSERT INTO account_access_grants(workspace_id,identity_id,media,account_id) VALUES($1,$2,'KUAISHOU','same')", [workspaceId, identityId]);
    for (const [task, media] of [["allowed", "KUAISHOU"], ["denied", "TENCENT"]]) {
      await pool.query("INSERT INTO tasks(workspace_id,task_id) VALUES($1,$2)", [workspaceId, task]);
      await pool.query("INSERT INTO task_accounts(workspace_id,task_id,media,account_id,valid_from) VALUES($1,$2,$3,'same','2026-09-01')", [workspaceId, task, media]);
    }
    return kind === "personal" ? { workspaceId, userId, role: "optimizer", workspaceKind: kind, scope: { kind: "explicit_accounts", accounts: [{ media: "KUAISHOU", accountId: "same", accessLevel: "read" }] } }
      : { workspaceId, userId, role: "optimizer", workspaceKind: kind, scope: { kind: "team_workspace_readonly" } };
  }
  async function price(auth: ApprovedWorkspaceAuthContext, task = "allowed", value = "38", at = "2026-09-02T00:00:00.000001Z", effective = "2026-09-02", op = "set") {
    await pool.query("INSERT INTO assessment_price_history(workspace_id,task_id,price,effective_date,changed_by,created_at,op) VALUES($1,$2,$3,$4,$5,$6,$7)",
      [auth.workspaceId, task, value, effective, auth.userId, at, op]);
  }
  const page = (auth: ApprovedWorkspaceAuthContext, extra: Record<string, unknown> = {}) => repo.page(auth, { kinds: ["assessment_price"], ...extra }, "2026-09-13");
  beforeAll(async () => { await runMigrations({ databaseUrl }); });
  afterAll(async () => {
    try {
      for (const table of ["assessment_price_history", "task_accounts", "tasks", "account_access_grants", "workspace_memberships", "accounts", "users"])
        await pool.query(`DELETE FROM ${table} WHERE workspace_id=ANY($1::uuid[])`, [spaces]);
      await pool.query("DELETE FROM workspaces WHERE id=ANY($1::uuid[])", [spaces]);
      await pool.query("DELETE FROM auth_identities WHERE id=ANY($1::uuid[])", [identities]);
    } finally { await pool.end(); }
  });
  it("same IDs across workspace/media never leak; empty grants yield no task history", async () => {
    const a = await seed(), b = await seed();
    await price(a); await price(a, "denied", "999"); await price(b, "allowed", "777");
    expect((await page(a)).data.items.map(x => x.newValue)).toEqual([38]);
    expect((await page(a, { media: "TENCENT" })).data.items).toEqual([]);
    expect((await page(a, { task_id: "denied" })).data.items).toEqual([]);
    expect((await page({ ...a, workspaceKind: "personal", scope: { kind: "explicit_accounts", accounts: [] } })).data.items).toEqual([]);
  });
  it("team reads only its workspace and media filter still narrows task links", async () => {
    const team = await seed("team"), personal = await seed();
    await price(team); await price(team, "denied", "88"); await price(personal, "allowed", "777");
    expect((await page(team)).data.items.map(x => x.newValue)).toEqual([88, 38]);
    expect((await page(team, { media: "TENCENT" })).data.items.map(x => x.newValue)).toEqual([88]);
  });
  it("preserves actual write chronology independently of retroactive/future effective dates", async () => {
    const a = await seed();
    await price(a, "allowed", "40", "2026-09-01T00:00:00.000001Z", "2026-09-30");
    await price(a, "allowed", "38", "2026-09-02T00:00:00.000002Z", "2026-08-01");
    const rows = (await page(a)).data.items;
    expect(rows.map(x => [x.oldValue, x.newValue, x.effectiveDate])).toEqual([[40, 38, "2026-08-01"], [null, 40, "2026-09-30"]]);
    expect(rows[0]?.at).toBe("2026-09-02T00:00:00.000002Z");
  });
  it("cursor pages through tied timestamps without loss or repeat", async () => {
    const a = await seed();
    for (let n = 1; n <= 52; n++) await price(a, "allowed", String(n));
    const first = await page(a), second = await page(a, { cursor: first.data.nextCursor });
    expect(first.data.items).toHaveLength(50); expect(second.data.items).toHaveLength(2);
    expect(second.data.nextCursor).toBeNull();
    const all = [...first.data.items, ...second.data.items];
    expect(all.filter(x => x.kind === "assessment_price").map(x => x.newValue)).toEqual(Array.from({ length: 52 }, (_, i) => 52 - i));
  });
  it("unmigrated budget source is explicitly unavailable; never seed a fake production table to turn the test green", async () => {
    const a = await seed();
    const exists = await pool.query("SELECT to_regclass('public.task_budget_history') AS source");
    expect(exists.rows[0]?.source).toBeNull();
    await expect(page(a, { kinds: ["daily_budget_cap"] })).rejects.toMatchObject({ code: "SOURCE_UNAVAILABLE" });
  });
  it("soft-revoked grant and inactive membership reject stale approved contexts", async () => {
    const a = await seed(); await price(a);
    await pool.query("UPDATE account_access_grants SET revoked_at=now() WHERE workspace_id=$1", [a.workspaceId]);
    expect((await page(a)).data.items).toEqual([]);
    await pool.query("UPDATE workspace_memberships SET is_active=false WHERE workspace_id=$1", [a.workspaceId]);
    await expect(page(a)).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
  it("PostgreSQL numeric NaN cannot become a missing or zero amount", async () => {
    const a = await seed(); await price(a, "allowed", "NaN");
    await expect(page(a)).rejects.toMatchObject({ code: "UPSTREAM_INVALID_RESPONSE" });
  });
  it("no source timestamp is an explicit availability error, never the response time", async () => {
    const a = await seed(); await price(a);
    await pool.query("UPDATE assessment_price_history SET created_at=NULL WHERE workspace_id=$1", [a.workspaceId]);
    await expect(page(a)).rejects.toMatchObject({ code: "SOURCE_UNAVAILABLE" });
  });
  it("expired links no longer grant task history", async () => {
    const a = await seed(); await price(a);
    await pool.query("UPDATE task_accounts SET valid_to='2026-09-12' WHERE workspace_id=$1", [a.workspaceId]);
    expect((await page(a)).data.items).toEqual([]);
  });
});
