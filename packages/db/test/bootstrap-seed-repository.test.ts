import { createHash, randomUUID } from "node:crypto";
import { Pool } from "pg";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { BootstrapSeedRepository } from "../src/bootstrap-seed-repository.js";
import { AuthSessionRepository } from "../src/auth-repository.js";
import { runMigrations } from "../src/migrate.js";

describe("bootstrap initial provisioning (real PG, synthetic owned fixtures only)", () => {
  let pool: Pool;
  const spaces = new Set<string>(); const identities = new Set<string>();
  beforeAll(async () => {
    const databaseUrl = process.env.TEST_DATABASE_URL;
    if (!databaseUrl) throw new Error("Explicit TEST_DATABASE_URL required");
    pool = new Pool({ connectionString: databaseUrl, max: 4, connectionTimeoutMillis: 3000 });
    await runMigrations({ databaseUrl });
  });
  afterEach(async () => {
    if (!pool) return;
    await pool.query("DELETE FROM auth_sessions WHERE identity_id=ANY($1::uuid[])", [[...identities]]);
    await pool.query("DELETE FROM account_access_grants WHERE workspace_id=ANY($1::uuid[])", [[...spaces]]);
    await pool.query("DELETE FROM accounts WHERE workspace_id=ANY($1::uuid[])", [[...spaces]]);
    await pool.query("DELETE FROM workspace_memberships WHERE workspace_id=ANY($1::uuid[])", [[...spaces]]);
    await pool.query("DELETE FROM users WHERE workspace_id=ANY($1::uuid[])", [[...spaces]]);
    await pool.query("DELETE FROM workspaces WHERE id=ANY($1::uuid[])", [[...spaces]]);
    await pool.query("DELETE FROM auth_identities WHERE id=ANY($1::uuid[])", [[...identities]]);
    spaces.clear(); identities.clear();
  });
  afterAll(async () => { await pool?.end(); });
  function fixture() {
    const id = randomUUID(), personal = randomUUID(), team = randomUUID(), user = randomUUID(), teamUser = randomUUID();
    spaces.add(personal); spaces.add(team); identities.add(id);
    return {
      identities: [{ id, display_name: "Synthetic bootstrap" }],
      workspaces: [{ id: personal, kind: "personal", name: `Synthetic ${personal}` }, { id: team, kind: "team", name: `Synthetic ${team}` }],
      memberships: [{ identity_id: id, workspace_id: personal, user_id: user, role: "optimizer" }, { identity_id: id, workspace_id: team, user_id: teamUser, role: "optimizer" }],
      grants: [{ workspace_id: personal, media: "KUAISHOU", account_id: "same-id", user_id: user }],
    };
  }
  const seed = (input: unknown) => new BootstrapSeedRepository(pool).seed(input);
  it("creates scoped placeholder then grants, supports session issue and readonly team rotation", async () => {
    const input = fixture(); const result = await seed(input); expect(result.inserted).toBe(9);
    const workspace = input.workspaces[0]!.id, identityId = input.identities[0]!.id;
    expect((await pool.query("SELECT account_name,status,owner_user_id FROM accounts WHERE workspace_id=$1", [workspace])).rows).toEqual([{ account_name: null, status: null, owner_user_id: null }]);
    expect((await pool.query("SELECT provider,provider_subject FROM auth_identities WHERE id=$1", [identityId])).rows[0]).toEqual({ provider: "internal_test", provider_subject: identityId });
    const now = new Date(); const expiresAt = new Date(now.getTime() + 3600000);
    const tokenHash = createHash("sha256").update(randomUUID()).digest("hex");
    const nextTokenHash = createHash("sha256").update(randomUUID()).digest("hex");
    const auth = new AuthSessionRepository(pool);
    expect(await auth.createSessionForIdentity({ identityId, tokenHash, now, expiresAt })).toMatchObject({ status: "approved", context: { workspaceId: workspace, scope: { kind: "explicit_accounts", accounts: [{ media: "KUAISHOU", accountId: "same-id" }] } } });
    expect(await auth.switchSessionWorkspace({ tokenHash, nextTokenHash, targetWorkspaceId: input.workspaces[1]!.id, now, expiresAt })).toMatchObject({ status: "approved", context: { scope: { kind: "team_workspace_readonly" } } });
  });
  it("replays and concurrently initializes without duplicates or changing operator-owned fields", async () => {
    const input = fixture(); const results = await Promise.all([seed(input), seed(input)]);
    expect(results.reduce((sum, result) => sum + result.inserted, 0)).toBe(9);
    await pool.query("UPDATE accounts SET account_name='retained',status='paused',is_starred=true WHERE workspace_id=$1", [input.workspaces[0]!.id]);
    await pool.query("UPDATE auth_identities SET provider='buc',provider_subject='synthetic-buc' WHERE id=$1", [input.identities[0]!.id]);
    expect((await seed(input)).inserted).toBe(0);
    expect((await pool.query("SELECT account_name,status,is_starred FROM accounts WHERE workspace_id=$1", [input.workspaces[0]!.id])).rows[0]).toEqual({ account_name: "retained", status: "paused", is_starred: true });
    expect((await pool.query("SELECT provider FROM auth_identities WHERE id=$1", [input.identities[0]!.id])).rows[0]?.provider).toBe("buc");
  });
  it("keeps the same account ID in distinct media and workspaces separate", async () => {
    const a = fixture(), b = fixture(); a.grants.push({ ...a.grants[0]!, media: "TENCENT" });
    await seed(a); await seed(b);
    const query = await pool.query("SELECT workspace_id,media,account_id FROM account_access_grants WHERE workspace_id=ANY($1::uuid[]) ORDER BY workspace_id,media", [[a.workspaces[0]!.id, b.workspaces[0]!.id]]);
    expect(query.rows).toHaveLength(3);
    expect(query.rows.filter((row) => row.workspace_id === a.workspaces[0]!.id).map((row) => row.media)).toEqual(["KUAISHOU", "TENCENT"]);
    expect(query.rows.filter((row) => row.workspace_id === b.workspaces[0]!.id).map((row) => row.media)).toEqual(["KUAISHOU"]);
  });
  it("resolves optional workspace IDs and actors idempotently, rejects ambiguous names", async () => {
    const input = fixture(); input.grants = [];
    const memberships = input.memberships.map(({ identity_id, workspace_id, role }) => ({ identity_id, workspace_id, role }));
    await seed({ ...input, memberships });
    const result = await seed({ ...input, workspaces: input.workspaces.map(({ kind, name }) => ({ kind, name })), memberships });
    expect(result.inserted).toBe(0); expect(result.memberships).toHaveLength(2);
    const extra = randomUUID(); spaces.add(extra);
    await pool.query("INSERT INTO workspaces(id,kind,name) VALUES($1,'team',$2)", [extra, input.workspaces[1]!.name]);
    await expect(seed({ identities: [], memberships: [], grants: [], workspaces: [{ kind: "team", name: input.workspaces[1]!.name }] })).rejects.toThrow(/^Bootstrap seed failed$/);
  });
  it.each(["two-personal", "shared-personal", "cross-workspace-actor", "missing-grant-space", "team-grant"])("fails closed and rolls back %s", async (kind) => {
    const input = fixture();
    if (kind === "two-personal") input.workspaces[1]!.kind = "personal";
    if (kind === "shared-personal") {
      const id = randomUUID(); identities.add(id); input.identities.push({ id, display_name: "Synthetic other" });
      input.memberships.push({ identity_id: id, workspace_id: input.workspaces[0]!.id, user_id: randomUUID(), role: "optimizer" });
    }
    if (kind === "cross-workspace-actor") input.memberships[1]!.user_id = input.memberships[0]!.user_id;
    if (kind === "missing-grant-space") input.grants[0]!.workspace_id = randomUUID();
    if (kind === "team-grant") { input.grants[0]!.workspace_id = input.workspaces[1]!.id; input.grants[0]!.user_id = input.memberships[1]!.user_id; }
    await expect(seed(input)).rejects.toThrow(/^Bootstrap seed failed$/);
    expect((await pool.query("SELECT id FROM workspaces WHERE id=ANY($1::uuid[])", [[...spaces]])).rows).toEqual([]);
    expect((await pool.query("SELECT id FROM auth_identities WHERE id=ANY($1::uuid[])", [[...identities]])).rows).toEqual([]);
  });
  it("does not reactivate a stopped identity or membership", async () => {
    const input = fixture(); await seed(input);
    await pool.query("UPDATE auth_identities SET is_active=false WHERE id=$1", [input.identities[0]!.id]);
    await expect(seed(input)).rejects.toThrow();
    expect((await pool.query("SELECT is_active FROM auth_identities WHERE id=$1", [input.identities[0]!.id])).rows[0]?.is_active).toBe(false);
    await pool.query("UPDATE auth_identities SET is_active=true WHERE id=$1", [input.identities[0]!.id]);
    await pool.query("UPDATE workspace_memberships SET is_active=false WHERE workspace_id=$1", [input.workspaces[0]!.id]);
    await expect(seed(input)).rejects.toThrow();
  });
  it("rejects the 1001st grant and rolls back its placeholder instead of breaking auth scope", async () => {
    const input = fixture(); input.grants = []; await seed(input);
    const workspace = input.workspaces[0]!.id, identity = input.identities[0]!.id;
    await pool.query("INSERT INTO accounts(workspace_id,media,account_id) SELECT $1,'KUAISHOU','g-'||i FROM generate_series(1,1000) i", [workspace]);
    await pool.query("INSERT INTO account_access_grants(workspace_id,identity_id,media,account_id) SELECT $1,$2,'KUAISHOU','g-'||i FROM generate_series(1,1000) i", [workspace, identity]);
    await expect(seed({ identities: [], workspaces: [], memberships: [], grants: [{ workspace_id: workspace, user_id: input.memberships[0]!.user_id, media: "KUAISHOU", account_id: "too-many" }] })).rejects.toThrow(/^Bootstrap seed failed$/);
    expect((await pool.query("SELECT count(*)::int AS n FROM account_access_grants WHERE workspace_id=$1", [workspace])).rows[0]?.n).toBe(1000);
    expect((await pool.query("SELECT 1 FROM accounts WHERE workspace_id=$1 AND account_id='too-many'", [workspace])).rows).toEqual([]);
  });
  it("empty grants remain empty approved scope, never implicit all accounts", async () => {
    const input = fixture(); input.grants = []; await seed(input);
    const now = new Date(), expiresAt = new Date(now.getTime() + 3600000);
    const auth = await new AuthSessionRepository(pool).createSessionForIdentity({ identityId: input.identities[0]!.id, tokenHash: createHash("sha256").update(randomUUID()).digest("hex"), now, expiresAt });
    expect(auth).toMatchObject({ status: "approved", context: { scope: { kind: "explicit_accounts", accounts: [] } } });
  });
});
