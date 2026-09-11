import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { runMigrations } from "@ka/db";
import { createDataFiltersRoutes } from "../../src/r014/data-filters-routes.js";
import { registerR014Routes } from "../../src/r014/routes.js";
import { callRoute, type Captured } from "./fake-http.js";

// Synthetic data only. Execute on the explicitly selected isolated test database.
const databaseUrl = process.env.TEST_DATABASE_URL ?? "postgres://ka:ka@127.0.0.1:55432/ka_be_be2check_test";

interface AuthContext {
  workspaceId: string; userId: string; role: "lead"; workspaceKind: "personal" | "team";
  scope: { kind: "explicit_accounts"; accounts: { media: string; accountId: string; accessLevel: "execute" }[] }
    | { kind: "team_workspace_readonly" };
}

/** Q-041 ① `GET /data/filters`：窗口内 cost>0 的级联选项，账户范围只认会话 scope。 */
describe("v1.9.27 ④ data filter options route (real PostgreSQL)", () => {
  const pool = new Pool({ connectionString: databaseUrl });
  let auth: AuthContext;
  let teamAuth: AuthContext;
  let workspaceId = "";
  const identityIds: string[] = [];
  const WINDOW = { from: "2026-09-01", to: "2026-09-03" };

  const call = (search: string, as: AuthContext = auth): Promise<Captured> =>
    callRoute(as, "/api/v1/data/filters", "GET", undefined, search);
  type Option = { key: string; label: string; cost: number };
  type Options = { optimizers: Option[]; bizs: Option[]; tasks: Option[]; resource_positions: Option[] };
  const dataOf = (result: Captured): Options => (result.body as { data: Options }).data;

  beforeAll(async () => {
    await runMigrations({ databaseUrl });
    registerR014Routes(createDataFiltersRoutes(pool));
    workspaceId = (await pool.query(
      "INSERT INTO workspaces(name,kind) VALUES($1,'personal') RETURNING id", [`filters-${randomUUID()}`],
    )).rows[0].id;
    const identityId = (await pool.query(
      "INSERT INTO auth_identities(provider,provider_subject,display_name) VALUES('internal_test',$1,'synthetic') RETURNING id",
      [`filters-${randomUUID()}`],
    )).rows[0].id;
    identityIds.push(identityId);
    const userId = (await pool.query(
      "INSERT INTO users(workspace_id,name,role) VALUES($1,'synthetic','lead') RETURNING id", [workspaceId],
    )).rows[0].id;
    await pool.query(
      "INSERT INTO workspace_memberships(workspace_id,identity_id,user_id,role,is_active) VALUES($1,$2,$3,'lead',true)",
      [workspaceId, identityId, userId]);

    // 两个户挂两个任务、两个业务；第三个户不在会话授权内（越权反例）。
    for (const [accountId, name] of [
      ["flt-a1", "DAU-拉新-自投-张三-单出价-安卓-优选-激活-有R"],
      ["flt-a2", "DAU-闪购-自投-李四-单出价-安卓-联盟-激活-有R"],
      ["flt-a3", "DAU-隐藏-自投-王五-单出价-安卓-优选-激活-有R"],
    ] as const) {
      await pool.query(
        "INSERT INTO accounts(workspace_id,media,account_id,account_name) VALUES($1,'KUAISHOU',$2,$3)",
        [workspaceId, accountId, name]);
    }
    for (const [taskId, bizName, accountId] of [
      ["flt-t1", "拉新", "flt-a1"], ["flt-t2", "闪购", "flt-a2"], ["flt-t3", "隐藏业务", "flt-a3"],
    ] as const) {
      await pool.query(
        `INSERT INTO tasks(workspace_id,task_id,task_name,biz_name,status,period_start,period_end)
         VALUES($1,$2,$3,$4,'active','2026-09-01','2026-09-30')`,
        [workspaceId, taskId, `${bizName}·任务`, bizName]);
      await pool.query(
        `INSERT INTO task_accounts(workspace_id,task_id,media,account_id,valid_from)
         VALUES($1,$2,'KUAISHOU',$3,'2026-09-01')`, [workspaceId, taskId, accountId]);
    }
    // a1 花了钱、a2 花了 0、a3（越权那个）花了很多——它一旦出现在选项里就是越权。
    for (const [accountId, cost] of [["flt-a1", 100], ["flt-a2", 0], ["flt-a3", 9999]] as const) {
      for (const ds of ["2026-09-01", "2026-09-02"]) {
        await pool.query(
          `INSERT INTO account_metrics_daily(workspace_id,media,account_id,ds,cost,computed_at)
           VALUES($1,'KUAISHOU',$2,$3::date,$4,now())`, [workspaceId, accountId, ds, cost]);
      }
    }

    auth = {
      workspaceId, userId, role: "lead", workspaceKind: "personal",
      scope: {
        kind: "explicit_accounts",
        accounts: ["flt-a1", "flt-a2"].map((accountId) => ({
          media: "KUAISHOU", accountId, accessLevel: "execute" as const,
        })),
      },
    };
    teamAuth = { ...auth, workspaceKind: "team", scope: { kind: "team_workspace_readonly" } };
  });

  afterAll(async () => {
    for (const table of ["account_metrics_daily", "task_accounts", "tasks", "accounts",
      "workspace_memberships", "users"]) {
      await pool.query(`DELETE FROM ${table} WHERE workspace_id=$1`, [workspaceId]);
    }
    await pool.query("DELETE FROM workspaces WHERE id=$1", [workspaceId]);
    await pool.query("DELETE FROM auth_identities WHERE id = ANY($1::uuid[])", [identityIds]);
    await pool.end();
  });

  it("lists only what the session may see and only what actually spent", async () => {
    const result = await call(`?window_from=${WINDOW.from}&window_to=${WINDOW.to}`);
    expect(result.status, JSON.stringify(result.body)).toBe(200);
    const data = dataOf(result);
    // a3 不在会话授权内：它的业务/任务一个都不许出现，哪怕它花得最多。
    expect(JSON.stringify(data)).not.toContain("隐藏");
    // a2 花了 0：选项里不该有它——点进去必然是空页面。
    expect(data.bizs.map((entry) => entry.key)).toEqual(["拉新"]);
    expect(data.bizs[0]!.cost).toBe(200);
    expect(data.tasks.map((entry) => entry.key)).toEqual(["flt-t1"]);
    expect(data.tasks[0]!.label).toBe("拉新·任务");
  });

  it("narrows the downstream levels by the upstream selection", async () => {
    // 选一个不存在的业务：下游任务应当为空，而不是照样列全部。
    const data = dataOf(await call(`?window_from=${WINDOW.from}&window_to=${WINDOW.to}&biz[]=闪购`));
    expect(data.tasks).toEqual([]);
    // 业务这一级自己不受自己约束，仍能看到有花费的那个。
    expect(data.bizs.map((entry) => entry.key)).toEqual(["拉新"]);
  });

  it("refuses a malformed or oversized window instead of guessing one", async () => {
    expect((await call("")).status).toBe(400);
    expect((await call("?window_from=2026-09-03&window_to=2026-09-01")).status).toBe(400);
    expect((await call("?window_from=2026-01-01&window_to=2026-12-31")).status).toBe(400);
    expect((await call(`?window_from=${WINDOW.from}&window_to=${WINDOW.to}&media=not a media`)).status).toBe(400);
  });

  it("says the team source is unavailable rather than returning an empty option list", async () => {
    // 空列表会被读成「没有可选项」，而事实是「这个源还没接」——两者不能混。
    const result = await call(`?window_from=${WINDOW.from}&window_to=${WINDOW.to}`, teamAuth);
    expect(result.status).toBe(503);
    expect((result.body as { error: { code: string } }).error.code).toBe("SOURCE_UNAVAILABLE");
  });

  it("returns empty groups when the session has no accounts at all", async () => {
    const empty: AuthContext = { ...auth, scope: { kind: "explicit_accounts", accounts: [] } };
    const result = await call(`?window_from=${WINDOW.from}&window_to=${WINDOW.to}`, empty);
    expect(result.status).toBe(200);
    expect(dataOf(result)).toEqual({ optimizers: [], bizs: [], tasks: [], resource_positions: [] });
  });
});
