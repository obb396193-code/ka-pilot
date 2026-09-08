import { randomUUID } from "node:crypto";
import type { Server } from "node:http";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { AdminCalendarRepository, AuthSessionRepository, runMigrations } from "@ka/db";
import { AdminCalendarService } from "../src/admin/calendar-service.js";
import { createDataApiServer, type DataApiServerOptions } from "../src/data/http-server.js";
import { SessionAuthService } from "../src/auth/session-auth-service.js";

const databaseUrl = process.env.TEST_DATABASE_URL;
if (!databaseUrl) throw new Error("Explicit dedicated TEST_DATABASE_URL required");
const db = new URL(databaseUrl);
if (!["localhost", "127.0.0.1", "[::1]"].includes(db.hostname) || db.port !== "55432" || !/^\/ka_[a-z0-9_]*_test$/.test(db.pathname)) throw new Error("Dedicated local ka_*_test required");
describe("calendar actual HTTP + Session + PG (synthetic data)", () => {
  const pool = new Pool({ connectionString: databaseUrl, max: 3 });
  const personal = randomUUID(), team = randomUUID(), user = randomUUID(), teamUser = randomUUID(), identity = randomUUID();
  const internalToken = "synthetic-calendar-service-token-long-enough";
  const sessionAuth = new SessionAuthService(new AuthSessionRepository(pool));
  const repo = new AdminCalendarRepository(pool), list = vi.spyOn(repo, "list");
  let server: Server, origin: string;
  beforeAll(async () => {
    await runMigrations({ databaseUrl });
    await pool.query("INSERT INTO workspaces(id,name,kind) VALUES($1,'synthetic calendar','personal'),($2,'synthetic calendar','team')", [personal, team]);
    await pool.query("INSERT INTO users(id,workspace_id,name,role) VALUES($1,$2,'synthetic','admin'),($3,$4,'synthetic','admin')", [user, personal, teamUser, team]);
    await pool.query("INSERT INTO auth_identities(id,provider,provider_subject,display_name) VALUES($1::uuid,'internal_test',$1::text,'synthetic')", [identity]);
    await pool.query("INSERT INTO workspace_memberships(workspace_id,user_id,identity_id,role) VALUES($1,$2,$5,'admin'),($3,$4,$5,'admin')", [personal, user, team, teamUser, identity]);
    await pool.query("INSERT INTO business_calendar(workspace_id,event_date,event_type,label) VALUES($1,'2026-09-08','promo','synthetic personal'),($2,'2026-09-08','holiday','synthetic team')", [personal, team]);
    const unused = new Proxy({}, { get() { throw new Error("Unexpected unrelated service"); } });
    server = createDataApiServer({ service: unused, detailService: unused, taskListService: unused, accountListService: unused, workItemListService: unused,
      internalToken, sessionAuthService: sessionAuth, adminCalendarService: new AdminCalendarService(repo),
    } as unknown as DataApiServerOptions);
    await new Promise<void>((resolve, reject) => { server.once("error", reject); server.listen(0, "127.0.0.1", resolve); });
    const address = server.address(); if (!address || typeof address === "string") throw new Error("No test listener"); origin = `http://127.0.0.1:${address.port}`;
  }, 30000);
  afterAll(async () => {
    if (server?.listening) { server.closeAllConnections(); await new Promise<void>((resolve, reject) => server.close(e => e ? reject(e) : resolve())); }
    try {
      await pool.query("DELETE FROM business_calendar WHERE workspace_id=ANY($1::uuid[])", [[personal, team]]);
      await pool.query("DELETE FROM auth_sessions WHERE identity_id=$1", [identity]);
      for (const table of ["workspace_memberships", "users"]) await pool.query(`DELETE FROM ${table} WHERE workspace_id=ANY($1::uuid[])`, [[personal, team]]);
      await pool.query("DELETE FROM workspaces WHERE id=ANY($1::uuid[])", [[personal, team]]); await pool.query("DELETE FROM auth_identities WHERE id=$1", [identity]);
    } finally { await pool.end(); }
  });
  async function issue() {
    const token = randomUUID() + randomUUID(); expect((await sessionAuth.issueForIdentity({ identityId: identity, token, expiresAt: new Date(Date.now() + 120000) })).status).toBe("approved"); return token;
  }
  async function call(token?: string) {
    const response = await fetch(`${origin}/api/v1/admin/calendar`, { headers: { authorization: `Bearer ${internalToken}`,
      ...(token ? { cookie: `ka_session=${token}` } : {}), "x-request-id": "pg-calendar", "x-ka-workspace-id": team, "x-ka-role": "admin" } });
    return { status: response.status, body: await response.json() };
  }
  it("reads only approved workspace, rotates scope, rejects old and logged-out tokens before repository", async () => {
    const token = await issue(), first = await call(token);
    expect(first.status).toBe(200); expect(first.body.data.items.map((r: { label: string }) => r.label)).toEqual(["synthetic personal"]);
    expect(first.body.meta).toMatchObject({ dataAsOf: null, selectedSource: "platform", workspaceKind: "personal" });
    const nextToken = randomUUID() + randomUUID();
    expect((await sessionAuth.switchWorkspace({ token, nextToken, targetWorkspaceId: team, expiresAt: new Date(Date.now() + 120000) })).status).toBe("approved");
    const second = await call(nextToken); expect(second.body.data.items.map((r: { label: string }) => r.label)).toEqual(["synthetic team"]); expect(second.body.meta.workspaceKind).toBe("team");
    list.mockClear(); expect((await call(token)).status).toBe(401); expect((await call()).status).toBe(401); expect(list).not.toHaveBeenCalled();
    await sessionAuth.logout(nextToken); expect((await call(nextToken)).status).toBe(401); expect(list).not.toHaveBeenCalled();
  });
  it.each(["optimizer", "operator", "lead"])("DB membership %s cannot be overridden by forged admin header", async role => {
    await pool.query("UPDATE workspace_memberships SET role=$2 WHERE workspace_id=$1", [personal, role]);
    try { const token = await issue(); list.mockClear(); expect((await call(token)).status).toBe(403); expect(list).not.toHaveBeenCalled(); }
    finally { await pool.query("UPDATE workspace_memberships SET role='admin' WHERE workspace_id=$1", [personal]); }
  });
  it("revocation is enforced before calendar query", async () => {
    const token = await issue(); await pool.query("UPDATE workspace_memberships SET is_active=false WHERE workspace_id=$1", [personal]);
    try { list.mockClear(); expect((await call(token)).status).toBe(403); expect(list).not.toHaveBeenCalled(); }
    finally { await pool.query("UPDATE workspace_memberships SET is_active=true WHERE workspace_id=$1", [personal]); }
  });
  it("present-invalid and oversized stored fields become safe 502 instead of null/ready", async () => {
    const token = await issue();
    for (const field of ["label", "threshold_profile"]) {
      await pool.query(`UPDATE business_calendar SET ${field}=$2 WHERE workspace_id=$1`, [personal, "x".repeat(5000)]);
      try { expect(await call(token)).toMatchObject({ status: 502, body: { ok: false, error: { code: "UPSTREAM_INVALID_RESPONSE" } } }); }
      finally { await pool.query(`UPDATE business_calendar SET ${field}=$2 WHERE workspace_id=$1`, [personal, field === "label" ? "synthetic personal" : null]); }
    }
  });
  it("real SQL sentinel permits exact10000 but rejects10001 without a partial calendar", async () => {
    const token = await issue();
    await pool.query("INSERT INTO business_calendar(workspace_id,event_date,event_type,label) SELECT $1,'2026-09-08','promo','synthetic bulk' FROM generate_series(1,9999)", [personal]);
    try {
      const exact = await call(token); expect(exact.status, JSON.stringify(exact.body.error)).toBe(200); expect(exact.body.data.items).toHaveLength(10000);
      await pool.query("INSERT INTO business_calendar(workspace_id,event_date,event_type,label) VALUES($1,'2026-09-08','promo','synthetic bulk')", [personal]);
      const overflow = await call(token); expect(overflow).toMatchObject({ status: 502, body: { ok: false, error: { code: "SOURCE_TRUNCATED" } } });
      expect(overflow.body).not.toHaveProperty("data");
    } finally { await pool.query("DELETE FROM business_calendar WHERE workspace_id=$1 AND label='synthetic bulk'", [personal]); }
  });
});
