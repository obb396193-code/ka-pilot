/**
 * 从**真响应**导出归属清洗的两份 fixture（arch 2026-09-10 v1.9.24 ①）：
 * `admin/account-names.json`（新形，带 `raw`/`failedSegments`/`meta.pendingSegments`）与
 * `admin/naming-rules-put.json`（PUT 存规范后的响应，`meta` 带 `dryRun`/`pendingSegments`）。
 *
 * 「真响应」= 本地隔离库 + 真路由处理器跑出来的那一份，不是手写的。合成数据、跑完删干净。
 * 只有时间戳做归一化（`requestId`/`parsedAt`/`createdAt` 固定成原 fixture 的值），
 * 否则每导一次 fixture 都会 diff，冻不住。
 */
import { randomUUID } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";

import { runMigrations } from "@ka/db";
import { Pool } from "pg";

import { createNamingRoutes } from "../src/r014/naming-routes.js";
import { registerR014Routes } from "../src/r014/routes.js";
import { callRoute, type Captured } from "../test/r014/fake-http.js";

const databaseUrl = process.env.TEST_DATABASE_URL;
if (databaseUrl === undefined) throw new Error("Explicit local synthetic TEST_DATABASE_URL required");
const url = new URL(databaseUrl);
if (!["localhost", "127.0.0.1"].includes(url.hostname) || url.port !== "55432"
  || !/^\/ka_[a-z0-9_]+_test$/.test(url.pathname)) {
  throw new Error("Fixture export restricted to the local isolated ka_*_test database");
}

const FIXTURES = new URL("../../../packages/contract/fixtures/admin/", import.meta.url);
const SEED_RULE = new URL("../../../scripts/seed-naming-rule-kuaishou-v1.json", import.meta.url);
/** 与原 fixture 同一批昵称，形状才对得上（前 5 条按规范写、第 6 条故意乱起）。 */
const ACCOUNTS: [string, string][] = [
  ["account-1", "DAU-CVR有端-自投-张三-单出价-安卓-优选-激活-有R-常规-13177-A"],
  ["account-2", "DAU-CVR有端-自投-张三-单出价-IOS-上下滑-激活-有R-常规-13178-B"],
  ["account-3", "DAU-M运动-代投-某代理-双出价-双端-联盟-付费-非R-一户一品-13179-C"],
  ["account-4", "DAU-M运动-代投-某代理-单出价-安卓-主站-付费-非R-常规-13180-D"],
  ["account-5", "DAU-闲鱼DAU-自投-李四-单出价-安卓-搜索-唤起-有R-常规-13181-E"],
  ["account-6", "没按规范起的名字_测试户"],
];
const FROZEN_PARSED_AT = "2026-09-05T09:10:00.000+08:00";
const FROZEN_CREATED_AT = "2026-09-05T09:00:00.000+08:00";
/** 契约层 meta（`dataAsOf`/`businessDate`/…）由壳层加，路由替身里没有：沿用原 fixture 那一份。 */
const CONTRACT_META = {
  dataAsOf: "2026-09-05T09:15:00.000+08:00",
  businessDate: "2026-09-05",
  workspaceKind: "personal",
  selectedSource: "platform",
};

const pool = new Pool({ connectionString: databaseUrl });
const workspaceId = { value: "" };
const identityId = { value: "" };

function body(result: Captured): { ok: boolean; data: unknown; meta: Record<string, unknown> } {
  if (result.status !== 200) throw new Error(`unexpected ${result.status}: ${JSON.stringify(result.body)}`);
  return result.body as { ok: boolean; data: unknown; meta: Record<string, unknown> };
}

function write(name: string, payload: unknown, note: string): void {
  const target = new URL(name, FIXTURES);
  const withNote = payload as { meta: Record<string, unknown> };
  withNote.meta = { requestId: "fixture", ...CONTRACT_META, ...withNote.meta, _note: note };
  delete (withNote.meta as { requestId?: unknown }).requestId;
  withNote.meta = { requestId: "fixture", ...withNote.meta };
  writeFileSync(target, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
  console.log(`wrote ${target.pathname}`);
}

try {
  await runMigrations({ databaseUrl });
  registerR014Routes(createNamingRoutes(pool));
  workspaceId.value = (await pool.query(
    "INSERT INTO workspaces(name,kind) VALUES($1,'personal') RETURNING id", [`fixture-${randomUUID()}`],
  )).rows[0].id;
  identityId.value = (await pool.query(
    "INSERT INTO auth_identities(provider,provider_subject,display_name) VALUES('internal_test',$1,'synthetic') RETURNING id",
    [`fixture-${randomUUID()}`],
  )).rows[0].id;
  const userId = (await pool.query(
    "INSERT INTO users(workspace_id,name,role) VALUES($1,'synthetic','lead') RETURNING id", [workspaceId.value],
  )).rows[0].id;
  await pool.query(
    "INSERT INTO workspace_memberships(workspace_id,identity_id,user_id,role,is_active) VALUES($1,$2,$3,'lead',true)",
    [workspaceId.value, identityId.value, userId]);
  for (const [accountId, accountName] of ACCOUNTS) {
    await pool.query(
      "INSERT INTO accounts(workspace_id,media,account_id,account_name) VALUES($1,'KUAISHOU',$2,$3)",
      [workspaceId.value, accountId, accountName]);
  }

  const auth = {
    workspaceId: workspaceId.value, userId, role: "lead", workspaceKind: "personal",
    scope: {
      kind: "explicit_accounts",
      accounts: ACCOUNTS.map(([accountId]) => ({ media: "KUAISHOU", accountId, accessLevel: "execute" })),
    },
  };

  const seed = JSON.parse(readFileSync(SEED_RULE, "utf8")) as Record<string, unknown>;
  const put = body(await callRoute(auth, "/api/v1/admin/naming-rules", "PUT", {
    segments: seed.segments, separators: seed.separators,
    effective_from: seed.effective_from, note: seed.note,
  }, "?media=KUAISHOU"));
  (put.data as { createdAt: string }).createdAt = FROZEN_CREATED_AT;
  write("naming-rules-put.json", put,
    "PUT /admin/naming-rules?media=KUAISHOU：存快手 v1 规范后的真响应（apps/worker/scripts/export-naming-fixtures.ts "
    + "对本地隔离库 + 真路由处理器导出，合成 6 户）。v1.9.24：data 只放规范本身；"
    + "meta.dryRun = 存完立刻对本空间该媒体全部昵称的干跑（total/byStatus/hitRate/failedSegments，"
    + "一个可跑昵称都没有时 hitRate=null 而不是 0）；meta.pendingSegments = 待确认段取值分布，"
    + "快手 v1 没有 pending 段所以是 []；createdAt 归一化成固定值以免每次导出都 diff");

  await callRoute(auth, "/api/v1/admin/account-names/reparse", "POST", { media: "KUAISHOU" });
  const listed = body(await callRoute(auth, "/api/v1/admin/account-names", "GET", undefined, "?media=KUAISHOU"));
  for (const item of (listed.data as { items: { parsedAt: string }[] }).items) item.parsedAt = FROZEN_PARSED_AT;
  write("account-names.json", listed,
    "GET /admin/account-names?media=KUAISHOU：合成 6 户的真响应（apps/worker/scripts/export-naming-fixtures.ts "
    + "对本地隔离库 + 真路由处理器导出）。v1.9.22 每行带 raw（原昵称）与 failedSegments（该行按"
    + "**它自己那版规则**没解析出来的段，规则改过后旧行不拿新规则算）；segments 按段 key 给 "
    + "value/mapsTo/taskIds；conflicts=null 表示无冲突、override=null 表示未人工改；"
    + "v1.9.23/24 meta.pendingSegments = 待确认段取值分布（快手 v1 无 pending 段，故为 []）；"
    + "parsedAt 归一化成固定值以免每次导出都 diff");
} finally {
  await cleanup();
}

/** 清场：只删本次建的行，删完自查确实删干净了（留残行会污染下一次导出与别的用例）。 */
async function cleanup(): Promise<void> {
  let leftover = 0;
  if (workspaceId.value !== "") {
    for (const table of ["account_name_parses", "naming_rules", "accounts", "workspace_memberships", "users"]) {
      await pool.query(`DELETE FROM ${table} WHERE workspace_id=$1`, [workspaceId.value]);
    }
    await pool.query("DELETE FROM workspaces WHERE id=$1", [workspaceId.value]);
    // 只删本次建的身份：按前缀批量删会连累别的用例的行。
    if (identityId.value !== "") await pool.query("DELETE FROM auth_identities WHERE id=$1", [identityId.value]);
    leftover = Number((await pool.query(
      "SELECT count(*)::int AS n FROM workspaces WHERE id=$1", [workspaceId.value])).rows[0].n);
  }
  await pool.end();
  // finally 块里直接 throw 会吞掉原始异常，所以清场放在独立函数里抛。
  if (leftover !== 0) throw new Error("fixture export left synthetic rows behind");
}
