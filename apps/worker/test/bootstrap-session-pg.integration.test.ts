import { execFile } from "node:child_process";
import { randomUUID, scryptSync } from "node:crypto";
import { once } from "node:events";
import type { AddressInfo } from "node:net";
import { resolve } from "node:path";
import { promisify } from "node:util";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { AccountListRepository, AuthSessionRepository, ChangeSetRepository, JobRepository, TaskListRepository, WorkItemListRepository, WorkItemRepository, WorkspaceSyncRepository, runMigrations } from "@ka/db";
import { AccountListService } from "../src/accounts/account-list-service.js";
import { InternalTestLoginProvider } from "../src/auth/internal-test-login-provider.js";
import { SessionAuthService } from "../src/auth/session-auth-service.js";
import { SessionHttpService } from "../src/auth/session-http.js";
import { createDataApiServer } from "../src/data/http-server.js";
import { DataQueryService } from "../src/data/query-service.js";
import { createDataQueryRegistry } from "../src/data/query-registry.js";
import { DisabledKaDataSource } from "../src/data/disabled-ka-data-source.js";
import { ReadDetailService } from "../src/data/read-detail-service.js";
import { WorkspaceSyncTickService } from "../src/scheduling/workspace-sync-service.js";
import { TaskListService } from "../src/tasks/task-list-service.js";
import { WorkItemListService } from "../src/work-items/work-item-list-service.js";

describe("bootstrap CLI to real PG + HTTP session", () => {
  let pool: Pool; let server: ReturnType<typeof createDataApiServer> | undefined; let url: string;
  const identity = randomUUID(), personal = randomUUID(), team = randomUUID(), user = randomUUID(), teamUser = randomUUID();
  const password = "synthetic-bootstrap-test-password";
  const headers = { authorization: "Bearer synthetic-bootstrap-internal-token-at-least-32", "content-type": "application/json" };
  beforeAll(async () => {
    const databaseUrl = process.env.TEST_DATABASE_URL;
    if (!databaseUrl) throw new Error("Explicit isolated TEST_DATABASE_URL required");
    pool = new Pool({ connectionString: databaseUrl, max: 4, connectionTimeoutMillis: 3000 });
    await runMigrations({ databaseUrl });
    const input = {
      identities: [{ id: identity, display_name: "Synthetic CLI" }],
      workspaces: [{ id: personal, kind: "personal", name: "Synthetic CLI personal" }, { id: team, kind: "team", name: "Synthetic CLI team" }],
      memberships: [{ identity_id: identity, workspace_id: personal, user_id: user, role: "optimizer" }, { identity_id: identity, workspace_id: team, user_id: teamUser, role: "optimizer" }], grants: [],
    };
    const child = await promisify(execFile)(process.execPath, ["--import", "tsx", resolve("../../packages/db/src/seed-bootstrap.ts"), JSON.stringify(input)], {
      env: { PATH: process.env.PATH, DATABASE_URL: databaseUrl }, timeout: 10000, maxBuffer: 1024 * 1024,
    });
    expect(JSON.parse(child.stdout)).toMatchObject({ inserted: 7 });
    expect(child.stderr).toBe("");
    const salt = Buffer.alloc(16, 5);
    const credentials = JSON.stringify([{ username: "synthetic.bootstrap", identityId: identity,
      passwordSalt: salt.toString("base64url"), passwordScrypt: scryptSync(password, salt, 32, { N: 16384, r: 8, p: 1 }).toString("hex") }]);
    const auth = new SessionAuthService(new AuthSessionRepository(pool));
    server = createDataApiServer({
      service: new DataQueryService({ registry: createDataQueryRegistry(), kaData: new DisabledKaDataSource(), platform: { query: async () => { throw new Error("Data query must not run during session test"); } } }),
      detailService: new ReadDetailService({ workItems: new WorkItemRepository(pool), changeSets: new ChangeSetRepository(pool) }),
      taskListService: new TaskListService({ repository: new TaskListRepository(pool) }),
      accountListService: new AccountListService({ repository: new AccountListRepository(pool) }),
      workItemListService: new WorkItemListService({ repository: new WorkItemListRepository(pool) }),
      sessionAuthService: auth,
      sessionHttpService: new SessionHttpService(auth, new InternalTestLoginProvider(true, credentials), { ttlSeconds: 3600 }),
      internalToken: headers.authorization.slice(7),
    });
    server.listen(0, "127.0.0.1"); await once(server, "listening");
    url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });
  afterAll(async () => {
    if (server) await new Promise<void>((done, reject) => server!.close((error) => error ? reject(error) : done()));
    if (!pool) return;
    for (const table of ["jobs", "auth_sessions", "workspace_memberships", "users", "workspaces"] as const) {
      const column = table === "workspaces" ? "id" : table === "auth_sessions" ? "active_workspace_id" : "workspace_id";
      await pool.query(`DELETE FROM ${table} WHERE ${column}=ANY($1::uuid[])`, [[personal, team]]);
    }
    await pool.query("DELETE FROM auth_identities WHERE id=$1", [identity]); await pool.end();
  });
  it("logs in through actual internal_test KDF, switches readonly team, rejects old token and logout", async () => {
    const login = (supplied: string) => fetch(`${url}/api/v1/auth/login`, { method: "POST", headers, body: JSON.stringify({ provider: "internal_test", username: "synthetic.bootstrap", password: supplied }) });
    expect((await login("wrong-synthetic-password")).status).toBe(401);
    const logged = await login(password); expect(logged.status).toBe(200);
    expect(await logged.json()).toMatchObject({ ok: true, data: { activeWorkspace: { id: personal, kind: "personal", readOnly: false , isDemo: false} } });
    const oldCookie = logged.headers.get("set-cookie")!.split(";")[0]!;
    const session = await fetch(`${url}/api/v1/auth/session`, { headers: { ...headers, cookie: oldCookie, "x-request-id": "bootstrap-session-001" } });
    expect(session.status).toBe(200); expect(session.headers.get("x-request-id")).toBe("bootstrap-session-001");
    const switched = await fetch(`${url}/api/v1/auth/workspace`, { method: "POST", headers: { ...headers, cookie: oldCookie }, body: JSON.stringify({ workspaceId: team }) });
    expect(switched.status).toBe(200);
    expect(await switched.json()).toMatchObject({ ok: true, data: { activeWorkspace: { id: team, kind: "team", readOnly: true , isDemo: false} } });
    const cookie = switched.headers.get("set-cookie")!.split(";")[0]!; expect(cookie).not.toBe(oldCookie);
    expect((await fetch(`${url}/api/v1/auth/session`, { headers: { ...headers, cookie: oldCookie } })).status).toBe(401);
    expect((await fetch(`${url}/api/v1/auth/session`, { method: "DELETE", headers: { ...headers, cookie } })).status).toBe(200);
    expect((await fetch(`${url}/api/v1/auth/session`, { headers: { ...headers, cookie } })).status).toBe(401);
  });
  it("still blocks first full sync without a grant even when the synthetic source identity is configured", async () => {
    await pool.query("UPDATE users SET qihang_user_id='synthetic-only' WHERE workspace_id=$1 AND id=$2", [personal, user]);
    const tick = await new WorkspaceSyncTickService(new WorkspaceSyncRepository(pool), new JobRepository(pool)).execute({ workspaceId: personal, media: "KUAISHOU", mode: "full", triggeredAt: new Date().toISOString() });
    expect(tick.jobs).toHaveLength(1);
    expect(tick.jobs[0]).toMatchObject({ status: "blocked_auth", reason: "ACCOUNT_SCOPE_MISSING" });
    expect((await pool.query("SELECT status FROM jobs WHERE workspace_id=$1", [personal])).rows).toEqual([{ status: "blocked_auth" }]);
  });
});
