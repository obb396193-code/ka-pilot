import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import { runMigrations } from "@ka/db";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createPlatformDimensionQuery } from "../src/data/platform-dimension-query.js";
import { createPlatformPivotQuery } from "../src/data/platform-pivot-query.js";
import { createPlatformWindowQuery } from "../src/data/platform-window-query.js";

/**
 * v1.9.49 ①（Q-044 ③）：归属按业务日生效，真库端到端。
 * 灌「改名前后两行 + 一条人工覆盖」，跨改名日的窗口断言两段各归各的。
 * Synthetic data only, on the explicitly selected isolated local test database.
 */
const databaseUrl = process.env.TEST_DATABASE_URL;
if (!databaseUrl) throw new Error("Explicit isolated TEST_DATABASE_URL required");
const target = new URL(databaseUrl);
if (!["localhost", "127.0.0.1", "[::1]"].includes(target.hostname) || target.port !== "55432" ||
  !/^\/ka_[a-z0-9_]*_test$/.test(target.pathname)) throw new Error("Dedicated local test database required");

describe("v1.9.49 label history through the real pivot factory", () => {
  const pool = new Pool({ connectionString: databaseUrl, max: 3, connectionTimeoutMillis: 3000 });
  const workspaceId = randomUUID(), userId = randomUUID();
  const window = { from: "2026-09-01", to: "2026-09-03", preset: "custom" };
  const owner = (value: string) => ({ owner: { key: "owner", value, mapsTo: "optimizer", taskIds: [] } });
  const auth = { workspaceId, userId, role: "optimizer", workspaceKind: "personal", scope: { kind: "explicit_accounts", accounts: [
    { media: "KUAISHOU", accountId: "renamed", accessLevel: "read" }, { media: "KUAISHOU", accountId: "manual", accessLevel: "read" }] } };

  beforeAll(async () => {
    await runMigrations({ databaseUrl });
    await pool.query("INSERT INTO workspaces(id,name) VALUES($1,'synthetic label history pivot')", [workspaceId]);
    await pool.query("INSERT INTO tasks(workspace_id,task_id,task_name,biz_name) VALUES($1,'t','synthetic','b')", [workspaceId]);
    await pool.query("INSERT INTO assessment_price_history(workspace_id,task_id,price,effective_date) VALUES($1,'t',20,'2026-08-01')", [workspaceId]);
    await pool.query("INSERT INTO naming_rules(workspace_id,media,version,segments,effective_from) VALUES($1,'KUAISHOU',1,$2,'2026-08-01')",
      [workspaceId, JSON.stringify([{ key: "owner", mapsTo: "optimizer" }])]);
    for (const [accountId, name, cash] of [["renamed", "DAU-李四", [10, 20, 30]], ["manual", "DAU-王五", [100, 100, 100]]] as const) {
      await pool.query("INSERT INTO accounts(workspace_id,media,account_id,account_name) VALUES($1,'KUAISHOU',$2,$3)", [workspaceId, accountId, name]);
      await pool.query("INSERT INTO task_accounts(workspace_id,media,account_id,task_id,valid_from) VALUES($1,'KUAISHOU',$2,'t','2026-09-01')", [workspaceId, accountId]);
      for (const [index, day] of ["2026-09-01", "2026-09-02", "2026-09-03"].entries()) {
        await pool.query(`INSERT INTO account_metrics_daily(workspace_id,media,account_id,ds,cash_cost,real_conversion,computed_at)
          VALUES($1,'KUAISHOU',$2,$3,$4,1,$5)`, [workspaceId, accountId, day, cash[index], `${day}T01:00:00Z`]);
      }
    }
    const parses: [string, string, string, string, unknown, unknown][] = [
      // 改名前后两行：9-03 起昵称从张三改成李四。
      ["renamed", "2026-09-01", "DAU-张三", "parsed", owner("张三"), null],
      ["renamed", "2026-09-03", "DAU-李四", "parsed", owner("李四"), null],
      // 一条人工覆盖，第一行在 9-02：9-01 只能借最早已知的归属。
      ["manual", "2026-09-02", "DAU-王五", "overridden", owner("解析值"), { owner: "人工王五" }],
    ];
    for (const [accountId, from, name, status, segments, override] of parses) {
      await pool.query(`INSERT INTO account_name_parses(workspace_id,media,account_id,effective_from,account_name,rule_version,status,segments,override)
        VALUES($1,'KUAISHOU',$2,$3,$4,1,$5,$6::jsonb,$7::jsonb)`,
      [workspaceId, accountId, from, name, status, JSON.stringify(segments), override === null ? null : JSON.stringify(override)]);
    }
  }, 30000);

  afterAll(async () => {
    try {
      for (const table of ["account_name_parses", "naming_rules", "account_metrics_daily", "assessment_price_history", "task_accounts", "accounts", "tasks"]) {
        await pool.query(`DELETE FROM ${table} WHERE workspace_id=$1`, [workspaceId]);
      }
      await pool.query("DELETE FROM workspaces WHERE id=$1", [workspaceId]);
    } finally { await pool.end(); }
  });

  it("splits the renamed account's spend at the rename day and keeps the manual owner", async () => {
    const result = await createPlatformPivotQuery(pool).query({ auth, window, dimA: "optimizer", dimB: "account" });
    const cells = result.rows.map(row => [row.a.key, row.b.key, row.metrics.cashCost.value])
      .sort((x, y) => JSON.stringify(x) < JSON.stringify(y) ? -1 : 1);
    expect(cells).toEqual([
      // 人工覆盖优先：9-01 借了最早已知的那行，也是人工王五。
      ["人工王五", "KUAISHOU:manual", 300],
      // 改名前（9-01、9-02）归张三，改名当天起归李四。只读最新一行的话，60 块会全记到李四头上。
      ["张三", "KUAISHOU:renamed", 30],
      ["李四", "KUAISHOU:renamed", 30],
    ].sort((x, y) => JSON.stringify(x) < JSON.stringify(y) ? -1 : 1));
    expect(result.labelBasis).toEqual([
      { code: "LABEL_BASIS_EARLIEST_KNOWN", media: "KUAISHOU", accountId: "manual", businessDate: "2026-09-01" },
    ]);
  });

  it("filters the dashboard by the owner in effect on each day", async () => {
    // 看板筛选同一规则：按「张三」筛，只剩改名前那两天（10 + 20）；按「李四」只剩改名当天（30）。
    const summary = createPlatformWindowQuery(pool);
    const accounts = auth.scope.accounts.map(({ media, accountId }) => ({ media, accountId }));
    const before = await summary.summary({ workspaceId, accounts, window, filters: { optimizer: ["张三"] } });
    expect(before.row.metrics.cashCost.value).toBe(30);
    expect(before.lineage).toMatchObject({ requestedAccountDays: 2, requestedDates: ["2026-09-01", "2026-09-02"] });
    expect((await summary.summary({ workspaceId, accounts, window, filters: { optimizer: ["李四"] } })).row.metrics.cashCost.value).toBe(30);
    const manual = await summary.summary({ workspaceId, accounts, window, filters: { optimizer: ["人工王五"] } });
    expect(manual.row.metrics.cashCost.value).toBe(300);
    // namedGaps 里还有这几天的缺数点名（合成数据只灌了现金与转化）；这里只看归属那一类。
    expect(manual.namedGaps.filter(warning => typeof warning !== "string" && warning.code === "LABEL_BASIS_EARLIEST_KNOWN")).toEqual([
      { code: "LABEL_BASIS_EARLIEST_KNOWN", media: "KUAISHOU", accountId: "manual", businessDate: "2026-09-01" },
    ]);
  });

  it("splits the renamed account in the named dimension query too", async () => {
    const accounts = auth.scope.accounts.map(({ media, accountId }) => ({ media, accountId }));
    const result = await createPlatformDimensionQuery(pool).named({ workspaceId, accounts, window, dimensionType: "optimizer" });
    expect(result.rows.map(row => [row.key, row.metrics.cashCost.value, row.source])).toEqual([
      ["人工王五", 300, "manual"], ["张三", 30, "nickname"], ["李四", 30, "nickname"],
    ]);
    expect(result.labelBasis).toEqual([
      { code: "LABEL_BASIS_EARLIEST_KNOWN", media: "KUAISHOU", accountId: "manual", businessDate: "2026-09-01" },
    ]);
  });

  it("uses only the new owner for a window entirely after the rename", async () => {
    const result = await createPlatformPivotQuery(pool)
      .query({ auth, window: { ...window, from: "2026-09-03" }, dimA: "optimizer", dimB: "account" });
    expect(result.rows.find(row => row.b.key === "KUAISHOU:renamed")?.a.key).toBe("李四");
    expect(result.labelBasis).toEqual([]);
  });
});
