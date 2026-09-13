import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { AccountLabelHistoryRepository } from "../src/account-label-history-repository.js";
import { runMigrations } from "../src/migrate.js";
import { withSemanticReadSnapshot } from "../src/semantic-read-snapshot.js";

/**
 * v1.9.49 ①（Q-044 ③）：按窗口取归属历史的候选行。真库灌「改名前后两行 + 一条人工覆盖」。
 * Synthetic fixtures, dedicated local test database only.
 */
describe("v1.9.49 account label history / real PG", () => {
  const workspaceId = randomUUID(), otherWorkspace = randomUUID();
  const owner = (value: string) => ({ owner: { key: "owner", value, mapsTo: "optimizer", taskIds: [] } });
  const tuple = (accountId: string) => ({ media: "KUAISHOU", accountId });
  let pool: Pool;
  const load = (input: Record<string, unknown>) =>
    withSemanticReadSnapshot(pool, (connection) => new AccountLabelHistoryRepository(connection).load({ workspaceId, ...input }));
  const summary = (rows: Awaited<ReturnType<typeof load>>) => rows.map((row) =>
    [row.accountId, row.effectiveFrom, row.parse.segments.owner?.value ?? null, row.parse.override, row.parse.nameMatches]);

  beforeAll(async () => {
    const databaseUrl = process.env.TEST_DATABASE_URL;
    if (!databaseUrl) throw new Error("Explicit isolated TEST_DATABASE_URL required");
    const url = new URL(databaseUrl);
    if (!["127.0.0.1", "localhost"].includes(url.hostname) || url.port !== "55432" || !/^\/ka_[a-z0-9_]+_test$/.test(url.pathname)) {
      throw new Error("Dedicated local be test database required");
    }
    await runMigrations({ databaseUrl });
    pool = new Pool({ connectionString: databaseUrl, max: 3 });
    for (const ws of [workspaceId, otherWorkspace]) {
      await pool.query("INSERT INTO workspaces(id,name) VALUES($1,'synthetic label history')", [ws]);
      for (const version of [1, 2]) {
        await pool.query("INSERT INTO naming_rules(workspace_id,media,version,segments,effective_from) VALUES($1,'KUAISHOU',$2,$3,'2026-08-01')",
          [ws, version, JSON.stringify([{ key: "owner", mapsTo: version === 1 ? "optimizer" : "goal" }])]);
      }
      const accounts: [string, string][] = [["renamed", "DAU-李四"], ["manual", "DAU-王五"], ["late", "DAU-赵六"], ["stale", "DAU-改过没重解析"]];
      for (const [accountId, name] of accounts) {
        await pool.query("INSERT INTO accounts(workspace_id,media,account_id,account_name) VALUES($1,'KUAISHOU',$2,$3)", [ws, accountId, name]);
      }
      const parses: [string, string, string, number, string, unknown, unknown][] = [
        // 改名前后两行：9-10 起昵称从张三改成李四，重解析写了新行，旧行留着。
        ["renamed", "2026-09-01", "DAU-张三", 1, "parsed", owner(ws === workspaceId ? "张三" : "别的空间"), null],
        ["renamed", "2026-09-10", "DAU-李四", 2, "parsed", owner("李四"), null],
        // 一条人工覆盖。
        ["manual", "2026-09-05", "DAU-王五", 1, "overridden", owner("解析值"), { owner: "人工王五" }],
        // 第一行在窗口之后。
        ["late", "2026-09-20", "DAU-赵六", 1, "parsed", owner("赵六"), null],
        // 最新一行的昵称和账户表对不上（改名后还没重解析），它之前那行是被接替的旧行。
        ["stale", "2026-08-01", "DAU-更早", 1, "parsed", owner("更早"), null],
        ["stale", "2026-08-20", "DAU-上一个名字", 1, "parsed", owner("上一个"), null],
      ];
      for (const [accountId, from, name, version, status, segments, override] of parses) {
        await pool.query(`INSERT INTO account_name_parses(workspace_id,media,account_id,effective_from,account_name,rule_version,status,segments,override)
          VALUES($1,'KUAISHOU',$2,$3,$4,$5,$6,$7::jsonb,$8::jsonb)`,
        [ws, accountId, from, name, version, status, JSON.stringify(segments), override === null ? null : JSON.stringify(override)]);
      }
    }
  }, 60_000);

  afterAll(async () => {
    if (!pool) return;
    for (const table of ["account_name_parses", "naming_rules", "accounts", "workspaces"]) {
      await pool.query(`DELETE FROM ${table} WHERE ${table === "workspaces" ? "id" : "workspace_id"}=ANY($1::uuid[])`, [[workspaceId, otherWorkspace]]);
    }
    await pool.end();
  });

  it("returns the row in effect at the window start plus every row that takes over inside it", async () => {
    const rows = await load({ accounts: [tuple("renamed"), tuple("manual"), tuple("late")], from: "2026-09-03", to: "2026-09-12" });
    expect(summary(rows)).toEqual([
      // late：窗口前一行都没有、第一行在窗口之后——仍要带回来，调用方才能「用最早一行并点名」。
      ["late", "2026-09-20", "赵六", null, true],
      ["manual", "2026-09-05", "解析值", { owner: "人工王五" }, true],
      // 改名前那行在它自己那段日子里是可信的：不能拿今天的昵称「李四」去判它过期。
      ["renamed", "2026-09-01", "张三", null, true],
      ["renamed", "2026-09-10", "李四", null, true],
    ]);
  });

  it("drops history that no business day in the window can use", async () => {
    const rows = await load({ accounts: [tuple("renamed")], from: "2026-09-12", to: "2026-09-15" });
    expect(summary(rows)).toEqual([["renamed", "2026-09-10", "李四", null, true]]);
  });

  it("interprets each row by the rule version it was parsed with", async () => {
    const rows = await load({ accounts: [tuple("renamed")], from: "2026-09-01", to: "2026-09-30" });
    // 旧行挂 v1（owner→optimizer）、新行挂 v2（owner→goal）：拿最新规则解释旧行，归属会凭空变。
    expect(rows.map((row) => [row.effectiveFrom, row.parse.ruleVersion, row.mappings])).toEqual([
      ["2026-09-01", 1, [{ key: "owner", mapsTo: "optimizer", pending: false }]],
      ["2026-09-10", 2, [{ key: "owner", mapsTo: "goal", pending: false }]],
    ]);
  });

  it("distrusts only the newest row when the nickname has moved on since it was parsed", async () => {
    const rows = await load({ accounts: [tuple("stale")], from: "2026-08-10", to: "2026-08-25" });
    expect(summary(rows)).toEqual([
      ["stale", "2026-08-01", "更早", null, true],
      ["stale", "2026-08-20", "上一个", null, false],
    ]);
  });

  it("stays inside the workspace and never fabricates rows for unknown accounts", async () => {
    const rows = await load({ accounts: [tuple("renamed"), tuple("missing")], from: "2026-09-01", to: "2026-09-02" });
    expect(summary(rows)).toEqual([["renamed", "2026-09-01", "张三", null, true]]);
    const other = await withSemanticReadSnapshot(pool, (connection) => new AccountLabelHistoryRepository(connection)
      .load({ workspaceId: otherWorkspace, accounts: [tuple("renamed")], from: "2026-09-01", to: "2026-09-02" }));
    expect(other.map((row) => row.parse.segments.owner?.value)).toEqual(["别的空间"]);
    expect(await load({ accounts: [], from: "2026-09-01", to: "2026-09-02" })).toEqual([]);
  });

  it.each([
    { accounts: [tuple("renamed")], from: "2026-09-05", to: "2026-09-01" },
    { accounts: [tuple("renamed")], from: "2026-02-30", to: "2026-03-01" },
    { accounts: [tuple("renamed"), tuple("renamed")], from: "2026-09-01", to: "2026-09-02" },
    { accounts: [tuple("renamed")], from: "2026-09-01", to: "2026-09-02", media: "TENCENT" },
  ])("rejects a malformed request before querying %#", async (input) => {
    await expect(load(input)).rejects.toMatchObject({ code: "INVALID_REQUEST" });
  });

  it("fails closed on an out-of-order source instead of re-sorting it", async () => {
    const reader = new AccountLabelHistoryRepository({ query: async () => ({ rows: [
      { workspace_id: workspaceId, media: "KUAISHOU", account_id: "renamed", parse_account_id: "renamed", effective_from: "2026-09-10",
        rule_version: 1, parsed_at: null, name_matches: true, matched_version: null, invalid: false, oversized: false,
        status: "parsed", segments: {}, override: null, conflicts: null, mappings: null },
      { workspace_id: workspaceId, media: "KUAISHOU", account_id: "renamed", parse_account_id: "renamed", effective_from: "2026-09-01",
        rule_version: 1, parsed_at: null, name_matches: true, matched_version: null, invalid: false, oversized: false,
        status: "parsed", segments: {}, override: null, conflicts: null, mappings: null },
    ] }) } as never);
    await expect(reader.load({ workspaceId, accounts: [tuple("renamed")], from: "2026-09-01", to: "2026-09-30" }))
      .rejects.toMatchObject({ code: "UPSTREAM_INVALID_RESPONSE" });
  });
});
