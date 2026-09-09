import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { runMigrations } from "../../src/migrate.js";
import { AccountNameParseRepository } from "../../src/r014/account-name-parse-repository.js";

// Synthetic data only. Execute on the explicitly selected isolated test database (ka_be2_r014_test).
const databaseUrl = process.env.TEST_DATABASE_URL ?? "postgres://ka:ka@127.0.0.1:55432/ka_be2_r014_test";

interface AuthContext {
  workspaceId: string; userId: string; role: "lead" | "optimizer"; workspaceKind: "personal";
  // v1.9.9：成员级归属操作按会话 scope 收口，所以 scope 里要放真 tuple。
  scope: { kind: "explicit_accounts"; accounts: { media: string; accountId: string; accessLevel: "execute" }[] };
}

const SEGMENTS = [
  { key: "channel", label: "渠道", order: 0, source: "enum", values: ["DAU"], required: true, multi: false, mapsTo: null },
  { key: "special", label: "专项", order: 1, source: "enum", values: ["常规"], required: false, multi: true, mapsTo: "special" },
];

describe("R-017 account name parse repository (real PostgreSQL)", () => {
  const pool = new Pool({ connectionString: databaseUrl });
  const repository = new AccountNameParseRepository(pool);
  let lead: AuthContext;
  let optimizer: AuthContext;
  let workspaceId = "";

  const rule = (extra: Record<string, unknown> = {}) => ({
    segments: SEGMENTS, separators: ["-"], effectiveFrom: "2026-09-01", ...extra,
  });

  beforeAll(async () => {
    await runMigrations({ databaseUrl });
    workspaceId = (await pool.query(
      "INSERT INTO workspaces(name,kind) VALUES($1,'personal') RETURNING id", [`r017-${randomUUID()}`],
    )).rows[0].id;
    const contexts: AuthContext[] = [];
    for (const role of ["lead", "optimizer"] as const) {
      const identityId = (await pool.query(
        "INSERT INTO auth_identities(provider,provider_subject,display_name) VALUES('internal_test',$1,'synthetic') RETURNING id",
        [`r017-${randomUUID()}`],
      )).rows[0].id;
      const userId = (await pool.query(
        "INSERT INTO users(workspace_id,name,role) VALUES($1,$2,$3) RETURNING id", [workspaceId, `synthetic-${role}`, role],
      )).rows[0].id;
      await pool.query(
        "INSERT INTO workspace_memberships(workspace_id,identity_id,user_id,role,is_active) VALUES($1,$2,$3,$4,true)",
        [workspaceId, identityId, userId, role],
      );
      contexts.push({
        workspaceId, userId, role, workspaceKind: "personal",
        scope: {
          kind: "explicit_accounts",
          accounts: ["r017-a1", "r017-a2", "r017-a3"].map((accountId) => ({
            media: "KUAISHOU", accountId, accessLevel: "execute" as const,
          })),
        },
      });
    }
    [lead, optimizer] = contexts as [AuthContext, AuthContext];
    for (const [accountId, name] of [["r017-a1", "DAU-常规"], ["r017-a2", "DAU-年轻人"], ["r017-a3", "乱起的"]] as const) {
      await pool.query(
        "INSERT INTO accounts(workspace_id,media,account_id,account_name) VALUES($1,'KUAISHOU',$2,$3)",
        [workspaceId, accountId, name],
      );
    }
  });

  afterAll(async () => {
    for (const table of ["account_name_parses", "naming_rules", "accounts", "workspace_memberships", "users"]) {
      await pool.query(`DELETE FROM ${table} WHERE workspace_id=$1`, [workspaceId]);
    }
    await pool.query("DELETE FROM workspaces WHERE id=$1", [workspaceId]);
    await pool.query("DELETE FROM auth_identities WHERE display_name='synthetic' AND provider_subject LIKE 'r017-%'");
    await pool.end();
  });

  it("returns null before any rule is configured, instead of inventing a default spec", async () => {
    expect(await repository.currentRule(lead, "KUAISHOU")).toBeNull();
  });

  it("always writes a new version and never edits an old one", async () => {
    const first = await repository.putRule(lead, "KUAISHOU", rule({ note: "第一版" }));
    expect(first.version).toBe(1);
    const second = await repository.putRule(lead, "KUAISHOU", rule({ note: "第二版" }));
    expect(second.version).toBe(2);
    // 已确认的账户挂在旧版本号上，改旧版等于偷偷改写历史结论。
    expect((await pool.query(
      "SELECT note FROM naming_rules WHERE workspace_id=$1 AND media='KUAISHOU' AND version=1", [workspaceId],
    )).rows[0].note).toBe("第一版");
    expect((await repository.currentRule(lead, "KUAISHOU"))!.version).toBe(2);
    // 每个渠道各有各的版本序列。
    expect((await repository.putRule(lead, "TENCENT", rule())).version).toBe(1);
  });

  it("refuses a rule write from an optimizer and refuses a malformed spec", async () => {
    await expect(repository.putRule(optimizer, "KUAISHOU", rule())).rejects.toThrow(/forbidden/);
    await expect(repository.putRule(lead, "KUAISHOU", rule({
      segments: [...SEGMENTS, { ...SEGMENTS[1], key: "second", order: 2 }],
    }))).rejects.toThrow(/invalid_input/);
    await expect(repository.putRule(lead, "KUAISHOU", rule({ effectiveFrom: "2026/09/01" }))).rejects.toThrow(/invalid_input/);
  });

  it("stores a parse and lists it on the cleaning page", async () => {
    await repository.upsertParse(lead, {
      media: "KUAISHOU", accountId: "r017-a1", accountName: "DAU-常规", ruleVersion: 2,
      status: "parsed", segments: { channel: { value: "DAU" } }, taskIds: ["123"], conflicts: [],
    });
    await repository.upsertParse(lead, {
      media: "KUAISHOU", accountId: "r017-a2", accountName: "DAU-年轻人", ruleVersion: 2,
      status: "conflict", segments: { channel: { value: "DAU" } }, taskIds: [],
      conflicts: [{ field: "special", fromNickname: "年轻人", fromPlatform: "常规", source: "platform" }],
    });
    const all = await repository.list(lead, {});
    expect(all.total).toBe(2);
    const conflicts = await repository.list(lead, { status: "conflict" });
    expect(conflicts.items.map((item) => item.accountId)).toEqual(["r017-a2"]);
    expect(conflicts.items[0]!.conflicts).toEqual([
      { field: "special", fromNickname: "年轻人", fromPlatform: "常规", source: "platform" },
    ]);
    expect((await repository.list(lead, { q: "a1" })).items.map((item) => item.accountId)).toEqual(["r017-a1"]);
  });

  it("makes a manual override win and keeps re-parsing from touching it", async () => {
    const overridden = await repository.patch(lead, "KUAISHOU", "r017-a2", { segments: { special: "常规" } });
    expect(overridden.status).toBe("overridden");
    expect(overridden.override).toEqual({ special: "常规" });
    // 重解析想把它改回 conflict —— 必须被挡住，原样返回人工结论。
    const reparsed = await repository.upsertParse(lead, {
      media: "KUAISHOU", accountId: "r017-a2", accountName: "DAU-年轻人", ruleVersion: 2,
      status: "conflict", segments: { channel: { value: "DAU" } }, taskIds: [], conflicts: [],
    });
    expect(reparsed.status).toBe("overridden");
    expect(reparsed.override).toEqual({ special: "常规" });
  });

  it("leaves a confirmed row alone until the nickname itself changes", async () => {
    await repository.patch(lead, "KUAISHOU", "r017-a1", { confirm: true });
    const untouched = await repository.upsertParse(lead, {
      media: "KUAISHOU", accountId: "r017-a1", accountName: "DAU-常规", ruleVersion: 2,
      status: "partial", segments: {}, taskIds: [], conflicts: [],
    });
    expect(untouched.status).toBe("confirmed");
    // 改名了，旧结论就作废，必须重解析。
    const renamed = await repository.upsertParse(lead, {
      media: "KUAISHOU", accountId: "r017-a1", accountName: "DAU-新名字", ruleVersion: 2,
      status: "partial", segments: {}, taskIds: [], conflicts: [],
    });
    expect(renamed).toMatchObject({ status: "partial", accountName: "DAU-新名字" });
  });

  it("batch-confirms only parsed rows and reports what it refused to swallow", async () => {
    await repository.upsertParse(lead, {
      media: "KUAISHOU", accountId: "r017-a3", accountName: "乱起的", ruleVersion: 2,
      status: "failed", segments: {}, taskIds: [], conflicts: [],
    });
    await repository.upsertParse(lead, {
      media: "KUAISHOU", accountId: "r017-a1", accountName: "DAU-新名字", ruleVersion: 2,
      status: "parsed", segments: {}, taskIds: [], conflicts: [],
    });
    const result = await repository.confirmBatch(lead, [
      { media: "KUAISHOU", accountId: "r017-a1" },
      { media: "KUAISHOU", accountId: "r017-a2" },
      { media: "KUAISHOU", accountId: "r017-a3" },
    ]);
    expect(result.confirmed).toBe(1);
    // conflict / failed / overridden 都不许被一键过掉，必须报出来给人看。
    expect(new Set(result.skipped.map((item) => item.status))).toEqual(new Set(["overridden", "failed"]));
    await expect(repository.confirmBatch(lead, [])).rejects.toThrow(/invalid_input/);
  });

  it("skips overridden accounts when collecting re-parse candidates", async () => {
    const candidates = await repository.reparseCandidates(lead, { media: "KUAISHOU" });
    expect(candidates.map((item) => item.accountId)).toEqual(["r017-a1", "r017-a3"]);
    expect(candidates.every((item) => item.status !== "overridden")).toBe(true);
    expect((await repository.reparseCandidates(lead, { accountIds: ["r017-a3"] })).map((item) => item.accountId))
      .toEqual(["r017-a3"]);
  });
});
