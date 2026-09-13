import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { runMigrations, SemanticQueryRepository } from "@ka/db";
import { PlatformDataSource, createPlatformReadSnapshot } from "../src/data/platform-data-source.js";
import { createPlatformDimensionQuery } from "../src/data/platform-dimension-query.js";
import { createPlatformWindowQuery } from "../src/data/platform-window-query.js";
import { createDataQueryRegistry } from "../src/data/query-registry.js";

/**
 * v1.9.42（Q-041 ⑪）：`account.dimension` 按**任意清洗段**分组（概览分布卡要）。
 * 打真库、走真 `PlatformDataSource`，不是单元桩——⑦ 那次就是单元桩全绿而真库全红。
 */
describe("v1.9.42 dimension grouped by an arbitrary cleaning segment / real PG", () => {
  let pool: Pool;
  const workspaceId = randomUUID();
  const accounts = ["seg-a", "seg-b", "seg-c"].map((accountId) => ({ media: "KUAISHOU", accountId }));
  const window = { dateFrom: "2026-09-01", dateTo: "2026-09-02" };
  const registry = createDataQueryRegistry();

  const run = (dimensionType: string) => new PlatformDataSource(
    new SemanticQueryRepository(pool), createPlatformReadSnapshot(pool),
    createPlatformWindowQuery(pool), createPlatformDimensionQuery(pool),
  ).query(registry.resolve("account.dimension", { ...window, dimensionType }, "platform"), {
    workspaceId, userId: randomUUID(), scopeKind: "explicit_accounts",
    accounts: accounts.map((account) => ({ ...account, accessLevel: "execute" as const })),
  });

  beforeAll(async () => {
    const databaseUrl = process.env.TEST_DATABASE_URL;
    if (!databaseUrl) throw new Error("Explicit isolated TEST_DATABASE_URL required");
    await runMigrations({ databaseUrl });
    pool = new Pool({ connectionString: databaseUrl, max: 3 });
    await pool.query("INSERT INTO workspaces(id,name) VALUES($1,'synthetic segment dimension')", [workspaceId]);
    await pool.query("INSERT INTO tasks(workspace_id,task_id,task_name,biz_name) VALUES($1,'t','任务','业务')", [workspaceId]);
    await pool.query(
      "INSERT INTO assessment_price_history(workspace_id,task_id,price,effective_date) VALUES($1,'t',20,'2026-09-01')", [workspaceId]);
    await pool.query(
      `INSERT INTO naming_rules(workspace_id,media,version,segments,effective_from)
       VALUES($1,'KUAISHOU',1,$2::jsonb,'2026-08-01')`,
      [workspaceId, JSON.stringify([{ key: "city", mapsTo: null, pending: false },
        { key: "optimizer", mapsTo: "optimizer", pending: false }])]);
    // seg-a / seg-b 同城，seg-c 另一城且**城市段是人工覆盖**；三户都有两天数据。
    const seeds = [
      { accountId: "seg-a", name: "启航-杭州-张三", city: "杭州", optimizer: "张三", override: null },
      { accountId: "seg-b", name: "启航-杭州-李四", city: "杭州", optimizer: "李四", override: null },
      { accountId: "seg-c", name: "启航-北京-王五", city: "上海", optimizer: "王五", override: "北京" },
    ];
    for (const seed of seeds) {
      await pool.query("INSERT INTO accounts(workspace_id,media,account_id,account_name) VALUES($1,'KUAISHOU',$2,$3)",
        [workspaceId, seed.accountId, seed.name]);
      await pool.query(
        `INSERT INTO task_accounts(workspace_id,media,account_id,task_id,valid_from)
         VALUES($1,'KUAISHOU',$2,'t','2026-08-01')`, [workspaceId, seed.accountId]);
      await pool.query(
        `INSERT INTO account_name_parses(workspace_id,media,account_id,account_name,rule_version,status,segments,override)
         VALUES($1,'KUAISHOU',$2,$3,1,'parsed',$4::jsonb,$5::jsonb)`,
        [workspaceId, seed.accountId, seed.name,
          JSON.stringify({ city: { key: "city", value: seed.city, mapsTo: null, taskIds: [] },
            optimizer: { key: "optimizer", value: seed.optimizer, mapsTo: "optimizer", taskIds: [] } }),
          JSON.stringify(seed.override === null ? {} : { city: seed.override })]);
      for (const ds of ["2026-09-01", "2026-09-02"]) {
        await pool.query(
          `INSERT INTO account_metrics_daily(workspace_id,media,account_id,ds,cost,cash_cost,real_conversion,conversion,exposure,click,computed_at)
           VALUES($1,'KUAISHOU',$2,$3,40,30,2,4,1000,50,'2026-09-05T10:00:00Z')`,
          [workspaceId, seed.accountId, ds]);
      }
    }
  }, 60_000);

  afterAll(async () => {
    if (!pool) return;
    for (const table of ["account_metrics_daily", "account_name_parses", "naming_rules",
      "assessment_price_history", "task_accounts", "accounts", "tasks"]) {
      await pool.query(`DELETE FROM ${table} WHERE workspace_id=$1`, [workspaceId]);
    }
    await pool.query("DELETE FROM workspaces WHERE id=$1", [workspaceId]);
    await pool.end();
  });

  it("groups accounts by the segment value and keeps the dimension it was asked for", async () => {
    const result = await run("segment:city");
    expect(result.dimension).toBe("segment:city");
    // 人工覆盖优先：seg-c 昵称里写的是「上海」，运营手工改成「北京」，分组要认改后的。
    expect(result.rows).toMatchObject([
      { key: "北京", metrics: { cashCost: { value: 60 } } },
      { key: "杭州", metrics: { cashCost: { value: 120 } } },
    ]);
  });

  it("says where each value came from, so a manual fix is distinguishable from a parse", async () => {
    const rows = (await run("segment:city")).rows;
    expect(rows.find((row) => row.key === "北京")).toMatchObject({ source: "manual", sources: { manual: 1 } });
    expect(rows.find((row) => row.key === "杭州")).toMatchObject({ source: "nickname", sources: { nickname: 2 } });
  });

  it("puts accounts with no such segment in the unlabelled bucket instead of dropping them", async () => {
    const result = await run("segment:absent");
    // 三户都没有这一段：全部归 key=null 的「未标注」桶，钱不会凭空消失。
    expect(result.rows).toMatchObject([{ key: null, label: "未标注", metrics: { cashCost: { value: 180 } } }]);
    expect(result.rows).toHaveLength(1);
  });

  it("keeps the named dimensions working exactly as before", async () => {
    const result = await run("optimizer");
    expect(result.dimension).toBe("optimizer");
    expect(result.rows.map((row) => row.key)).toEqual(["张三", "李四", "王五"].sort());
    expect(result.rows).toHaveLength(3);
  });

  it("still refuses a dimension nothing resolves, and names what is usable", async () => {
    expect(() => registry.resolve("account.dimension", { ...window, dimensionType: "agent_type" }, "platform"))
      .toThrowError(expect.objectContaining({ code: "DIMENSION_UNSUPPORTED",
        details: { supported: ["account", "task", "biz", "optimizer", "goal", "placement", "segment:<key>"] } }));
  });
});

/**
 * v1.9.42（Q-041 ⑨）：血缘里的 `timezone` 来自受控配置。
 * 没配就照旧发 null 并把 metadataAvailability 如实降级——「不知道」比编一个准确。
 */
describe("v1.9.42 source timezone comes from configuration / real PG", () => {
  let pool: Pool;
  const workspaceId = randomUUID();
  const accounts = [{ media: "KUAISHOU", accountId: "tz-a" }];
  const registry = createDataQueryRegistry();

  const run = (timezone: string | null) => new PlatformDataSource(
    new SemanticQueryRepository(pool), createPlatformReadSnapshot(pool),
    createPlatformWindowQuery(pool), createPlatformDimensionQuery(pool), undefined, timezone,
  ).query(registry.resolve("account.summary", { dateFrom: "2026-09-01", dateTo: "2026-09-02" }, "platform"), {
    workspaceId, userId: randomUUID(), scopeKind: "explicit_accounts",
    accounts: accounts.map((account) => ({ ...account, accessLevel: "execute" as const })),
  });

  beforeAll(async () => {
    const databaseUrl = process.env.TEST_DATABASE_URL;
    if (!databaseUrl) throw new Error("Explicit isolated TEST_DATABASE_URL required");
    await runMigrations({ databaseUrl });
    pool = new Pool({ connectionString: databaseUrl, max: 3 });
    await pool.query("INSERT INTO workspaces(id,name) VALUES($1,'synthetic timezone')", [workspaceId]);
    await pool.query("INSERT INTO accounts(workspace_id,media,account_id) VALUES($1,'KUAISHOU','tz-a')", [workspaceId]);
    await pool.query(
      `INSERT INTO account_metrics_daily(workspace_id,media,account_id,ds,cost,cash_cost,real_conversion,conversion,exposure,click,computed_at)
       VALUES($1,'KUAISHOU','tz-a','2026-09-01',40,30,2,4,1000,50,'2026-09-05T10:00:00Z'),
             ($1,'KUAISHOU','tz-a','2026-09-02',40,30,2,4,1000,50,'2026-09-05T10:00:00Z')`, [workspaceId]);
  }, 60_000);

  afterAll(async () => {
    if (!pool) return;
    for (const table of ["account_metrics_daily", "accounts"]) {
      await pool.query(`DELETE FROM ${table} WHERE workspace_id=$1`, [workspaceId]);
    }
    await pool.query("DELETE FROM workspaces WHERE id=$1", [workspaceId]);
    await pool.end();
  });

  it("publishes the configured zone", async () => {
    expect((await run("Asia/Shanghai")).lineage).toMatchObject({ timezone: "Asia/Shanghai" });
  });

  it("says it does not know when nothing is configured, rather than guessing the server's", async () => {
    expect((await run(null)).lineage).toMatchObject({ timezone: null });
  });

  it("keeps metadataAvailability honest either way", async () => {
    // 知道时区不等于血缘齐备：datasetVersion 与 dayCut 仍然没有来源，所以只能是 partial。
    expect((await run("Asia/Shanghai")).lineage.metadataAvailability).toBe("partial");
    expect((await run(null)).lineage.metadataAvailability).toBe("partial");
  });
});
