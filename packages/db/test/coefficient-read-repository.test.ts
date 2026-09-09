import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import { afterAll, afterEach, beforeAll, expect, it } from "vitest";
import { CoefficientReadRepository } from "../src/coefficient-read-repository.js";
import { CoefficientSeedRepository } from "../src/coefficient-seed-repository.js";
import { runMigrations } from "../src/migrate.js";

// Synthetic local configuration only; never use a shared/business database.
let pool: Pool;
const workspaces: string[] = [], identities: string[] = [];
const date = "2026-09-09";
beforeAll(async () => {
  const databaseUrl = process.env.TEST_DATABASE_URL;
  if (!databaseUrl) throw new Error("Explicit dedicated TEST_DATABASE_URL required");
  const target = new URL(databaseUrl);
  if (!["127.0.0.1", "localhost", "[::1]"].includes(target.hostname) || target.port !== "55432" || !/^\/ka_[a-z0-9_]*_test$/.test(target.pathname)) throw new Error("Dedicated local ka_*_test required");
  pool = new Pool({ connectionString: databaseUrl, max: 4, connectionTimeoutMillis: 3000 });
  await runMigrations({ databaseUrl });
});
afterEach(async () => {
  if (!pool) return;
  await pool.query("DELETE FROM channel_coefficients WHERE workspace_id=ANY($1::uuid[])", [workspaces]);
  await pool.query("DELETE FROM workspace_memberships WHERE workspace_id=ANY($1::uuid[])", [workspaces]);
  await pool.query("DELETE FROM users WHERE workspace_id=ANY($1::uuid[])", [workspaces]);
  await pool.query("DELETE FROM workspaces WHERE id=ANY($1::uuid[])", [workspaces]);
  await pool.query("DELETE FROM auth_identities WHERE id=ANY($1::uuid[])", [identities]);
  workspaces.length = 0; identities.length = 0;
});
afterAll(async () => { await pool?.end(); });

async function fixture() {
  const workspaceId = randomUUID(), userId = randomUUID(), identityId = randomUUID();
  workspaces.push(workspaceId); identities.push(identityId);
  await pool.query("INSERT INTO workspaces(id,name,kind,is_active) VALUES($1,'synthetic coefficients','personal',true)", [workspaceId]);
  await pool.query("INSERT INTO users(id,workspace_id,name,role,is_active) VALUES($1,$2,'synthetic admin','admin',true)", [userId, workspaceId]);
  await pool.query("INSERT INTO auth_identities(id,provider,provider_subject,display_name,is_active) VALUES($1,'internal_test',$2,'synthetic',true)", [identityId, identityId]);
  await pool.query("INSERT INTO workspace_memberships(workspace_id,identity_id,user_id,role) VALUES($1,$2,$3,'admin')", [workspaceId, identityId, userId]);
  return { workspaceId, userId, role: "admin", workspaceKind: "personal", scope: { kind: "explicit_accounts", accounts: [] } };
}
async function version(workspaceId: string, effectiveDate: string, coefficient = "0.8", changedBy: string | null = null) {
  return (await pool.query("INSERT INTO channel_coefficients(workspace_id,media,coefficient,op,effective_date,changed_by) VALUES($1,'KUAISHOU',$2,'multiply',$3,$4) RETURNING id::text", [workspaceId, coefficient, effectiveDate, changedBy])).rows[0]!.id as string;
}
it("reads seeded values honestly with null author, without granting missing accounts", async () => {
  const auth = await fixture(); await new CoefficientSeedRepository(pool).seed({ workspace_id: auth.workspaceId, effective_date: "2026-08-01" });
  const result = await new CoefficientReadRepository(pool).read(auth, date);
  expect(result.versions.map(v => [v.media, v.op, v.coefficient, v.current, v.historyCount])).toEqual([
    ["BAIDU", "divide", 1.51, true, 1], ["KUAISHOU", "multiply", 0.7812, true, 1],
    ["TENCENT", "divide", 1.045, true, 1], ["TOUTIAO", "divide", 1.09, true, 1]]);
  expect(result.versions.every(v => v.actor.status === "unrecorded" && v.evidence.status === "not_stored")).toBe(true);
  expect((await pool.query("SELECT count(*)::int AS count FROM account_access_grants WHERE workspace_id=$1", [auth.workspaceId])).rows[0].count).toBe(0);
});
it("keeps future versions in history, selects effective current, and isolates same-media workspaces", async () => {
  const a = await fixture(), b = await fixture();
  const old = await version(a.workspaceId, "2026-08-01"), current = await version(a.workspaceId, "2026-09-01", "0.9", a.userId);
  const future = await version(a.workspaceId, "2026-10-01", "0.7"); await version(b.workspaceId, "2026-09-02", "0.1");
  const result = await new CoefficientReadRepository(pool).read(a, date, "KUAISHOU");
  expect(result.versions.map(v => [v.id, v.current, v.historyCount])).toEqual([[future, false, 3], [current, true, 3], [old, false, 3]]);
  expect(result.versions[1]?.actor).toEqual({ status: "known", userId: a.userId, name: "synthetic admin" });
  expect((await new CoefficientReadRepository(pool).read(b, date)).versions.map(v => v.coefficient)).toEqual([0.1]);
  expect((await new CoefficientReadRepository(pool).read(a, "2026-01-01")).versions.every(v => !v.current)).toBe(true);
});
it("does not expose foreign or orphan historical actor identifiers/names", async () => {
  const a = await fixture(), b = await fixture(), orphan = randomUUID();
  await pool.query("UPDATE users SET name='foreign-sensitive-name' WHERE id=$1", [b.userId]);
  await version(a.workspaceId, "2026-09-01", "0.8", b.userId); await version(a.workspaceId, "2026-08-01", "0.7", orphan);
  const result = await new CoefficientReadRepository(pool).read(a, date);
  expect(result.versions.map(v => v.actor)).toEqual([{ status: "unavailable" }, { status: "unavailable" }]);
  for (const secret of [b.userId, orphan, "foreign-sensitive-name"]) expect(JSON.stringify(result)).not.toContain(secret);
});
it("orders genuine BIGINT ids losslessly within older same-day history", async () => {
  const a = await fixture(), old = await version(a.workspaceId, "2026-08-01"), next = await version(a.workspaceId, "2026-08-01");
  const base = 9007199254740993n + BigInt("0x" + randomUUID().slice(0, 8)) * 2n;
  await pool.query("UPDATE channel_coefficients SET id=$1 WHERE workspace_id=$2 AND id=$3", [base.toString(), a.workspaceId, old]);
  await pool.query("UPDATE channel_coefficients SET id=$1 WHERE workspace_id=$2 AND id=$3", [(base + 1n).toString(), a.workspaceId, next]);
  const current = await version(a.workspaceId, "2026-09-01");
  expect((await new CoefficientReadRepository(pool).read(a, date)).versions.map(v => v.id)).toEqual([current, (base + 1n).toString(), base.toString()]);
});
it("rejects same-day current ambiguity, invalid numeric data and inactive identity", async () => {
  const a = await fixture(), repo = new CoefficientReadRepository(pool);
  await version(a.workspaceId, "2026-09-01"); await version(a.workspaceId, "2026-09-01", "0.9");
  await expect(repo.read(a, date)).rejects.toMatchObject({ code: "AMBIGUOUS_VERSION" });
  await pool.query("DELETE FROM channel_coefficients WHERE workspace_id=$1", [a.workspaceId]);
  await version(a.workspaceId, "2026-09-01", "NaN");
  await expect(repo.read(a, date)).rejects.toMatchObject({ code: "UPSTREAM_INVALID_RESPONSE" });
  await pool.query("UPDATE auth_identities SET is_active=false WHERE id=(SELECT identity_id FROM workspace_memberships WHERE user_id=$1)", [a.userId]);
  await expect(repo.read(a, date)).rejects.toMatchObject({ code: "FORBIDDEN" });
});
it.each(["workspace", "member", "user"])("rejects inactive %s despite previously approved context", async kind => {
  const a = await fixture();
  if (kind === "workspace") await pool.query("UPDATE workspaces SET is_active=false WHERE id=$1", [a.workspaceId]);
  if (kind === "member") await pool.query("UPDATE workspace_memberships SET is_active=false WHERE workspace_id=$1", [a.workspaceId]);
  if (kind === "user") await pool.query("UPDATE users SET is_active=false WHERE id=$1", [a.userId]);
  await expect(new CoefficientReadRepository(pool).read(a, date)).rejects.toMatchObject({ code: "FORBIDDEN" });
});
it("holds one RR snapshot when a new version commits after the auth read", async () => {
  const a = await fixture(), first = await version(a.workspaceId, "2026-08-01"); let injected = false;
  const wrapped = { connect: async () => {
    const client = await pool.connect(), query = client.query.bind(client);
    return { on: client.on.bind(client), removeListener: client.removeListener.bind(client), release: client.release.bind(client),
      query: async (sql: string, values?: unknown[]) => {
        const result = await query(sql, values);
        if (sql.includes("coefficient-read-auth") && !injected) { injected = true; await version(a.workspaceId, "2026-09-01", "0.9"); }
        return result;
      } };
  } } as unknown as Pool;
  const result = await new CoefficientReadRepository(wrapped).read(a, date);
  expect(result.versions.map(v => [v.id, v.historyCount])).toEqual([[first, 1]]);
  const refreshed = await new CoefficientReadRepository(pool).read(a, date);
  expect(refreshed.versions).toHaveLength(2); expect(refreshed.versions.find(v => v.current)?.coefficient).toBe(0.9);
});
it("allows exactly10000 known history records but rejects the10001 sentinel", async () => {
  const a = await fixture();
  await pool.query(`INSERT INTO channel_coefficients(workspace_id,media,coefficient,op,effective_date)
    SELECT $1,'KUAISHOU',0.8,'multiply',date '1990-01-01'+i FROM generate_series(0,9999) i`, [a.workspaceId]);
  expect((await new CoefficientReadRepository(pool).read(a, date)).versions).toHaveLength(10000);
  await version(a.workspaceId, "2030-01-01");
  await expect(new CoefficientReadRepository(pool).read(a, date)).rejects.toMatchObject({ code: "SOURCE_TRUNCATED" });
}, 30000);
