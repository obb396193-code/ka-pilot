import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { shanghaiTaskBusinessDate } from "@ka/domain";

import { AccountDimensionEvidenceRepository } from "../../src/account-dimension-evidence-repository.js";
import { AccountDimensionRuleRepository } from "../../src/account-dimension-rule-repository.js";
import { runMigrations } from "../../src/migrate.js";
import { businessDateSql, latestParseSql } from "../../src/r014/account-name-parse-history.js";
import { AccountNameParseRepository } from "../../src/r014/account-name-parse-repository.js";
import { withSemanticReadSnapshot } from "../../src/semantic-read-snapshot.js";
import { windowSize } from "../migration-window.js";

/**
 * v1.9.49 ①（Q-044 ③，迁移 031）：`account_name_parses` 按业务日留历史。
 *
 * 原来主键是 (workspace_id, media, account_id)，一个账户只有一行，reparse 就是覆盖——
 * 今天读 9 月的窗口用的是今天的归属，账户改过名，9 月的报表就跟着变，而且看不出来。
 * 这组用例钉住写入规则，以及那些原本默认「一个账户一行」的读路径在有了历史之后仍然只看到一行。
 */
const databaseUrl = process.env.TEST_DATABASE_URL;
if (!databaseUrl) throw new Error("Explicit TEST_DATABASE_URL required");
const target = new URL(databaseUrl);
if (!["127.0.0.1", "localhost"].includes(target.hostname) || target.port !== "55432" || !/^\/ka_[a-z0-9_]+_test$/.test(target.pathname)) {
  throw new Error("Isolated local ka_*_test database required");
}

interface AuthContext {
  workspaceId: string; userId: string; role: "lead"; workspaceKind: "personal";
  scope: { kind: "explicit_accounts"; accounts: { media: string; accountId: string; accessLevel: "execute" }[] };
}

const ACCOUNTS = ["hist-a1", "hist-a2", "hist-a3"] as const;
const SEGMENTS = [
  { key: "channel", label: "渠道", order: 0, source: "enum", values: ["DAU"], required: true, multi: false, mapsTo: null },
  { key: "special", label: "专项", order: 1, source: "enum", values: ["常规"], required: false, multi: true, mapsTo: "special" },
];

describe("v1.9.49 account name parse history (real PostgreSQL)", () => {
  const pool = new Pool({ connectionString: databaseUrl, max: 3 });
  const repository = new AccountNameParseRepository(pool);
  let lead: AuthContext;
  let workspaceId = "";
  let identityId = "";

  const parse = (accountId: string, accountName: string, extra: Record<string, unknown> = {}) =>
    repository.upsertParse(lead, {
      media: "KUAISHOU", accountId, accountName, ruleVersion: 1, status: "parsed",
      // 段要写成解析器真实产出的完整形状：维度证据仓储逐字段校验，缺字段会整条判废。
      segments: { channel: { key: "channel", value: "DAU", mapsTo: null, taskIds: [] } }, taskIds: [], conflicts: [], ...extra,
    });
  const rows = async (accountId: string) => (await pool.query(
    `SELECT effective_from::text AS effective_from, account_name, status, override, confirmed_by
     FROM account_name_parses WHERE workspace_id=$1 AND media='KUAISHOU' AND account_id=$2
     ORDER BY effective_from`, [workspaceId, accountId],
  )).rows as { effective_from: string; account_name: string; status: string; override: unknown; confirmed_by: string | null }[];

  beforeAll(async () => {
    await runMigrations({ databaseUrl });
    workspaceId = (await pool.query(
      "INSERT INTO workspaces(name,kind) VALUES($1,'personal') RETURNING id", [`hist-${randomUUID()}`],
    )).rows[0].id;
    identityId = (await pool.query(
      "INSERT INTO auth_identities(provider,provider_subject,display_name) VALUES('internal_test',$1,'synthetic-history') RETURNING id",
      [`hist-${randomUUID()}`],
    )).rows[0].id;
    const userId = (await pool.query(
      "INSERT INTO users(workspace_id,name,role) VALUES($1,'synthetic-lead','lead') RETURNING id", [workspaceId],
    )).rows[0].id;
    await pool.query(
      "INSERT INTO workspace_memberships(workspace_id,identity_id,user_id,role,is_active) VALUES($1,$2,$3,'lead',true)",
      [workspaceId, identityId, userId],
    );
    lead = {
      workspaceId, userId, role: "lead", workspaceKind: "personal",
      scope: { kind: "explicit_accounts", accounts: ACCOUNTS.map((accountId) => ({ media: "KUAISHOU", accountId, accessLevel: "execute" as const })) },
    };
    for (const accountId of ACCOUNTS) {
      await pool.query("INSERT INTO accounts(workspace_id,media,account_id,account_name) VALUES($1,'KUAISHOU',$2,$2)", [workspaceId, accountId]);
    }
    await repository.putRule(lead, "KUAISHOU", { segments: SEGMENTS, separators: ["-"], effectiveFrom: "2026-08-01" });
  }, 60_000);

  afterAll(async () => {
    try {
      // 降级那条用例若意外成功，这里把 schema 恢复回来，免得污染共用的测试库。
      await runMigrations({ databaseUrl });
      for (const table of ["account_name_parses", "naming_rules", "accounts", "workspace_memberships", "users"]) {
        await pool.query(`DELETE FROM ${table} WHERE workspace_id=$1`, [workspaceId]);
      }
      await pool.query("DELETE FROM workspaces WHERE id=$1", [workspaceId]);
      await pool.query("DELETE FROM auth_identities WHERE id=$1", [identityId]);
    } finally { await pool.end(); }
  }, 60_000);

  it("computes the business day in SQL exactly as the domain does, at the 03:00 cutoff", async () => {
    // 上海 02:59:59 还算前一天，03:00:00 起算当天。午夜切日会把 03:00 前解析的行记到后一天，
    // 同一个账户在「今天」这一格上就会先后读到两行不同的归属。
    for (const instant of ["2026-09-12T18:59:59Z", "2026-09-12T19:00:00Z", "2026-09-12T15:59:59Z", "2026-09-12T16:00:00Z"]) {
      const { rows: [row] } = await pool.query(`SELECT ${businessDateSql("$1::timestamptz")}::text AS d`, [instant]);
      expect({ instant, day: row.d }).toEqual({ instant, day: shanghaiTaskBusinessDate(new Date(instant)) });
    }
    // 迁移 031 是 .cjs、引不了 TS 常量，只能手抄同一个式子——逐字钉住，免得两边各改各的。
    // 回填与列默认值两处都要对上：取 helper 里时刻表达式之后的那一截去比。
    const probe = businessDateSql("now()");
    const shared = probe.slice(probe.indexOf("now()") + "now()".length + 1);
    const migration = readFileSync(new URL("../../migrations/031_account_name_parse_history.cjs", import.meta.url), "utf8");
    const up = migration.slice(0, migration.indexOf("exports.down"));
    expect(up.split(shared)).toHaveLength(3);
  });

  it("keeps an earlier business day as its own row when a later parse arrives", async () => {
    await parse("hist-a1", "DAU-李四", { effectiveFrom: "2026-09-01" });
    await parse("hist-a1", "DAU-张三");
    const history = await rows("hist-a1");
    expect(history.map((row) => row.account_name)).toEqual(["DAU-李四", "DAU-张三"]);
    expect(history[0]!.effective_from).toBe("2026-09-01");
    expect(history[1]!.effective_from).toBe(shanghaiTaskBusinessDate());
  });

  it("updates the same business day in place instead of stacking duplicates", async () => {
    await parse("hist-a1", "DAU-张三", { status: "partial" });
    const history = await rows("hist-a1");
    expect(history).toHaveLength(2);
    expect(history[1]!.status).toBe("partial");
  });

  it("adds no row when a later re-parse is identical to the one in effect", async () => {
    await parse("hist-a2", "DAU-王五", { effectiveFrom: "2026-08-01" });
    const returned = await parse("hist-a2", "DAU-王五", { effectiveFrom: "2026-08-05" });
    // 每重解析一次就多一行一模一样的历史，查询只会越来越慢、信息量为零。
    expect(await rows("hist-a2")).toHaveLength(1);
    expect(returned.accountName).toBe("DAU-王五");
  });

  it("carries a manual override into the next row, together with who made it", async () => {
    await parse("hist-a3", "旧名", { effectiveFrom: "2026-08-01" });
    await repository.patch(lead, "KUAISHOU", "hist-a3", { segments: { special: "常规" } });
    // 改名之后重解析：人工结论不得丢，不然运营改过的归属会在改名那天悄悄消失。
    await parse("hist-a3", "新名", { effectiveFrom: "2026-08-10" });
    const history = await rows("hist-a3");
    expect(history.map((row) => [row.effective_from, row.account_name, row.status])).toEqual([
      ["2026-08-01", "旧名", "overridden"], ["2026-08-10", "新名", "overridden"],
    ]);
    expect(history[1]!.override).toEqual({ special: "常规" });
    expect(history[1]!.confirmed_by).toBe(lead.userId);
  });

  it("adds no row over a human conclusion when the nickname has not changed", async () => {
    const returned = await parse("hist-a3", "新名", { effectiveFrom: "2026-08-20" });
    expect(await rows("hist-a3")).toHaveLength(2);
    // 返回的是那一天真正生效的行，而不是刚才被挡下的那份。
    expect(returned.status).toBe("overridden");
  });

  it("applies a manual edit to the current row only, leaving history as it was", async () => {
    await repository.patch(lead, "KUAISHOU", "hist-a1", { segments: { special: "常规" } });
    const history = await rows("hist-a1");
    expect(history.map((row) => row.status)).toEqual(["parsed", "overridden"]);
    expect(history[0]!.override).toBeNull();
  });

  it("lists each account once on the cleaning page, however much history it has", async () => {
    const listed = await repository.list(lead, {});
    const ids = listed.items.map((item) => item.accountId);
    expect(new Set(ids).size).toBe(ids.length);
    expect(listed.total).toBe(ACCOUNTS.length);
    expect(listed.items.find((item) => item.accountId === "hist-a1")!.accountName).toBe("DAU-张三");
  });

  it("keeps both dimension repositories at one row per account", async () => {
    // 这两个仓储读到「同一账户两行」会整条判废——那是这次改表最可能炸线上的地方。
    const scope = { workspaceId, accounts: ACCOUNTS.map((accountId) => ({ media: "KUAISHOU", accountId })) };
    const evidence = await withSemanticReadSnapshot(pool, (connection) => new AccountDimensionEvidenceRepository(connection).load(scope));
    const rules = await withSemanticReadSnapshot(pool, (connection) => new AccountDimensionRuleRepository(connection).load(scope));
    expect(evidence).toHaveLength(ACCOUNTS.length);
    expect(rules).toHaveLength(ACCOUNTS.length);
  });

  it("refuses expressions and aliases outside the reviewed literal sets, even when types are bypassed", () => {
    expect(() => businessDateSql("clock_timestamp()" as never)).toThrow();
    expect(() => latestParseSql("parse; DROP TABLE accounts" as never)).toThrow();
  });

  it("refuses an impossible business date before it reaches the database", async () => {
    await expect(parse("hist-a2", "DAU-王五", { effectiveFrom: "2026-02-30" })).rejects.toThrow(/invalid_input/);
  });

  it("refuses to downgrade while any account holds attribution history", async () => {
    await expect(runMigrations({ databaseUrl, direction: "down", count: windowSize("031") }))
      .rejects.toThrow(/attribution history/);
    const { rows: [column] } = await pool.query(
      `SELECT count(*)::int AS n FROM information_schema.columns
       WHERE table_name='account_name_parses' AND column_name='effective_from'`);
    expect(column.n).toBe(1);
  }, 60_000);
});
