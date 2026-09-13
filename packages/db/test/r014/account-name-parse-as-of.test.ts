import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { runMigrations } from "../../src/migrate.js";
import { labelBasisCandidateSql } from "../../src/r014/account-name-parse-history.js";
import { AccountNameParseRepository } from "../../src/r014/account-name-parse-repository.js";

/**
 * v1.9.49 ①（Q-044 ③）：日报那两条读路径（`dimensionsFor` / `bizFor`）按报表日期取归属。
 * 不给 `asOf` 仍是当前态——账户列表靠它。
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

const RULE = [
  { key: "owner", label: "优化师", order: 0, source: "enum", values: ["张三", "李四"], required: true, multi: false, mapsTo: "optimizer" },
  { key: "biz", label: "业务", order: 1, source: "enum", values: ["通投", "拉新"], required: false, multi: false, mapsTo: "biz" },
];
const segments = (owner: string, biz: string) => ({
  owner: { key: "owner", value: owner, mapsTo: "optimizer", taskIds: [] },
  biz: { key: "biz", value: biz, mapsTo: "biz", taskIds: [] },
});

describe("v1.9.49 daily report attribution as of the report date (real PostgreSQL)", () => {
  const pool = new Pool({ connectionString: databaseUrl, max: 3 });
  const repository = new AccountNameParseRepository(pool);
  let lead: AuthContext;
  let workspaceId = "";
  let identityId = "";
  const tuples = [{ media: "KUAISHOU", accountId: "asof-renamed" }, { media: "KUAISHOU", accountId: "asof-late" }];

  beforeAll(async () => {
    await runMigrations({ databaseUrl });
    workspaceId = (await pool.query("INSERT INTO workspaces(name,kind) VALUES($1,'personal') RETURNING id", [`asof-${randomUUID()}`])).rows[0].id;
    identityId = (await pool.query(
      "INSERT INTO auth_identities(provider,provider_subject,display_name) VALUES('internal_test',$1,'synthetic-asof') RETURNING id",
      [`asof-${randomUUID()}`],
    )).rows[0].id;
    const userId = (await pool.query("INSERT INTO users(workspace_id,name,role) VALUES($1,'synthetic-lead','lead') RETURNING id", [workspaceId])).rows[0].id;
    await pool.query("INSERT INTO workspace_memberships(workspace_id,identity_id,user_id,role,is_active) VALUES($1,$2,$3,'lead',true)",
      [workspaceId, identityId, userId]);
    lead = { workspaceId, userId, role: "lead", workspaceKind: "personal",
      scope: { kind: "explicit_accounts", accounts: tuples.map((tuple) => ({ ...tuple, accessLevel: "execute" as const })) } };
    for (const { accountId } of tuples) {
      await pool.query("INSERT INTO accounts(workspace_id,media,account_id,account_name) VALUES($1,'KUAISHOU',$2,$2)", [workspaceId, accountId]);
    }
    await repository.putRule(lead, "KUAISHOU", { segments: RULE, separators: ["-"], effectiveFrom: "2026-08-01" });
    for (const [accountId, from, name, owner, biz] of [
      // 改名前后两行：9-10 起从「张三-通投」改成「李四-拉新」。
      ["asof-renamed", "2026-09-01", "张三-通投", "张三", "通投"],
      ["asof-renamed", "2026-09-10", "李四-拉新", "李四", "拉新"],
      // 第一行在 9-20。
      ["asof-late", "2026-09-20", "李四-通投", "李四", "通投"],
    ] as const) {
      await pool.query(`INSERT INTO account_name_parses(workspace_id,media,account_id,effective_from,account_name,rule_version,status,segments)
        VALUES($1,'KUAISHOU',$2,$3,$4,1,'parsed',$5::jsonb)`, [workspaceId, accountId, from, name, JSON.stringify(segments(owner, biz))]);
    }
  }, 60_000);

  afterAll(async () => {
    try {
      for (const table of ["account_name_parses", "naming_rules", "accounts", "workspace_memberships", "users"]) {
        await pool.query(`DELETE FROM ${table} WHERE workspace_id=$1`, [workspaceId]);
      }
      await pool.query("DELETE FROM workspaces WHERE id=$1", [workspaceId]);
      await pool.query("DELETE FROM auth_identities WHERE id=$1", [identityId]);
    } finally { await pool.end(); }
  });

  const owners = async (asOf?: string) => {
    const dimensions = await repository.dimensionsFor(lead, tuples, asOf === undefined ? {} : { asOf });
    return Object.fromEntries(tuples.map(({ media, accountId }) => [accountId, dimensions.get(`${media}:${accountId}`)?.optimizer.value ?? null]));
  };

  it("reads the owner in effect on the report date, switching on the rename day itself", async () => {
    expect(await owners("2026-09-09")).toMatchObject({ "asof-renamed": "张三" });
    expect(await owners("2026-09-10")).toMatchObject({ "asof-renamed": "李四" });
    expect(Object.fromEntries(await repository.bizFor(lead, tuples, { asOf: "2026-09-09" }))).toMatchObject({ "KUAISHOU:asof-renamed": "通投" });
    expect(Object.fromEntries(await repository.bizFor(lead, tuples, { asOf: "2026-09-10" }))).toMatchObject({ "KUAISHOU:asof-renamed": "拉新" });
  });

  it("falls back to the earliest row before any history instead of dropping the account", async () => {
    expect(await owners("2026-09-05")).toEqual({ "asof-renamed": "张三", "asof-late": "李四" });
  });

  it("keeps the current state when no date is given", async () => {
    expect(await owners()).toEqual({ "asof-renamed": "李四", "asof-late": "李四" });
    expect(Object.fromEntries(await repository.bizFor(lead, tuples))).toEqual({ "KUAISHOU:asof-renamed": "拉新", "KUAISHOU:asof-late": "通投" });
  });

  it("rejects an impossible report date and a non-placeholder date expression", async () => {
    await expect(repository.dimensionsFor(lead, tuples, { asOf: "2026-02-30" })).rejects.toThrow(/invalid_input/);
    await expect(repository.bizFor(lead, tuples, { asOf: "2026-9-1" })).rejects.toThrow(/invalid_input/);
    expect(() => labelBasisCandidateSql("parse", "'2026-09-01'")).toThrow();
  });
});
