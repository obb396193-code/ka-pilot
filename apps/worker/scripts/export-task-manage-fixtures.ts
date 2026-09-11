/**
 * 从**真响应**导出任务管理视图的三份 fixture（arch v1.9.28 / be2 Q-043 ⑤）：
 * `tasks/list-manage.json`（含 aliases / status=paused / monitor_url / product_name）、
 * `tasks/batch-save.json`、`tasks/assessment-price-revoke.json`。
 *
 * 「真响应」= 本地隔离库 + 真服务/真路由处理器跑出来的那一份，不是手写。
 * 合成数据、跑完删干净；只有时间戳与 requestId 归一化，否则每导一次都 diff。
 */
import { randomUUID } from "node:crypto";
import { writeFileSync } from "node:fs";

import { TaskListRepository, runMigrations } from "@ka/db";
import { Pool } from "pg";

import { createTaskDetailRoutes } from "../src/r014/task-detail-routes.js";
import { createTaskTabRoutes } from "../src/r014/task-tab-routes.js";
import { registerR014Routes } from "../src/r014/routes.js";
import { TaskListService } from "../src/tasks/task-list-service.js";
import { callRoute, type Captured } from "../test/r014/fake-http.js";

const databaseUrl = process.env.TEST_DATABASE_URL;
if (databaseUrl === undefined) throw new Error("Explicit local synthetic TEST_DATABASE_URL required");
const url = new URL(databaseUrl);
if (!["localhost", "127.0.0.1"].includes(url.hostname) || url.port !== "55432"
  || !/^\/ka_[a-z0-9_]+_test$/.test(url.pathname)) {
  throw new Error("Fixture export restricted to the local isolated ka_*_test database");
}

const FIXTURES = new URL("../../../packages/contract/fixtures/tasks/", import.meta.url);
const BUSINESS_DATE = "2026-09-05";
const FROZEN_AS_OF = "2026-09-05T09:15:00.000+08:00";
const CONTRACT_META = {
  requestId: "fixture",
  dataAsOf: FROZEN_AS_OF,
  businessDate: BUSINESS_DATE,
  workspaceKind: "personal",
  selectedSource: "platform",
};

const pool = new Pool({ connectionString: databaseUrl });
const workspaceId = { value: "" };
const identityId = { value: "" };

/** 每次导出都会变的值（随机 id、随天数走的计数）归一化，否则 fixture 天天 diff、冻不住。 */
const FROZEN_USER_ID = "00000000-0000-4000-8000-000000000001";
function write(name: string, payload: { meta?: Record<string, unknown> }, note: string): void {
  payload.meta = { ...CONTRACT_META, ...payload.meta, requestId: "fixture", _note: note };
  const target = new URL(name, FIXTURES);
  writeFileSync(target, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
  console.log(`wrote ${target.pathname}`);
}

function body(result: Captured): { ok: boolean; data: unknown; meta: Record<string, unknown> } {
  if (result.status !== 200) throw new Error(`unexpected ${result.status}: ${JSON.stringify(result.body)}`);
  return result.body as { ok: boolean; data: unknown; meta: Record<string, unknown> };
}

try {
  await runMigrations({ databaseUrl });
  registerR014Routes([...createTaskDetailRoutes(pool), ...createTaskTabRoutes(pool)]);
  workspaceId.value = (await pool.query(
    "INSERT INTO workspaces(name,kind) VALUES($1,'personal') RETURNING id", [`fixture-${randomUUID()}`],
  )).rows[0].id;
  identityId.value = (await pool.query(
    "INSERT INTO auth_identities(provider,provider_subject,display_name) VALUES('internal_test',$1,'synthetic') RETURNING id",
    [`fixture-${randomUUID()}`],
  )).rows[0].id;
  const userId = (await pool.query(
    "INSERT INTO users(workspace_id,name,role) VALUES($1,'合成负责人','lead') RETURNING id", [workspaceId.value],
  )).rows[0].id;
  await pool.query(
    "INSERT INTO workspace_memberships(workspace_id,identity_id,user_id,role,is_active) VALUES($1,$2,$3,'lead',true)",
    [workspaceId.value, identityId.value, userId]);

  // 一个业务大类下两条任务：一条在投带别名/监测链接/产品名，一条停投（视图里沉底）。
  const running = "task-manage-1";
  const paused = "task-manage-2";
  for (const [taskId, status, accountId] of [
    [running, "active", "manage-a1"], [paused, "paused", "manage-a2"],
  ] as const) {
    await pool.query(
      "INSERT INTO accounts(workspace_id,media,account_id,account_name) VALUES($1,'KUAISHOU',$2,'DAU-拉新专项-自投-张三')",
      [workspaceId.value, accountId]);
    await pool.query(
      `INSERT INTO tasks(workspace_id,task_id,task_name,biz_name,status,period_start,period_end,
         target_volume,budget,owner_user_id,aliases,monitor_url,product_name)
       VALUES($1,$2,$3,'拉新',$4,'2026-09-01','2026-09-30',120000,3000000,$5,
         ARRAY['拉新专项']::text[],'https://example.invalid/monitor','某产品')`,
      [workspaceId.value, taskId, status === "paused" ? "拉新·停投批次" : "拉新·主力批次", status, userId]);
    await pool.query(
      `INSERT INTO task_accounts(workspace_id,task_id,media,account_id,valid_from)
       VALUES($1,$2,'KUAISHOU',$3,'2026-09-01')`, [workspaceId.value, taskId, accountId]);
  }
  await pool.query(
    `INSERT INTO assessment_price_history(workspace_id,task_id,price,effective_date,changed_by,op)
     VALUES($1,$2,38,'2026-09-01',$4,'set'),($1,$2,42,'2026-09-03',$4,'set'),
            ($1,$3,38,'2026-09-01',$4,'set')`,
    [workspaceId.value, running, paused, userId]);

  const auth = {
    workspaceId: workspaceId.value, userId, role: "lead", workspaceKind: "personal",
    scope: {
      kind: "explicit_accounts",
      accounts: ["manage-a1", "manage-a2"].map((accountId) => ({
        media: "KUAISHOU", accountId, accessLevel: "execute",
      })),
    },
  };

  /* ① 列表：任务管理视图读的就是 GET /tasks，只是多用了三个字段。 */
  const service = new TaskListService({ repository: new TaskListRepository(pool) });
  const listed = await service.execute(
    { page: 1, pageSize: 20 }, auth, "fixture", new Date(`${BUSINESS_DATE}T12:00:00+08:00`));
  write("list-manage.json", listed as { meta?: Record<string, unknown> },
    "GET /api/v1/tasks（任务管理视图口径）：apps/worker/scripts/export-task-manage-fixtures.ts "
    + "对本地隔离库 + 真 TaskListService 导出。v1.9.28 每行带 aliases / monitorUrl / productName，"
    + "status 可为 paused（停投，排序沉底，排在 ended 之后）；其余字段与 task-list/ready.json 同形");

  /* ② 整类保存：全成功才写。 */
  const saved = body(await callRoute(auth, "/api/v1/tasks/batch-save", "POST", {
    items: [
      { task_id: running, product_name: "某产品", aliases: ["拉新专项", "拉新"] },
      { task_id: paused, status: "paused", monitor_url: "https://example.invalid/monitor" },
    ],
  }));
  (saved.data as { saved: { taskId: string }[] }).saved.sort((left, right) =>
    left.taskId.localeCompare(right.taskId));
  write("batch-save.json", saved,
    "POST /api/v1/tasks/batch-save：真响应。一个大类整体保存，**全部成功才写**；"
    + "任一条失败返 400 且 error.details.failed[] 逐条说明（code=INVALID_INPUT/NOT_FOUND），"
    + "此时一条也不落库——一半写进去一半没写，页面上看不出是哪一半");

  /* ③ 考核价作废：只增不改，作废后回到上一段。 */
  const revoked = body(await callRoute(auth, `/api/v1/tasks/${encodeURIComponent(running)}/assessment-price`,
    "POST", { op: "revoke", effective_date: "2026-09-03" }));
  // recomputed_days 是「从生效日到今天」，随天数走；notified_user_ids 是随机 uuid。
  // 两者的**含义**才是契约要冻的东西，具体数值不是。
  const revokedData = revoked.data as { recomputed_days: number; notified_user_ids: string[] };
  revokedData.recomputed_days = 3;
  revokedData.notified_user_ids = revokedData.notified_user_ids.map(() => FROZEN_USER_ID);
  write("assessment-price-revoke.json", revoked,
    "POST /api/v1/tasks/:id/assessment-price {op:\"revoke\", effective_date}：真响应。"
    + "作废掉 09-03 那段 42（old_price），这一天生效的回到上一段 38（new_price）；"
    + "取值规则 = effective_date <= D 的最近一条**未作废**段。作废行只增不改，"
    + "历史弹层照常列出它并显示作废标记；作废一个不存在的段返 404（笔误，不是幂等）。"
    + "recomputed_days 与 notified_user_ids 已归一化成固定值（前者随天数走、后者是随机 id），"
    + "冻的是它们的含义不是具体数值");
} finally {
  await cleanup();
}

/** 清场：只删本次建的行，删完自查。 */
async function cleanup(): Promise<void> {
  let leftover = 0;
  if (workspaceId.value !== "") {
    for (const table of ["assessment_price_history", "task_accounts", "tasks", "accounts",
      "workspace_memberships", "users"]) {
      await pool.query(`DELETE FROM ${table} WHERE workspace_id=$1`, [workspaceId.value]);
    }
    await pool.query("DELETE FROM workspaces WHERE id=$1", [workspaceId.value]);
    if (identityId.value !== "") await pool.query("DELETE FROM auth_identities WHERE id=$1", [identityId.value]);
    leftover = Number((await pool.query(
      "SELECT count(*)::int AS n FROM workspaces WHERE id=$1", [workspaceId.value])).rows[0].n);
  }
  await pool.end();
  if (leftover !== 0) throw new Error("fixture export left synthetic rows behind");
}
