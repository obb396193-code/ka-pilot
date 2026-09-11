/**
 * 从**真响应**导出 v1.9.35「部分合计」的两份 fixture（arch 2026-09-11 派）：
 * `data-query/summary-window-v3-partial.json`、`data-query/dimension-v3-partial.json`。
 *
 * 造一个**故意缺一天**的合成空间，走真 `PlatformDataSource`（同 platform-window-query 的
 * 集成用例那条链路），把 `{ok, data:{mode, source}, meta}` 原样落盘。
 * 合成数据、跑完删干净；只有 requestId/时间戳归一化。
 */
import { randomUUID } from "node:crypto";
import { writeFileSync } from "node:fs";

import { SemanticQueryRepository, runMigrations, withSemanticReadSnapshot } from "@ka/db";
import { Pool } from "pg";

import { PlatformDataSource } from "../src/data/platform-data-source.js";
import { createDataQueryRegistry } from "../src/data/query-registry.js";
import { createPlatformDimensionQuery } from "../src/data/platform-dimension-query.js";
import { createPlatformWindowQuery } from "../src/data/platform-window-query.js";

const databaseUrl = process.env.TEST_DATABASE_URL;
if (databaseUrl === undefined) throw new Error("Explicit local synthetic TEST_DATABASE_URL required");
const url = new URL(databaseUrl);
if (!["localhost", "127.0.0.1"].includes(url.hostname) || url.port !== "55432"
  || !/^\/ka_[a-z0-9_]+_test$/.test(url.pathname)) {
  throw new Error("Fixture export restricted to the local isolated ka_*_test database");
}

const FIXTURES = new URL("../../../packages/contract/fixtures/data-query/", import.meta.url);
const WINDOW = { from: "2026-09-01", to: "2026-09-02" };
const META = {
  requestId: "fixture",
  dataAsOf: "2026-09-05T09:15:00.000+08:00",
  businessDate: "2026-09-02",
  workspaceKind: "personal",
  selectedSource: "platform",
};

const pool = new Pool({ connectionString: databaseUrl, max: 3 });
const workspaceId = randomUUID();

function write(name: string, source: unknown, note: string): void {
  const target = new URL(name, FIXTURES);
  writeFileSync(target, `${JSON.stringify({
    ok: true, data: { mode: "platform", source }, meta: { ...META, _note: note },
  }, null, 2)}\n`, "utf8");
  console.log(`wrote ${target.pathname}`);
}

try {
  await runMigrations({ databaseUrl });
  await pool.query("INSERT INTO workspaces(id,name) VALUES($1,'synthetic partial window')", [workspaceId]);
  await pool.query(
    "INSERT INTO tasks(workspace_id,task_id,task_name,biz_name) VALUES($1,'synthetic-task','合成任务','合成业务')",
    [workspaceId]);
  await pool.query(
    `INSERT INTO assessment_price_history(workspace_id,task_id,price,effective_date)
     VALUES($1,'synthetic-task',20,'2026-09-01')`, [workspaceId]);
  await pool.query(
    "INSERT INTO accounts(workspace_id,media,account_id) VALUES($1,'KUAISHOU','synthetic-partial')", [workspaceId]);
  await pool.query(
    `INSERT INTO task_accounts(workspace_id,media,account_id,task_id,valid_from)
     VALUES($1,'KUAISHOU','synthetic-partial','synthetic-task','2026-08-01')`, [workspaceId]);
  // **只灌窗口里的第一天**：第二天就是那个「缺的账户日」，部分合计与判定挂起全靠它。
  await pool.query(
    `INSERT INTO account_metrics_daily(workspace_id,media,account_id,ds,cost,cash_cost,real_conversion,conversion,exposure,click,computed_at)
     VALUES($1,'KUAISHOU','synthetic-partial','2026-09-01',40,22,1,4,1000,50,'2026-09-02T10:00:00Z')`,
    [workspaceId]);

  const platform = new PlatformDataSource(
    new SemanticQueryRepository(pool),
    (read) => withSemanticReadSnapshot(pool, (connection) => read(new SemanticQueryRepository(connection))),
    createPlatformWindowQuery(pool),
    createPlatformDimensionQuery(pool));
  const execution = {
    workspaceId, userId: randomUUID(), scopeKind: "explicit_accounts" as const,
    accounts: [{ media: "KUAISHOU", accountId: "synthetic-partial", accessLevel: "execute" as const }],
  };
  const registry = createDataQueryRegistry();

  const summary = await platform.query(
    registry.resolve("account.summary", { dateFrom: WINDOW.from, dateTo: WINDOW.to }, "platform"), execution);
  write("summary-window-v3-partial.json", summary,
    "POST /data/query {queryId:\"account.summary\"}：**窗口里缺一个账户日**的真响应"
    + "（apps/worker/scripts/export-partial-window-fixtures.ts 对本地隔离库 + 真 PlatformDataSource 导出）。"
    + "v1.9.35：cashCost/realConversion/costSpace 是 availability=\"partial\" 的**部分合计**"
    + "（有数那部分的和，带真值），判定一律挂起 —— onTarget/costStatus 为 null、"
    + "costStatusReason=\"partial_data\"；lineage.partial=true，lineage.warnings 逐条点名缺的账户日"
    + "（ACCOUNT_DAY_MISSING / 有失败批次记录时 BATCH_FAILED）");

  const dimension = await platform.query(
    registry.resolve("account.dimension",
      { dateFrom: WINDOW.from, dateTo: WINDOW.to, dimensionType: "account" }, "platform"), execution);
  write("dimension-v3-partial.json", dimension,
    "POST /data/query {queryId:\"account.dimension\", dimensionType:\"account\"}：同一个缺天窗口的真响应。"
    + "维度行与 summary 同口径：部分合计带 partial 标、判定挂起；缺的账户日不被当成 0，"
    + "也不让整行变成一屏「−」");
} finally {
  await cleanup();
}

/** 清场：只删本次建的行，删完自查。finally 里直接 throw 会吞掉原始异常，所以抛在这里。 */
async function cleanup(): Promise<void> {
  for (const table of ["account_metrics_daily", "assessment_price_history", "task_accounts", "accounts", "tasks"]) {
    await pool.query(`DELETE FROM ${table} WHERE workspace_id=$1`, [workspaceId]);
  }
  await pool.query("DELETE FROM workspaces WHERE id=$1", [workspaceId]);
  const leftover = Number((await pool.query(
    "SELECT count(*)::int AS n FROM workspaces WHERE id=$1", [workspaceId])).rows[0].n);
  await pool.end();
  if (leftover !== 0) throw new Error("fixture export left synthetic rows behind");
}
