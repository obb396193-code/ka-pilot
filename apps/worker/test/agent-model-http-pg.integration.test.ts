// Real HTTP + Session resolution + PostgreSQL catalog. Synthetic local data only.
import { randomUUID } from "node:crypto";
import type { Server } from "node:http";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { AgentModelCatalogRepository, AuthSessionRepository, runMigrations } from "@ka/db";
import { AgentModelCatalogService } from "../src/agent/model-catalog-service.js";
import { createDataApiServer, type DataApiServerOptions } from "../src/data/http-server.js";
import { SessionAuthService } from "../src/auth/session-auth-service.js";

const databaseUrl = process.env.TEST_DATABASE_URL;
if (!databaseUrl) throw new Error("Explicit dedicated TEST_DATABASE_URL required");
const db = new URL(databaseUrl);
if (!["localhost", "127.0.0.1", "[::1]"].includes(db.hostname) || db.port !== "55432" || !/^\/ka_[a-z0-9_]*_test$/.test(db.pathname))
  throw new Error("Dedicated local ka_*_test database required");
describe("model catalog HTTP with actual PG auth", () => {
  const pool = new Pool({ connectionString: databaseUrl, max: 3 });
  const personal = randomUUID(), team = randomUUID(), user = randomUUID(), teamUser = randomUUID(), identity = randomUUID();
  const provider = `synthetic-http-${randomUUID()}`, internalToken = "synthetic-model-http-internal-token-long-enough";
  const sessionAuth = new SessionAuthService(new AuthSessionRepository(pool));
  const repository = new AgentModelCatalogRepository(pool), list = vi.spyOn(repository, "list");
  let server: Server, origin: string;
  beforeAll(async () => {
    await runMigrations({ databaseUrl });
    await pool.query("INSERT INTO workspaces(id,name,kind) VALUES($1,'synthetic models','personal'),($2,'synthetic models','team')", [personal, team]);
    await pool.query("INSERT INTO users(id,workspace_id,name,role) VALUES($1,$2,'synthetic','optimizer'),($3,$4,'synthetic','optimizer')", [user, personal, teamUser, team]);
    await pool.query("INSERT INTO auth_identities(id,provider,provider_subject,display_name) VALUES($1::uuid,'internal_test',$1::text,'synthetic')", [identity]);
    await pool.query("INSERT INTO workspace_memberships(workspace_id,user_id,identity_id,role) VALUES($1,$2,$5,'optimizer'),($3,$4,$5,'optimizer')", [personal, user, team, teamUser, identity]);
    await pool.query("INSERT INTO provider_model_capabilities(provider_id,model,protocol) VALUES($1,'synthetic-model','anthropic_messages')", [provider]);
    const unused = new Proxy({}, { get() { throw new Error("Unexpected unrelated service"); } });
    server = createDataApiServer({ service: unused, detailService: unused, taskListService: unused, accountListService: unused,
      workItemListService: unused, internalToken, sessionAuthService: sessionAuth,
      agentModelCatalogService: new AgentModelCatalogService(repository),
    } as unknown as DataApiServerOptions);
    await new Promise<void>((resolve, reject) => { server.once("error", reject); server.listen(0, "127.0.0.1", resolve); });
    const address = server.address(); if (!address || typeof address === "string") throw new Error("Missing test listener");
    origin = `http://127.0.0.1:${address.port}`;
  }, 30000);
  afterAll(async () => {
    if (server?.listening) { server.closeAllConnections(); await new Promise<void>((resolve, reject) => server.close(e => e ? reject(e) : resolve())); }
    try {
      await pool.query("DELETE FROM provider_model_capabilities WHERE provider_id=$1", [provider]);
      await pool.query("DELETE FROM auth_sessions WHERE identity_id=$1", [identity]);
      for (const table of ["workspace_memberships", "users"]) await pool.query(`DELETE FROM ${table} WHERE workspace_id=ANY($1::uuid[])`, [[personal, team]]);
      await pool.query("DELETE FROM workspaces WHERE id=ANY($1::uuid[])", [[personal, team]]);
      await pool.query("DELETE FROM auth_identities WHERE id=$1", [identity]);
    } finally { await pool.end(); }
  });
  async function issue() {
    const token = randomUUID() + randomUUID();
    expect((await sessionAuth.issueForIdentity({ identityId: identity, token, expiresAt: new Date(Date.now() + 120_000) })).status).toBe("approved");
    return token;
  }
  async function call(token?: string) {
    const response = await fetch(`${origin}/api/v1/agent/models`, { headers: { authorization: `Bearer ${internalToken}`,
      ...(token ? { cookie: `ka_session=${token}` } : {}), "x-request-id": "pg-model-catalog", "x-ka-workspace-id": randomUUID(), "x-ka-account-scope": "*" } });
    return { status: response.status, body: await response.json() };
  }
  it("personal empty scope and rotated team cookie read only catalog, stale token and logout cannot reach repository", async () => {
    const token = await issue();
    const first = await call(token); expect(first.status).toBe(200);
    expect(first.body.data.items).toContainEqual({ id: "synthetic-model", label: "synthetic-model", provider, default: false, status: "documented_unverified" });
    expect(list.mock.calls.at(-1)?.[0]).toMatchObject({ workspaceId: personal, scope: { kind: "explicit_accounts", accounts: [] } });
    const nextToken = randomUUID() + randomUUID();
    expect((await sessionAuth.switchWorkspace({ token, nextToken, targetWorkspaceId: team, expiresAt: new Date(Date.now() + 120_000) })).status).toBe("approved");
    expect(await call(nextToken)).toEqual(first);
    expect(list.mock.calls.at(-1)?.[0]).toMatchObject({ workspaceId: team, scope: { kind: "team_workspace_readonly" } });
    list.mockClear(); expect((await call(token)).status).toBe(401); expect((await call()).status).toBe(401); expect(list).not.toHaveBeenCalled();
    await sessionAuth.logout(nextToken); expect((await call(nextToken)).status).toBe(401); expect(list).not.toHaveBeenCalled();
  });
  it("revoked membership rejects before reading even global catalog", async () => {
    const token = await issue();
    await pool.query("UPDATE workspace_memberships SET is_active=false WHERE workspace_id=$1 AND identity_id=$2", [personal, identity]);
    try { list.mockClear(); expect((await call(token)).status).toBe(403); expect(list).not.toHaveBeenCalled(); }
    finally { await pool.query("UPDATE workspace_memberships SET is_active=true WHERE workspace_id=$1 AND identity_id=$2", [personal, identity]); }
  });
});
