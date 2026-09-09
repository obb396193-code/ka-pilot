import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { runMigrations } from "@ka/db";
import { createNamingRoutes } from "../../src/r014/naming-routes.js";
import { findR014Route, registerR014Routes } from "../../src/r014/routes.js";
import { callRoute, type Captured } from "./fake-http.js";

// Synthetic data only. Execute on the explicitly selected isolated test database (ka_be2_r014_test).
const databaseUrl = process.env.TEST_DATABASE_URL ?? "postgres://ka:ka@127.0.0.1:55432/ka_be2_r014_test";

interface AuthContext {
  workspaceId: string; userId: string; role: "lead" | "optimizer"; workspaceKind: "personal";
  scope: { kind: "explicit_accounts"; accounts: never[] };
}

/** 只取够用的枚举——解析器本身不认识任何渠道，规范全从请求/库里来。 */
const SEGMENTS = [
  { key: "channel", label: "渠道", order: 0, source: "enum", values: ["DAU"], required: true, multi: false, mapsTo: null },
  { key: "biz", label: "业务", order: 1, source: "enum", values: ["通投", "CVR有端(1803240580)"], required: true, multi: false, mapsTo: "biz" },
  { key: "special", label: "专项", order: 2, source: "enum", values: ["常规", "年轻人"], required: false, multi: true, mapsTo: "special" },
  { key: "landing", label: "承接", order: 3, source: "regex", pattern: "^\\d+$", required: false, multi: false, mapsTo: "landing" },
];

describe("R-017 naming admin routes (real PostgreSQL)", () => {
  const pool = new Pool({ connectionString: databaseUrl });
  let auth: AuthContext;
  let workspaceId = "";

  const call = (pathname: string, method: string, body?: unknown, search = ""): Promise<Captured> =>
    callRoute(auth, pathname, method, body, search);
  const dataOf = (result: Captured): Record<string, unknown> =>
    (result.body as { data: Record<string, unknown> }).data;

  beforeAll(async () => {
    await runMigrations({ databaseUrl });
    registerR014Routes(createNamingRoutes(pool));
    workspaceId = (await pool.query(
      "INSERT INTO workspaces(name,kind) VALUES($1,'personal') RETURNING id", [`r017h-${randomUUID()}`],
    )).rows[0].id;
    const identityId = (await pool.query(
      "INSERT INTO auth_identities(provider,provider_subject,display_name) VALUES('internal_test',$1,'synthetic') RETURNING id",
      [`r017h-${randomUUID()}`],
    )).rows[0].id;
    const userId = (await pool.query(
      "INSERT INTO users(workspace_id,name,role) VALUES($1,'synthetic','lead') RETURNING id", [workspaceId],
    )).rows[0].id;
    await pool.query(
      "INSERT INTO workspace_memberships(workspace_id,identity_id,user_id,role,is_active) VALUES($1,$2,$3,'lead',true)",
      [workspaceId, identityId, userId],
    );
    for (const [accountId, name] of [
      ["r017h-a1", "DAU-通投-常规-13177"], ["r017h-a2", "DAU-通投-年轻人"], ["r017h-a3", "乱起的名字"],
    ] as const) {
      await pool.query(
        "INSERT INTO accounts(workspace_id,media,account_id,account_name) VALUES($1,'KUAISHOU',$2,$3)",
        [workspaceId, accountId, name],
      );
    }
    auth = { workspaceId, userId, role: "lead", workspaceKind: "personal", scope: { kind: "explicit_accounts", accounts: [] } };
  });

  afterAll(async () => {
    for (const table of ["account_name_parses", "naming_rules", "accounts", "workspace_memberships", "users"]) {
      await pool.query(`DELETE FROM ${table} WHERE workspace_id=$1`, [workspaceId]);
    }
    await pool.query("DELETE FROM workspaces WHERE id=$1", [workspaceId]);
    await pool.query("DELETE FROM auth_identities WHERE display_name='synthetic' AND provider_subject LIKE 'r017h-%'");
    await pool.end();
  });

  it("claims exactly the six admin paths", () => {
    for (const pathname of [
      "/api/v1/admin/naming-rules", "/api/v1/admin/naming-rules/test", "/api/v1/admin/account-names",
      "/api/v1/admin/account-names/confirm", "/api/v1/admin/account-names/reparse",
      "/api/v1/admin/account-names/KUAISHOU/acc-1",
    ]) {
      expect(findR014Route(pathname), pathname).not.toBeNull();
    }
    for (const pathname of ["/api/v1/admin", "/api/v1/accounts", "/api/v1/admin/account-names/KUAISHOU"]) {
      expect(findR014Route(pathname), pathname).toBeNull();
    }
  });

  it("dry-runs a draft rule without writing anything to the database", async () => {
    const before = Number((await pool.query(
      "SELECT count(*)::int AS n FROM naming_rules WHERE workspace_id=$1", [workspaceId],
    )).rows[0].n);
    const result = await call("/api/v1/admin/naming-rules/test", "POST", {
      media: "KUAISHOU",
      segments: SEGMENTS,
      separators: ["-"],
      sample_names: ["DAU-通投-常规-13177", "DAU-通投-年轻人", "乱起的名字"],
    });
    expect(result.status).toBe(200);
    const data = dataOf(result);
    expect(data.counts).toEqual({ parsed: 1, partial: 1, failed: 1 });
    // 命中率按「完全解析」算：partial 不计入，否则改规范时看不出到底改好没有。
    expect(data.hitRate).toEqual({ value: 1 / 3, state: "finite" });
    // 干跑绝不写库——老板要在页面上边调边看。
    expect(Number((await pool.query(
      "SELECT count(*)::int AS n FROM naming_rules WHERE workspace_id=$1", [workspaceId],
    )).rows[0].n)).toBe(before);
  });

  it("refuses to guess when no rule is configured and none was supplied", async () => {
    const result = await call("/api/v1/admin/naming-rules/test", "POST", {
      media: "TENCENT", sample_names: ["DAU-通投"],
    });
    // 硬解出来的段全是错的，宁可 409 也不拿一份默认规范顶上。
    expect(result.status).toBe(409);
  });

  it("stores a rule as a new version and reads it back", async () => {
    const put = await call("/api/v1/admin/naming-rules", "PUT", {
      segments: SEGMENTS, separators: ["-"], effective_from: "2026-09-01", note: "第一版",
    }, "?media=KUAISHOU");
    expect(put.status).toBe(200);
    expect(dataOf(put).version).toBe(1);
    expect(dataOf(await call("/api/v1/admin/naming-rules", "GET", undefined, "?media=KUAISHOU")).version).toBe(1);
    // 没配过的渠道回 null，不编一份默认规范。
    expect(dataOf(await call("/api/v1/admin/naming-rules", "GET", undefined, "?media=TENCENT"))).toBeNull();
    expect((await call("/api/v1/admin/naming-rules", "GET")).status).toBe(400);
  });

  it("re-parses every account and records the honest per-status tally", async () => {
    const result = await call("/api/v1/admin/account-names/reparse", "POST", { media: "KUAISHOU" });
    expect(result.status).toBe(200);
    expect(dataOf(result)).toMatchObject({ reparsed: 3, skippedNoRule: 0 });
    expect(dataOf(result).byStatus).toEqual({ parsed: 1, partial: 1, failed: 1 });
    const listed = dataOf(await call("/api/v1/admin/account-names", "GET", undefined, "?status=failed"));
    expect((listed.items as { accountId: string }[]).map((item) => item.accountId)).toEqual(["r017h-a3"]);
  });

  it("lets a human override a segment and returns the effective result", async () => {
    const patched = await call("/api/v1/admin/account-names/KUAISHOU/r017h-a3", "PATCH", {
      segments: { biz: "通投" },
    });
    expect(patched.status).toBe(200);
    expect(dataOf(patched)).toMatchObject({ status: "overridden", override: { biz: "通投" } });
    // 人工值叠回解析结果后前端看到的就是最终生效那一份。
    const effective = dataOf(patched).effectiveSegments as Record<string, { value: string; mapsTo: string | null }>;
    expect(effective.biz).toMatchObject({ value: "通投", mapsTo: "biz" });
  });

  it("keeps re-parsing away from an overridden account", async () => {
    const result = await call("/api/v1/admin/account-names/reparse", "POST", { media: "KUAISHOU" });
    // a3 已人工改过，重解析不许碰它，所以只剩两条。
    expect(dataOf(result).reparsed).toBe(2);
    const listed = dataOf(await call("/api/v1/admin/account-names", "GET", undefined, "?status=overridden"));
    expect((listed.items as { accountId: string }[]).map((item) => item.accountId)).toEqual(["r017h-a3"]);
  });

  it("batch-confirms only parsed rows and reports what it refused to swallow", async () => {
    const result = await call("/api/v1/admin/account-names/confirm", "POST", {
      items: [
        { media: "KUAISHOU", accountId: "r017h-a1" },
        { media: "KUAISHOU", accountId: "r017h-a2" },
        { media: "KUAISHOU", accountId: "r017h-a3" },
      ],
    });
    expect(dataOf(result).confirmed).toBe(1);
    // partial / overridden 不许被一键过掉。
    expect(new Set((dataOf(result).skipped as { status: string }[]).map((item) => item.status)))
      .toEqual(new Set(["partial", "overridden"]));
    expect((await call("/api/v1/admin/account-names/confirm", "POST", { items: "nope" })).status).toBe(400);
  });

  it("rejects a malformed dry-run request before touching anything", async () => {
    for (const body of [{}, { media: "KUAISHOU" }, { media: "kuaishou", sample_names: ["x"] },
      { media: "KUAISHOU", sample_names: [] }]) {
      expect((await call("/api/v1/admin/naming-rules/test", "POST", body)).status).toBe(400);
    }
  });

  it("keeps an optimizer out of the whole governance backend, not just the rule writer", async () => {
    const optimizer = { ...auth, role: "optimizer" as const };
    // 六个端点都在 /api/v1/admin/ 下；原来只有 PUT naming-rules 挡了角色，
    // 列表/改单条/确认/重解析四个是敞开的——任何优化师都能读改**全空间**账户昵称，
    // 而账户列表本身是按授权收口的。和 Q-020 同一类：一个入口收口了，旁边的没收。
    for (const [path, method, body] of [
      ["/api/v1/admin/account-names", "GET", undefined],
      ["/api/v1/admin/account-names/confirm", "POST", { items: [{ media: "KUAISHOU", accountId: "n1" }] }],
      ["/api/v1/admin/account-names/reparse", "POST", {}],
      [`/api/v1/admin/account-names/KUAISHOU/n1`, "PATCH", { segments: { biz: "改一下" } }],
    ] as const) {
      const result = await callRoute(optimizer, path, method, body, path.includes("?") ? "" : "?media=KUAISHOU");
      expect(result.status, `${method} ${path}`).toBe(403);
    }
    // 规范本身仍读得到：账户列表取维度要用它（dimensionsFor），那是普通读路径。
    expect((await callRoute(optimizer, "/api/v1/admin/naming-rules", "GET", undefined, "?media=KUAISHOU")).status)
      .toBe(200);
  });
});
