// Synthetic local data only. Revocation preserves history, not authorization.
import { createHash, randomUUID } from "node:crypto";
import type { ApprovedWorkspaceAuthContext } from "@ka/domain";
import { Pool } from "pg";
import { afterAll, afterEach, beforeAll, expect, it } from "vitest";
import { runMigrations } from "../src/migrate.js";
import { AuthSessionRepository } from "../src/auth-repository.js";
import { WorkspaceSyncRepository } from "../src/workspace-sync-repository.js";
import { AdminMembersRepository } from "../src/admin-members-repository.js";
import { AccountMuteRepository } from "../src/account-mute-repository.js";

let pool: Pool;
const spaces: string[] = [], identities: string[] = [];
const now = new Date("2026-09-09T00:00:00Z");
beforeAll(async () => {
  const databaseUrl = process.env.TEST_DATABASE_URL;
  if (!databaseUrl) throw new Error("Explicit TEST_DATABASE_URL required");
  const url = new URL(databaseUrl);
  if (!["localhost", "127.0.0.1"].includes(url.hostname) || url.port !== "55432" || !/^\/ka_[a-z0-9_]*_test$/.test(url.pathname)) throw new Error("Dedicated local test database required");
  pool = new Pool({ connectionString: databaseUrl, max: 3, connectionTimeoutMillis: 3000 });
  await runMigrations({ databaseUrl });
});
afterEach(async () => {
  if (!pool) return;
  // Only random identities/workspaces created by this file.
  await pool.query("DELETE FROM account_mutes WHERE workspace_id=ANY($1::uuid[])", [spaces]);
  await pool.query("DELETE FROM auth_sessions WHERE identity_id=ANY($1::uuid[])", [identities]);
  await pool.query("DELETE FROM account_access_grants WHERE workspace_id=ANY($1::uuid[])", [spaces]);
  await pool.query("DELETE FROM workspace_memberships WHERE workspace_id=ANY($1::uuid[])", [spaces]);
  await pool.query("DELETE FROM accounts WHERE workspace_id=ANY($1::uuid[])", [spaces]);
  await pool.query("DELETE FROM users WHERE workspace_id=ANY($1::uuid[])", [spaces]);
  await pool.query("DELETE FROM workspaces WHERE id=ANY($1::uuid[])", [spaces]);
  await pool.query("DELETE FROM auth_identities WHERE id=ANY($1::uuid[])", [identities]);
  spaces.length = 0; identities.length = 0;
});
afterAll(async () => { await pool?.end(); });

async function fixture() {
  const workspaceId = randomUUID(), userId = randomUUID(), identityId = randomUUID();
  spaces.push(workspaceId); identities.push(identityId);
  await pool.query("INSERT INTO workspaces(id,name,kind) VALUES($1,'synthetic revoke','personal')", [workspaceId]);
  await pool.query("INSERT INTO users(id,workspace_id,name,role,qihang_user_id) VALUES($1,$2,'synthetic actor','admin','synthetic-qh')", [userId, workspaceId]);
  await pool.query("INSERT INTO auth_identities(id,provider,provider_subject,display_name) VALUES($1,'internal_test',$2,'synthetic')", [identityId, identityId]);
  await pool.query("INSERT INTO workspace_memberships(workspace_id,identity_id,user_id,role) VALUES($1,$2,$3,'admin')", [workspaceId, identityId, userId]);
  for (const media of ["KUAISHOU", "TENCENT"]) {
    await pool.query("INSERT INTO accounts(workspace_id,media,account_id) VALUES($1,$2,'same')", [workspaceId, media]);
    await pool.query("INSERT INTO account_access_grants(workspace_id,identity_id,media,account_id) VALUES($1,$2,$3,'same')", [workspaceId, identityId, media]);
  }
  const tokenHash = createHash("sha256").update(randomUUID()).digest("hex");
  await pool.query("INSERT INTO auth_sessions(identity_id,active_workspace_id,token_hash,expires_at) VALUES($1,$2,$3,'2030-01-01')", [identityId, workspaceId, tokenHash]);
  const auth: ApprovedWorkspaceAuthContext = { workspaceId, userId, role: "admin", workspaceKind: "personal", scope: { kind: "explicit_accounts", accounts: ["KUAISHOU", "TENCENT"].map(media => ({ media, accountId: "same", accessLevel: "read" })) } };
  return { workspaceId, userId, identityId, tokenHash, auth };
}
async function revoke(workspaceId: string, media?: string) {
  await pool.query("UPDATE account_access_grants SET revoked_at=now() WHERE workspace_id=$1 AND ($2::text IS NULL OR media=$2)", [workspaceId, media ?? null]);
}
it("excludes a soft-revoked tuple while preserving same-id other media and history", async () => {
  const a = await fixture(); await revoke(a.workspaceId, "KUAISHOU");
  expect(await new AuthSessionRepository(pool).resolveApprovedAuthContext(a.tokenHash, now)).toMatchObject({ status: "approved", context: { scope: { accounts: [{ media: "TENCENT", accountId: "same", accessLevel: "read" }] } } });
  expect((await pool.query("SELECT count(*)::int AS n FROM account_access_grants WHERE workspace_id=$1", [a.workspaceId])).rows[0].n).toBe(2);
  await revoke(a.workspaceId);
  expect(await new AuthSessionRepository(pool).resolveApprovedAuthContext(a.tokenHash, now)).toMatchObject({ status: "approved", context: { scope: { accounts: [] } } });
});
it("does not count 1001 revoked rows against the active grant cap", async () => {
  const a = await fixture();
  await pool.query("INSERT INTO accounts(workspace_id,media,account_id) SELECT $1,'KUAISHOU','old-'||i FROM generate_series(1,1001) i", [a.workspaceId]);
  await pool.query("INSERT INTO account_access_grants(workspace_id,identity_id,media,account_id,revoked_at) SELECT $1,$2,'KUAISHOU','old-'||i,now() FROM generate_series(1,1001) i", [a.workspaceId, a.identityId]);
  const result = await new AuthSessionRepository(pool).resolveApprovedAuthContext(a.tokenHash, now);
  expect(result).toMatchObject({ status: "approved", context: { scope: { accounts: [{ media: "KUAISHOU", accountId: "same" }, { media: "TENCENT", accountId: "same" }] } } });
});
it("team membership remains readonly and independent of soft-revoked personal grants", async () => {
  const a = await fixture(); await revoke(a.workspaceId);
  const team = randomUUID(), actor = randomUUID(); spaces.push(team);
  await pool.query("INSERT INTO workspaces(id,name,kind) VALUES($1,'synthetic team','team')", [team]);
  await pool.query("INSERT INTO users(id,workspace_id,name) VALUES($1,$2,'synthetic team actor')", [actor, team]);
  await pool.query("INSERT INTO workspace_memberships(workspace_id,identity_id,user_id,role) VALUES($1,$2,$3,'optimizer')", [team, a.identityId, actor]);
  await pool.query("UPDATE auth_sessions SET active_workspace_id=$1 WHERE token_hash=$2", [team, a.tokenHash]);
  expect(await new AuthSessionRepository(pool).resolveApprovedAuthContext(a.tokenHash, now)).toMatchObject({ status: "approved", context: { workspaceId: team, workspaceKind: "team", scope: { kind: "team_workspace_readonly" } } });
});
it("scheduler candidates contain only active media tuples, including empty scope", async () => {
  const a = await fixture(); await revoke(a.workspaceId, "KUAISHOU");
  const repository = new WorkspaceSyncRepository(pool);
  expect((await repository.loadTickSnapshot(a.workspaceId, "KUAISHOU")).candidates[0]?.allowedAccounts).toEqual([]);
  expect((await repository.loadTickSnapshot(a.workspaceId, "TENCENT")).candidates[0]?.allowedAccounts).toEqual([{ media: "TENCENT", accountId: "same", accessLevel: "read" }]);
});
it("admin effective grant list and count agree after revocation", async () => {
  const a = await fixture(); await revoke(a.workspaceId, "KUAISHOU");
  const repository = new AdminMembersRepository(pool);
  expect((await repository.read(a.auth)).data.items).toMatchObject([{ grantsCount: 1 }]);
  expect((await repository.read(a.auth, a.identityId)).data.items).toMatchObject([{ media: "TENCENT", accountId: "same" }]);
});
it("stale approved context cannot mutate mute state after soft revocation", async () => {
  const a = await fixture(), repository = new AccountMuteRepository(pool);
  const input = { media: "KUAISHOU", accountId: "same", mutedUntil: "2026-09-10", reasonChip: "synthetic" };
  await repository.set(a.auth, input); await revoke(a.workspaceId, "KUAISHOU");
  await expect(repository.set(a.auth, { ...input, reasonChip: "must-not-write" })).rejects.toMatchObject({ code: "FORBIDDEN" });
  await expect(repository.find(a.auth, { media: input.media, accountId: input.accountId })).rejects.toMatchObject({ code: "FORBIDDEN" });
  expect((await pool.query("SELECT reason_chip FROM account_mutes WHERE workspace_id=$1", [a.workspaceId])).rows).toEqual([{ reason_chip: "synthetic" }]);
  expect(await repository.set(a.auth, { ...input, media: "TENCENT" })).toMatchObject({ media: "TENCENT" });
});
