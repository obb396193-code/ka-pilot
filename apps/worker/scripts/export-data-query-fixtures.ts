/**
 * 从**真响应**重导 `packages/contract/fixtures/data-query/*` 的平台源那一批
 * （arch 2026-09-12 序 ②「一次重导 + 四键转必填」）。
 *
 * 「真响应」= 本地隔离库 + 真 `PlatformDataSource` + 真注册表跑出来的那一份，不是手写。
 * 每个场景各用一个合成空间，互不干扰；跑完全删，删完自查。
 * 只归一化 requestId 与随机 UUID —— 其余一个数都不改，否则「fixture 即契约」就没了意义。
 *
 * 为什么要重导：`incentiveCost` 与三个 BI 值（`biConv`/`biCashCost`/`overCost`）在 schema 里
 * 一直是 optional，只因为这些 fixture 是它们存在之前导的。重导之后四键转必填，
 * 「后端漏发」才会被挡下来，而不是在页面上静悄悄显成「−」。
 */
import { randomUUID } from "node:crypto";
import { writeFileSync } from "node:fs";

import { SemanticQueryRepository, runMigrations } from "@ka/db";
import { Pool } from "pg";

import { PlatformDataSource, createPlatformReadSnapshot } from "../src/data/platform-data-source.js";
import { createDataQueryRegistry } from "../src/data/query-registry.js";
import { createPlatformDimensionQuery } from "../src/data/platform-dimension-query.js";
import { createPlatformWindowQuery } from "../src/data/platform-window-query.js";
import { createPlatformPivotQuery } from "../src/data/platform-pivot-query.js";

const databaseUrl = process.env.TEST_DATABASE_URL;
if (databaseUrl === undefined) throw new Error("Explicit local synthetic TEST_DATABASE_URL required");
const url = new URL(databaseUrl);
if (!["localhost", "127.0.0.1"].includes(url.hostname) || url.port !== "55432"
  || !/^\/ka_[a-z0-9_]+_test$/.test(url.pathname)) {
  throw new Error("Fixture export restricted to the local isolated ka_*_test database");
}

/** 默认写进契约目录；`FIXTURE_OUT_DIR` 指到别处可以先看一眼再决定覆盖（冻结件不能盲覆盖）。 */
const FIXTURES = process.env.FIXTURE_OUT_DIR === undefined
  ? new URL("../../../packages/contract/fixtures/data-query/", import.meta.url)
  : new URL(`${process.env.FIXTURE_OUT_DIR.replace(/\/?$/, "/")}`, "file:///");
const pool = new Pool({ connectionString: databaseUrl, max: 4 });
const workspaces: string[] = [];

interface Day { accountId: string; ds: string; cost: number | null; cash: number | null; real: number | null;
  conversion?: number | null; exposure?: number | null; click?: number | null }

/** 一个场景 = 一个空间 + 一批账户 + 一批账户日；价格按天给，这样能造出「某天超、整窗不超」。 */
async function space(input: {
  accounts: string[]; days: Day[]; prices: [string, number][];
  names?: Record<string, string>;
}): Promise<{ workspaceId: string; accounts: { media: string; accountId: string; accessLevel: "execute" }[] }> {
  const workspaceId = randomUUID();
  workspaces.push(workspaceId);
  await pool.query("INSERT INTO workspaces(id,name) VALUES($1,'synthetic data-query fixture')", [workspaceId]);
  await pool.query("INSERT INTO tasks(workspace_id,task_id,task_name,biz_name) VALUES($1,'t-1','投放任务','拉新业务')",
    [workspaceId]);
  for (const [effectiveDate, price] of input.prices) {
    await pool.query(
      "INSERT INTO assessment_price_history(workspace_id,task_id,price,effective_date) VALUES($1,'t-1',$2,$3)",
      [workspaceId, price, effectiveDate]);
  }
  for (const accountId of input.accounts) {
    await pool.query("INSERT INTO accounts(workspace_id,media,account_id,account_name) VALUES($1,'KUAISHOU',$2,$3)",
      [workspaceId, accountId, input.names?.[accountId] ?? null]);
    await pool.query(
      `INSERT INTO task_accounts(workspace_id,media,account_id,task_id,valid_from)
       VALUES($1,'KUAISHOU',$2,'t-1','2026-08-01')`, [workspaceId, accountId]);
  }
  for (const day of input.days) {
    await pool.query(
      `INSERT INTO account_metrics_daily(workspace_id,media,account_id,ds,cost,cash_cost,real_conversion,conversion,exposure,click,computed_at)
       VALUES($1,'KUAISHOU',$2,$3,$4,$5,$6,$7,$8,$9,'2026-09-05T10:00:00Z')`,
      [workspaceId, day.accountId, day.ds, day.cost, day.cash, day.real,
        day.conversion ?? null, day.exposure ?? null, day.click ?? null]);
  }
  return { workspaceId, accounts: input.accounts.map((accountId) => ({ media: "KUAISHOU" as const, accountId, accessLevel: "execute" as const })) };
}

/**
 * 昵称清洗标签：规则（`naming_rules`）+ 解析行（`account_name_parses`）。
 * 解析行的 `rule_version` 必须与规则版本一致——标签要按解析当时那版规则解释，
 * 拿最新规则去解释旧解析结果，分组会凭空变。
 */
async function seedNaming(workspaceId: string, labels: Record<string, Record<string, string>>): Promise<void> {
  const keys = [...new Set(Object.values(labels).flatMap((entry) => Object.keys(entry)))];
  const named = new Set(["optimizer", "goal", "placement"]);
  await pool.query(
    `INSERT INTO naming_rules(workspace_id,media,version,segments,effective_from)
     VALUES($1,'KUAISHOU',1,$2::jsonb,'2026-08-01')`,
    [workspaceId, JSON.stringify(keys.map((key) => ({
      key, mapsTo: named.has(key) ? key : null, pending: false })))]);
  for (const [accountId, entry] of Object.entries(labels)) {
    const segments = Object.fromEntries(Object.entries(entry).map(([key, value]) => [
      key, { key, value, mapsTo: named.has(key) ? key : null, taskIds: [] }]));
    const { rows } = await pool.query(
      "SELECT account_name FROM accounts WHERE workspace_id=$1 AND media='KUAISHOU' AND account_id=$2",
      [workspaceId, accountId]);
    await pool.query(
      `INSERT INTO account_name_parses(workspace_id,media,account_id,account_name,rule_version,status,segments,override)
       VALUES($1,'KUAISHOU',$2,$3,1,'parsed',$4::jsonb,'{}'::jsonb)`,
      [workspaceId, accountId, rows[0]?.account_name ?? null, JSON.stringify(segments)]);
  }
}

/**
 * **必须与 `data-api.ts` 的生产组装一致**：快照用 `createPlatformReadSnapshot`，
 * 它比裸 `SemanticQueryRepository` 多一个 `resolveDashboardScope` —— 少了它，
 * 带 `filters` 的 table/trend 会直接判废。fixture 是从「真响应」导的，
 * 组装方式一旦和线上不同，导出来的就不是线上那份。
 */
function source() {
  return new PlatformDataSource(
    new SemanticQueryRepository(pool), createPlatformReadSnapshot(pool),
    createPlatformWindowQuery(pool), createPlatformDimensionQuery(pool), createPlatformPivotQuery(pool));
}

const registry = createDataQueryRegistry();

async function run(scope: { workspaceId: string; accounts: { media: string; accountId: string; accessLevel: "execute" }[] },
  queryId: string, params: Record<string, unknown>): Promise<unknown> {
  return source().query(
    registry.resolve(queryId, params, "platform"),
    { workspaceId: scope.workspaceId, userId: randomUUID(), scopeKind: "explicit_accounts" as const, accounts: scope.accounts });
}

/**
 * `meta` 在 `dataQueryResponseSchema` 里是**严格三选一**（`{cellCoverage}` / hourly / gap）且可缺省。
 * 普通 summary/dimension/trend 的真响应**不带 meta**，所以被信封 schema 校验的那几份
 * （`ready-lineage` 这类）必须一个 meta 键都不写——往里塞说明文字会直接判非法。
 * 其余 fixture 不过信封校验，保留 `_note` 记录出处。
 */
const ENVELOPE_VALIDATED = new Set<string>();
/**
 * 合成空间的 id 每次跑都不一样。不归一化的话，**每导一次 fixture 就 diff 一次**，
 * 而变的只是一个与契约无关的随机值——那样谁也看不出「这次重导到底改了什么」。
 */
const STABLE_WORKSPACE_ID = "00000000-0000-4000-8000-000000000024";
function normalize(body: unknown): unknown {
  let text = JSON.stringify(body, null, 2);
  for (const id of workspaces) text = text.split(id).join(STABLE_WORKSPACE_ID);
  return JSON.parse(text);
}

function write(name: string, payload: unknown, note: string, meta?: Record<string, unknown>): void {
  const target = new URL(name, FIXTURES);
  const body: Record<string, unknown> = { ok: true, data: { mode: "platform", source: payload } };
  if (meta !== undefined) body.meta = meta;
  else if (!ENVELOPE_VALIDATED.has(name)) {
    body.meta = { requestId: "fixture", workspaceKind: "personal", selectedSource: "platform", _note: note };
  }
  writeFileSync(target, `${JSON.stringify(normalize(body), null, 2)}\n`, "utf8");
  console.log(`wrote ${name}`);
}

/**
 * pivot2 走的是 `PlatformDataSource.pivot()`，**不是** `query()`——它收完整的授权上下文，
 * 而且响应信封只带 `meta.cellCoverage`（服务层 `query-service.ts` 那段就是这么组的）。
 * fixture 必须照真信封写，否则前端按 fixture 写的解析在真响应上对不上。
 */
async function runPivot(
  scope: { workspaceId: string; accounts: { media: string; accountId: string; accessLevel: "execute" }[] },
  dimA: string, dimB: string,
): Promise<{ source: unknown; cellCoverage: unknown }> {
  const auth = {
    workspaceId: scope.workspaceId, userId: randomUUID(), role: "optimizer" as const,
    workspaceKind: "personal" as const,
    scope: { kind: "explicit_accounts" as const, accounts: scope.accounts.map((account) => ({ ...account, accessLevel: "read" as const })) },
  };
  const resolved = registry.resolve("account.pivot2",
    { dateFrom: "2026-09-01", dateTo: "2026-09-02", media: "KUAISHOU", dimA, dimB }, "platform");
  return source().pivot(resolved, auth);
}

function writePivot(name: string, result: { source: unknown; cellCoverage: unknown }, note: string): void {
  // pivot2 的真信封只有 `meta.cellCoverage`，而且是 `.strict()` —— 说明文字不能塞进去。
  write(name, result.source, note, { cellCoverage: result.cellCoverage });
}

async function cleanup(): Promise<void> {
  for (const table of ["account_metrics_daily", "etl_runs", "assessment_price_history",
    "account_name_parses", "naming_rules", "task_accounts", "accounts", "tasks"]) {
    await pool.query(`DELETE FROM ${table} WHERE workspace_id=ANY($1::uuid[])`, [workspaces]);
  }
  await pool.query("DELETE FROM workspaces WHERE id=ANY($1::uuid[])", [workspaces]);
  const leftover = Number((await pool.query(
    "SELECT count(*)::int AS n FROM workspaces WHERE id=ANY($1::uuid[])", [workspaces])).rows[0].n);
  await pool.end();
  if (leftover !== 0) throw new Error("fixture export left synthetic rows behind");
}

try {
  await runMigrations({ databaseUrl });
  const WINDOW = { dateFrom: "2026-09-01", dateTo: "2026-09-02" };

  /* ① 达标（每天都不超） */
  const green = await space({
    accounts: ["acc-1"], prices: [["2026-09-01", 20]],
    days: [
      { accountId: "acc-1", ds: "2026-09-01", cost: 40, cash: 30, real: 2, conversion: 4, exposure: 1000, click: 50 },
      { accountId: "acc-1", ds: "2026-09-02", cost: 40, cash: 30, real: 2, conversion: 4, exposure: 1000, click: 50 },
    ],
  });
  write("summary-window-v3-green.json", await run(green, "account.summary", WINDOW),
    "POST /data/query {queryId:\"account.summary\"}：真响应（apps/worker/scripts/export-data-query-fixtures.ts"
    + " 对本地隔离库 + 真 PlatformDataSource 导出）。每天现金都不超当天目标 → costStatus=green、"
    + "costStatusReason=window_ok、onTarget=true");

  /* ② 某天超、整窗不超 */
  const yellow = await space({
    accounts: ["acc-1"], prices: [["2026-09-01", 20]],
    days: [
      { accountId: "acc-1", ds: "2026-09-01", cost: 60, cash: 50, real: 2, conversion: 4, exposure: 1000, click: 50 },
      { accountId: "acc-1", ds: "2026-09-02", cost: 20, cash: 10, real: 2, conversion: 4, exposure: 1000, click: 50 },
    ],
  });
  write("summary-window-v3-yellow.json", await run(yellow, "account.summary", WINDOW),
    "同上，真响应。09-01 当天现金 50 > 当天目标 40、整窗 60 ≤ 80 → costStatus=yellow、"
    + "costStatusReason=day_over_window_ok、onTarget 仍为 true（判的是整窗）");

  /* ③ 现金全缺 */
  const cashMissing = await space({
    accounts: ["acc-1"], prices: [["2026-09-01", 20]],
    days: [
      { accountId: "acc-1", ds: "2026-09-01", cost: 40, cash: null, real: 2, conversion: 4, exposure: 1000, click: 50 },
      { accountId: "acc-1", ds: "2026-09-02", cost: 40, cash: null, real: 2, conversion: 4, exposure: 1000, click: 50 },
    ],
  });
  write("summary-window-v3-cash-missing.json", await run(cashMissing, "account.summary", WINDOW),
    "同上，真响应。窗口内一天现金都没有 → cashCost/costSpace 为 missing（**不是 0**）、"
    + "判定挂起 onTarget/costStatus 为 null、costStatusReason=cash_missing");

  /* ④ 真实转化全缺 */
  const conversionMissing = await space({
    accounts: ["acc-1"], prices: [["2026-09-01", 20]],
    days: [
      { accountId: "acc-1", ds: "2026-09-01", cost: 40, cash: 30, real: null, conversion: 4, exposure: 1000, click: 50 },
      { accountId: "acc-1", ds: "2026-09-02", cost: 40, cash: 30, real: null, conversion: 4, exposure: 1000, click: 50 },
    ],
  });
  write("summary-window-v3-conversion-missing.json", await run(conversionMissing, "account.summary", WINDOW),
    "同上，真响应。现金与考核价可得、真实转化全缺 → costSpace 算不出来，"
    + "costStatusReason=conversion_missing，cashCpa 为 undefined");

  /* ⑤ 部分合计（窗口里缺一个账户日） */
  const partial = await space({
    accounts: ["acc-1", "acc-2"], prices: [["2026-09-01", 20]],
    days: [
      { accountId: "acc-1", ds: "2026-09-01", cost: 40, cash: 30, real: 2, conversion: 4, exposure: 1000, click: 50 },
      { accountId: "acc-1", ds: "2026-09-02", cost: 40, cash: 30, real: 2, conversion: 4, exposure: 1000, click: 50 },
      { accountId: "acc-2", ds: "2026-09-01", cost: 20, cash: 15, real: 1, conversion: 2, exposure: 500, click: 25 },
      { accountId: "acc-2", ds: "2026-09-02", cost: null, cash: null, real: null, conversion: null, exposure: null, click: null },
    ],
  });
  write("summary-window-v3-partial.json", await run(partial, "account.summary", WINDOW),
    "同上，真响应。**窗口里缺一个账户日**（acc-2 的 09-02 是空值行）→ v1.9.40 部分合计："
    + "每个可加字段给「有数那部分的和」并标 availability=\"partial\"（带真值，不是 0 也不是 −），"
    + "由部分分子/分母算出的比率照常 finite；判定一律挂起 —— onTarget/costStatus 为 null、"
    + "costStatusReason=\"partial_data\"");
  write("dimension-v3-partial.json", await run(partial, "account.dimension", { ...WINDOW, dimensionType: "account" }),
    "POST /data/query {queryId:\"account.dimension\", dimensionType:\"account\"}：同一个缺天窗口的真响应。"
    + "缺数的 acc-2 那一行是部分合计 + 判定挂起；三天齐的 acc-1 仍是 available，**不被染成 partial**");

  /* ⑥ 维度三件套 + 表格 + 趋势，用同一个齐全空间 */
  const full = await space({
    accounts: ["acc-1", "acc-2"], prices: [["2026-09-01", 20]],
    names: { "acc-1": "启航-拉新-张三", "acc-2": "启航-拉新-李四" },
    days: [
      { accountId: "acc-1", ds: "2026-09-01", cost: 40, cash: 30, real: 2, conversion: 4, exposure: 1000, click: 50 },
      { accountId: "acc-1", ds: "2026-09-02", cost: 40, cash: 30, real: 2, conversion: 4, exposure: 1000, click: 50 },
      { accountId: "acc-2", ds: "2026-09-01", cost: 20, cash: 15, real: 1, conversion: 2, exposure: 500, click: 25 },
      { accountId: "acc-2", ds: "2026-09-02", cost: 20, cash: 15, real: 1, conversion: 2, exposure: 500, click: 25 },
    ],
  });
  for (const [dimension, name] of [["task", "dimension-v3-task.json"], ["biz", "dimension-v3-biz.json"]] as const) {
    write(name, await run(full, "account.dimension", { ...WINDOW, dimensionType: dimension }),
      `POST /data/query {queryId:"account.dimension", dimensionType:"${dimension}"}：真响应，窗口内账户日齐全。`);
  }
  /* 账户维度这份要**同时**带上「有数」和「整窗一条都没有」两种行：
     后者是真实里很常见的一档（账户当期没投或没拉到），它必须是 missing 而不是 0，
     比率也得是 undefined —— 填 0 会让一个没投放的账户在榜单上看着像花了 0 块还达标。 */
  const withMissing = await space({
    accounts: ["acc-1", "acc-quiet"], prices: [["2026-09-01", 20]],
    names: { "acc-1": "启航-拉新-张三", "acc-quiet": "启航-拉新-王五" },
    days: [
      { accountId: "acc-1", ds: "2026-09-01", cost: 40, cash: 30, real: 2, conversion: 4, exposure: 1000, click: 50 },
      { accountId: "acc-1", ds: "2026-09-02", cost: 40, cash: 30, real: 2, conversion: 4, exposure: 1000, click: 50 },
    ],
  });
  write("dimension-v3-account.json", await run(withMissing, "account.dimension", { ...WINDOW, dimensionType: "account" }),
    "POST /data/query {queryId:\"account.dimension\", dimensionType:\"account\"}：真响应。"
    + "acc-1 整窗有数；acc-quiet **整窗一条账户日都没有** → 指标全 missing（不是 0）、"
    + "比率 undefined、判定挂起。partial 的前提是「有一部分」，一条都没有就是缺");
  write("table-v3.json", await run(full, "account.table", WINDOW),
    "POST /data/query {queryId:\"account.table\"}：真响应，逐账户日明细。");
  write("trend-v3.json", await run(full, "account.trend", WINDOW),
    "POST /data/query {queryId:\"account.trend\"}：真响应，逐日走势（趋势行只有指标、没有考核结论）。");
  /* `ready-lineage.json` **不重导**：它是「血缘齐备」（metadataAvailability=known，
     datasetVersion/timezone/dayCut 都有值）的**契约参照**，而现在的后端这几项还给不出来。
     拿今天的真响应覆盖它，等于把这份参照降级成「我们目前只能做到这样」，
     以后真能给出这些元数据时就没有东西钉着形状了。 */

  /* ⑦ pivot2：命名维度与任意清洗段（Q-041 ⑦⑩，v1.9.34） */
  const pivot = await space({
    accounts: ["acc-1", "acc-2", "acc-3"], prices: [["2026-09-01", 20]],
    names: { "acc-1": "启航-拉新-张三-优选", "acc-2": "启航-拉新-李四-搜索", "acc-3": "启航-促活-张三-优选" },
    days: [
      { accountId: "acc-1", ds: "2026-09-01", cost: 40, cash: 30, real: 2, conversion: 4, exposure: 1000, click: 50 },
      { accountId: "acc-1", ds: "2026-09-02", cost: 40, cash: 30, real: 2, conversion: 4, exposure: 1000, click: 50 },
      { accountId: "acc-2", ds: "2026-09-01", cost: 20, cash: 15, real: 1, conversion: 2, exposure: 500, click: 25 },
      { accountId: "acc-2", ds: "2026-09-02", cost: 20, cash: 15, real: 1, conversion: 2, exposure: 500, click: 25 },
      { accountId: "acc-3", ds: "2026-09-01", cost: 60, cash: 45, real: 3, conversion: 6, exposure: 1500, click: 75 },
      { accountId: "acc-3", ds: "2026-09-02", cost: 60, cash: 45, real: 3, conversion: 6, exposure: 1500, click: 75 },
    ],
  });
  await seedNaming(pivot.workspaceId, {
    "acc-1": { optimizer: "张三", goal: "拉新", placement: "优选", city: "杭州" },
    "acc-2": { optimizer: "李四", goal: "拉新", placement: "搜索", city: "杭州" },
    "acc-3": { optimizer: "张三", goal: "促活", placement: "优选", city: "北京" },
  });
  writePivot("pivot2-optimizer-goal.json", await runPivot(pivot, "optimizer", "goal"),
    "POST /data/query {queryId:\"account.pivot2\", dimA:\"optimizer\", dimB:\"goal\"}：真响应"
    + "（apps/worker/scripts/export-data-query-fixtures.ts 对本地隔离库 + 真 PlatformDataSource 导出）。"
    + "v1.9.34 起透视两轴开放到命名维度（optimizer/goal/placement，由昵称清洗规则解析）。"
    + "维度值来自账户昵称；没标注的账户归 key=null 的「未标注」桶，**不猜不填默认值**。"
    + "信封只带 meta.cellCoverage —— pivot2 走的是 platform.pivot() 那条路，不是通用 query()");
  writePivot("pivot2-segment.json", await runPivot(pivot, "segment:city", "placement"),
    "POST /data/query {queryId:\"account.pivot2\", dimA:\"segment:city\", dimB:\"placement\"}：真响应。"
    + "`segment:<key>` = 按**任意清洗段**分析（老板点名的核心能力）：段名由各媒体的命名规则决定、"
    + "注册表不枚举取值只校验形状。本批只对 pivot2 开放；`account.dimension` 不收（Q-041 ⑪ 再开）");
  /* v1.9.41（arch 裁决 c）：这两份原来钉在 resource_position 上，而**没有任何解析器产出这个维度**，
     真响应永远是 DIMENSION_UNSUPPORTED。换成实测能跑的 placement（快手的「资源位」实际就落在它上面），
     保留各自原本的分析意图：版位×任务、业务×版位。 */
  writePivot("pivot2.json", await runPivot(pivot, "placement", "task"),
    "POST /data/query {queryId:\"account.pivot2\", dimA:\"placement\", dimB:\"task\"}：真响应。"
    + "策略分析视图的预设透视（承接页 × 任务）。v1.9.41 起本份从 resource_position 换到 placement："
    + "前者在 dimensionTypeSchema 里合法但没有任何解析器产出，真响应必是 DIMENSION_UNSUPPORTED；"
    + "快手口径里的「资源位」实际落在 placement（优选/搜索/联盟/主站/上下滑）");
  writePivot("pivot2-biz-resource_position.json", await runPivot(pivot, "biz", "placement"),
    "POST /data/query {queryId:\"account.pivot2\", dimA:\"biz\", dimB:\"placement\"}：真响应。"
    + "业务 × 承接页。同上，列维从 resource_position 换到 placement（文件名维持不变，避免前端改引用）");

  /* ⑧ v1.9.22/26 命名维度 + 仪表盘筛选（都在同一个已标注空间上跑） */
  for (const dimension of ["optimizer", "goal", "placement"] as const) {
    write(`dimension-v1922-${dimension}.json`,
      await run(pivot, "account.dimension", { ...WINDOW, dimensionType: dimension }),
      `POST /data/query {queryId:"account.dimension", dimensionType:"${dimension}"}：真响应。`
      + "命名维度由昵称清洗规则解析；行上的 `source`/`sources` 说明这个值是从哪来的"
      + "（nickname = 昵称解析，manual = 人工覆盖），缺标注的账户归「未标注」桶");
  }
  const FILTERED = { ...WINDOW, filters: { optimizer: ["张三"] } };
  write("dimension-v1922-filtered.json",
    await run(pivot, "account.dimension", { ...FILTERED, dimensionType: "goal" }),
    "POST /data/query {queryId:\"account.dimension\", dimensionType:\"goal\", filters:{optimizer:[\"张三\"]}}：真响应。"
    + "仪表盘筛选先筛账户日再聚合；**筛掉的账户日不参与任何合计**，也不被当成 0");
  write("summary-v1922-filtered.json", await run(pivot, "account.summary", FILTERED),
    "POST /data/query {queryId:\"account.summary\", filters:{optimizer:[\"张三\"]}}：真响应，同一套筛选下的大盘合计");
  write("table-v1922-filtered.json", await run(pivot, "account.table", FILTERED),
    "POST /data/query {queryId:\"account.table\", filters:{optimizer:[\"张三\"]}}：真响应，同一套筛选下的逐账户日明细");
  write("trend-v1922-filtered.json", await run(pivot, "account.trend", FILTERED),
    "POST /data/query {queryId:\"account.trend\", filters:{optimizer:[\"张三\"]}}：真响应，同一套筛选下的逐日走势");

  await cleanup();
} catch (error) {
  await cleanup().catch(() => undefined);
  throw error;
}
