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
      for (const table of ["task_budget_history", "channel_coefficients", "assessment_price_history", "task_accounts", "tasks", "account_access_grants", "workspace_memberships", "accounts", "users"])
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
    expect(rows.map(x => [x.oldValue, x.newValue, x.effectiveDate])).toEqual([[null, 38, "2026-08-01"], [38, 40, "2026-09-30"]]);
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
  it("reads real migrated budgets and coefficients without manufacturing source tables", async () => {
    const a = await seed();
    const exists = await pool.query("SELECT to_regclass('public.task_budget_history') AS source");
    expect(exists.rows[0]?.source).toBe("task_budget_history");
    await pool.query(`INSERT INTO task_budget_history(workspace_id,task_id,daily_cap,effective_date,created_at)
      VALUES($1,'allowed',100,'2026-09-01','2026-09-02T00:00:00Z'),($1,'allowed',200,'2026-09-02','2026-09-01T00:00:00Z')`, [a.workspaceId]);
    await pool.query(`INSERT INTO channel_coefficients(workspace_id,media,coefficient,op,effective_date,created_at)
      VALUES($1,'KUAISHOU',0.8,'multiply','2026-09-01','2026-09-02T00:00:00Z'),
        ($1,'KUAISHOU',1.1,'divide','2026-09-02','2026-09-01T00:00:00Z'),
        ($1,'TENCENT',9,'multiply','2026-09-01','2026-09-02T00:00:00Z')`, [a.workspaceId]);
    const rows = (await repo.page(a, {}, "2026-09-13")).data.items;
    expect(rows).toHaveLength(4);
    expect(rows.filter(x => x.kind === "daily_budget_cap").map(x => [x.oldValue, x.newValue, x.changedBy])).toEqual([[null, 100, null], [100, 200, null]]);
    expect(rows.filter(x => x.kind === "channel_coefficient").map(x => [x.oldValue, x.newValue])).toEqual([
      [null, { op: "multiply", coefficient: 0.8 }], [{ op: "multiply", coefficient: 0.8 }, { op: "divide", coefficient: 1.1 }],
    ]);
    expect(rows.every(x => x.id.startsWith(`${x.kind}:`) && x.op === "set")).toBe(true);
    expect((await repo.page(a, { task_id: "denied" }, "2026-09-13")).data.items).toEqual([]);
    expect((await repo.page({ ...a, workspaceKind: "personal", scope: { kind: "explicit_accounts", accounts: [] } }, {}, "2026-09-13")).data.items).toEqual([]);
  });
  it("same-day budget revisions and tied timestamps page across all three sources without loss", async () => {
    const a = await seed();
    for (let n = 1; n <= 20; n++) {
      await price(a, "allowed", String(n), "2026-09-02T00:00:00.000001Z", "2026-09-01");
      await pool.query(`INSERT INTO task_budget_history(workspace_id,task_id,daily_cap,effective_date,created_at)
        VALUES($1,'allowed',$2,'2026-09-01','2026-09-02T00:00:00.000001Z')`, [a.workspaceId, n * 100]);
      await pool.query(`INSERT INTO channel_coefficients(workspace_id,media,coefficient,op,effective_date,created_at)
        VALUES($1,'KUAISHOU',$2,'multiply',$3,'2026-09-02T00:00:00.000001Z')`, [a.workspaceId, n, `2026-09-${String(n).padStart(2, "0")}`]);
    }
    const first = await repo.page(a, {}, "2026-09-13");
    const second = await repo.page(a, { cursor: first.data.nextCursor }, "2026-09-13");
    expect(first.data.items).toHaveLength(50); expect(second.data.items).toHaveLength(10); expect(second.data.nextCursor).toBeNull();
    const rows = [...first.data.items, ...second.data.items];
    expect(new Set(rows.map(row => row.id)).size).toBe(60);
    expect(rows.map(row => row.kind)).toEqual([
      ...Array<string>(20).fill("daily_budget_cap"), ...Array<string>(20).fill("channel_coefficient"), ...Array<string>(20).fill("assessment_price"),
    ]);
    expect(rows.filter(row => row.kind === "daily_budget_cap").map(row => [row.oldValue, row.newValue])).toEqual(
      Array.from({ length: 20 }, (_, i) => [(19 - i) * 100 || null, (20 - i) * 100]),
    );
    expect(rows.every(row => row.at === "2026-09-02T00:00:00.000001Z")).toBe(true);
  });
  it("shows revoke and absent actor without discarding history; oldValue follows the previous effective version", async () => {
    const a = await seed();
    await price(a, "allowed", "30", "2026-09-01T00:00:00Z", "2026-09-01");
    await price(a, "allowed", "40", "2026-09-02T00:00:00Z", "2026-09-02");
    await price(a, "allowed", "40", "2026-09-03T00:00:00Z", "2026-09-02", "revoke");
    await price(a, "allowed", "50", "2026-09-04T00:00:00Z", "2026-09-03");
    await pool.query("UPDATE assessment_price_history SET changed_by=NULL WHERE workspace_id=$1", [a.workspaceId]);
    expect((await page(a)).data.items.map(x => [x.op, x.oldValue, x.newValue, x.changedBy])).toEqual([
      ["set", null, 50, null], ["revoke", 40, null, null], ["set", 30, 40, null], ["set", null, 30, null],
    ]);
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
  it("keeps rows with an unknown modification time, ordered by effective day and after timed rows on the same instant", async () => {
    // v1.9.48 ⑤：老行 at=null 不再让整页 503；排序键 = COALESCE(at, 生效日上海 00:00)，at 本身仍是 null。
    const a = await seed();
    await price(a, "allowed", "10", "2026-09-01T17:00:00Z", "2026-09-01");
    await price(a, "allowed", "20", "2026-09-01T16:00:00Z", "2026-09-01");
    await price(a, "allowed", "30", "2026-09-01T15:00:00Z", "2026-09-01");
    await pool.query(`INSERT INTO assessment_price_history(workspace_id,task_id,price,effective_date,changed_by,created_at,op)
      VALUES($1,'allowed',99,'2026-09-02',$2,NULL,'set')`, [a.workspaceId, a.userId]);
    expect((await page(a)).data.items.map(x => [x.newValue, x.at])).toEqual([
      [10, "2026-09-01T17:00:00.000000Z"], [20, "2026-09-01T16:00:00.000000Z"], [99, null], [30, "2026-09-01T15:00:00.000000Z"],
    ]);
  });
  it("pages through many timeless rows on one sort key without loss or repeat", async () => {
    const a = await seed();
    for (let n = 1; n <= 52; n++) await pool.query(`INSERT INTO assessment_price_history(workspace_id,task_id,price,effective_date,created_at,op)
      VALUES($1,'allowed',$2,'2026-09-01',NULL,'set')`, [a.workspaceId, n]);
    await price(a, "allowed", "500", "2026-08-31T16:00:00Z", "2026-08-01");
    const first = await page(a), second = await page(a, { cursor: first.data.nextCursor });
    expect(first.data.items).toHaveLength(50); expect(second.data.items).toHaveLength(3); expect(second.data.nextCursor).toBeNull();
    const all = [...first.data.items, ...second.data.items];
    expect(new Set(all.map(x => x.id)).size).toBe(53);
    // 与 9-01 上海 00:00 同一刻的有时间行排在最前，其后是 52 条无时间行（跨页不丢不重）。
    expect(all[0]).toMatchObject({ newValue: 500, at: "2026-08-31T16:00:00.000000Z" });
    expect(all.slice(1).every(x => x.at === null)).toBe(true);
  });
  it("expired links no longer grant task history", async () => {
    const a = await seed(); await price(a);
    await pool.query("UPDATE task_accounts SET valid_to='2026-09-12' WHERE workspace_id=$1", [a.workspaceId]);
    expect((await page(a)).data.items).toEqual([]);
  });
});
