/** Synthetic-only diagnostic; does not run in the product or normal test suite.
 * Prints evidence, not business data. Exit 2 means a confirmed scope violation.
 */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { once } from "node:events";
import type { AddressInfo } from "node:net";
import { Pool } from "pg";
import { AuthSessionRepository } from "@ka/db";
import { SessionAuthService } from "../src/auth/session-auth-service.js";
import { createDataApiServer } from "../src/data/http-server.js";
import { registerR014Routes } from "../src/r014/routes.js";
import { createTaskDetailRoutes } from "../src/r014/task-detail-routes.js";

const databaseUrl = process.env.TEST_DATABASE_URL;
assert(databaseUrl, "Explicit synthetic database required");
const url = new URL(databaseUrl);
assert(["localhost", "127.0.0.1"].includes(url.hostname) && url.port === "55432" &&
  /^\/ka_be_[a-z0-9_]*_test$/.test(url.pathname), "Only own local synthetic test database");
const pool = new Pool({ connectionString: databaseUrl, max: 4, connectionTimeoutMillis: 3000,
  statement_timeout: 5000 });
const ws = randomUUID(), user = randomUUID(), identity = randomUUID();
const hidden = `audit-hidden-${randomUUID()}`, mixed = `audit-mixed-${randomUUID()}`;
const account = `audit-same-id-${randomUUID()}`;
const token = randomUUID(), bearer = randomUUID();
const session = new SessionAuthService(new AuthSessionRepository(pool));
// Unused routes must never be invoked by this narrow diagnostic.
const unused = new Proxy({}, { get() { throw new Error("Unexpected unrelated service"); } }) as never;
const server = createDataApiServer({ service: unused, detailService: unused, taskListService: unused,
  accountListService: unused, workItemListService: unused, internalToken: bearer, sessionAuthService: session });
let listening = false;
type Body = { data?: { task?: { taskName?: string }; overview?: {
  achieved?: { value?: number }; blockers?: { title: string }[];
} } };
try {
  await pool.query("INSERT INTO workspaces(id,name,kind) VALUES($1,'synthetic scope audit','personal')", [ws]);
  await pool.query("INSERT INTO users(id,workspace_id,name,role) VALUES($1,$2,'synthetic actor','optimizer')", [user, ws]);
  await pool.query("INSERT INTO auth_identities(id,provider,provider_subject,display_name) VALUES($1,'internal_test',$2,'synthetic audit')", [identity, randomUUID()]);
  await pool.query("INSERT INTO workspace_memberships(workspace_id,identity_id,user_id,role) VALUES($1,$2,$3,'optimizer')", [ws, identity, user]);
  await pool.query("INSERT INTO accounts(workspace_id,media,account_id) VALUES($1,'KUAISHOU',$2),($1,'TENCENT',$2),($1,'TENCENT','audit-hidden-account')", [ws, account]);
  await pool.query("INSERT INTO account_access_grants(workspace_id,identity_id,media,account_id,access_level) VALUES($1,$2,'KUAISHOU',$3,'read')", [ws, identity, account]);
  await pool.query("INSERT INTO tasks(workspace_id,task_id,task_name,status) VALUES($1,$2,'synthetic hidden task','active'),($1,$3,'synthetic mixed task','active')", [ws, hidden, mixed]);
  await pool.query(`INSERT INTO task_accounts(workspace_id,task_id,media,account_id,valid_from)
    VALUES($1,$2,'TENCENT','audit-hidden-account','2001-01-01'),($1,$3,'TENCENT',$4,'2001-01-01'),($1,$3,'KUAISHOU',$4,'2001-01-01')`, [ws, hidden, mixed, account]);
  await pool.query(`INSERT INTO account_metrics_daily(workspace_id,media,account_id,ds,real_conversion)
    VALUES($1,'KUAISHOU',$2,'2026-09-01',1),($1,'TENCENT',$2,'2026-09-01',7)`, [ws, account]);
  await pool.query(`INSERT INTO work_items(workspace_id,type,status,title,task_id,media,account_id)
    VALUES($1,'diagnosis','open','synthetic unauthorized blocker',$2,'TENCENT',$3)`, [ws, mixed, account]);
  const issued = await session.issueForIdentity({ identityId: identity, token, expiresAt: new Date(Date.now() + 60_000) });
  assert.equal(issued.status, "approved");
  const auth = await session.resolve(token);
  assert(auth.status === "approved" && auth.context.scope.kind === "explicit_accounts");
  assert.equal(auth.context.scope.accounts.length, 1);
  registerR014Routes(createTaskDetailRoutes(pool));
  server.listen(0, "127.0.0.1"); await once(server, "listening"); listening = true;
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  const read = async (id: string, cookie = true) => {
    const response = await fetch(`${base}/api/v1/tasks/${id}`, { signal: AbortSignal.timeout(5000),
      headers: { authorization: `Bearer ${bearer}`, ...(cookie ? { cookie: `ka_session=${token}` } : {}) } });
    return { status: response.status, body: await response.json() as Body };
  };
  const hiddenResult = await read(hidden), mixedResult = await read(mixed);
  await pool.query("UPDATE account_access_grants SET revoked_at=now() WHERE workspace_id=$1 AND identity_id=$2", [ws, identity]);
  const revoked = await session.resolve(token);
  assert(revoked.status === "approved" && revoked.context.scope.kind === "explicit_accounts");
  assert.equal(revoked.context.scope.accounts.length, 0);
  const emptyResult = await read(hidden), noCookie = await read(hidden, false);
  assert.equal(noCookie.status, 401);
  const evidence = {
    hiddenTaskStatus: hiddenResult.status,
    hiddenMetadataExposed: hiddenResult.body.data?.task?.taskName === "synthetic hidden task",
    mixedTaskStatus: mixedResult.status,
    mixedAchieved: mixedResult.body.data?.overview?.achieved?.value ?? null,
    authorizedAchieved: 1,
    unauthorizedBlockerExposed: mixedResult.body.data?.overview?.blockers?.some(b => b.title === "synthetic unauthorized blocker") ?? false,
    emptyScopeStatus: emptyResult.status, missingCookieStatus: noCookie.status,
  };
  console.log(JSON.stringify(evidence));
  if (evidence.hiddenMetadataExposed || evidence.unauthorizedBlockerExposed ||
    evidence.mixedAchieved === 8 || evidence.emptyScopeStatus === 200) process.exitCode = 2;
} finally {
  if (listening) await new Promise<void>((resolve, reject) => server.close(e => e ? reject(e) : resolve()));
  try {
    await pool.query("DELETE FROM auth_sessions WHERE identity_id=$1", [identity]);
    for (const table of ["work_items", "account_metrics_daily", "task_accounts", "tasks", "account_access_grants", "accounts", "workspace_memberships", "users"]) {
      await pool.query(`DELETE FROM ${table} WHERE workspace_id=$1`, [ws]);
    }
    await pool.query("DELETE FROM workspaces WHERE id=$1", [ws]);
    await pool.query("DELETE FROM auth_identities WHERE id=$1", [identity]);
  } finally { await pool.end(); }
}
