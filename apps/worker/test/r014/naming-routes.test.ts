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
  // scope 里要放真 tuple：v1.9.9 之后成员级归属操作按它收口。
  scope: { kind: "explicit_accounts"; accounts: { media: string; accountId: string; accessLevel: "execute" }[] };
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
    // v1.9.9：归属清洗的成员级操作只作用于会话 scope 内的账户，所以会话要带上这三个户。
    auth = {
      workspaceId, userId, role: "lead", workspaceKind: "personal",
      scope: {
        kind: "explicit_accounts",
        accounts: ["r017h-a1", "r017h-a2", "r017h-a3"].map((accountId) => ({
          media: "KUAISHOU", accountId, accessLevel: "execute" as const,
        })),
      },
    };
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
    // 第二条「DAU-通投-年轻人」只少了可选的承接段 → v1.9.26 起算 parsed（可选段没写不是缺）。
    expect(data.counts).toEqual({ parsed: 2, partial: 0, failed: 1 });
    // 命中率按「完全解析」算：partial 不计入，否则改规范时看不出到底改好没有。
    expect(data.hitRate).toEqual({ value: 2 / 3, state: "finite" });
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
    // a2「DAU-通投-年轻人」只少了可选的承接段 → v1.9.26 起算 parsed：
    // partial 的含义是「必填段缺了」，可选段没写不该推到优化师面前让他修一个没坏的东西。
    expect(dataOf(result).byStatus).toEqual({ parsed: 2, failed: 1 });
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
    // a1/a2 都是 parsed（a2 只少可选段），a3 已人工改过。
    expect(dataOf(result).confirmed).toBe(2);
    // 人工改过的不许被一键过掉。partial / failed 同样不许，那两种在仓储层的用例里钉着
    //（packages/db 的 confirmBatch：skipped 含 failed 与 overridden）。
    expect(new Set((dataOf(result).skipped as { status: string }[]).map((item) => item.status)))
      .toEqual(new Set(["overridden"]));
    expect((await call("/api/v1/admin/account-names/confirm", "POST", { items: "nope" })).status).toBe(400);
  });

  it("rejects a malformed dry-run request before touching anything", async () => {
    for (const body of [{}, { media: "KUAISHOU" }, { media: "kuaishou", sample_names: ["x"] },
      { media: "KUAISHOU", sample_names: [] }]) {
      expect((await call("/api/v1/admin/naming-rules/test", "POST", body)).status).toBe(400);
    }
  });

  it("splits the governance backend 按 v1.9.9: two are lead-only, four are member-but-scoped", async () => {
    // 这个优化师**没有任何账户授权**——正好用来验「成员可用但按 scope 收口」。
    const optimizer = {
      ...auth, role: "optimizer" as const,
      scope: { kind: "explicit_accounts" as const, accounts: [] },
    };

    // 改规范、批量重解析是全空间动作 → lead|admin。
    for (const [path, method, body] of [
      ["/api/v1/admin/naming-rules", "PUT", { segments: [], separators: ["-"], effective_from: "2026-09-01" }],
      ["/api/v1/admin/account-names/reparse", "POST", {}],
    ] as const) {
      expect((await callRoute(optimizer, path, method, body, "?media=KUAISHOU")).status,
        `${method} ${path}`).toBe(403);
    }

    // 列表/改单条/确认对成员开放，但**只作用于会话 scope 内的账户**（v1.8「归属可人工改」）。
    const listed = await callRoute(optimizer, "/api/v1/admin/account-names", "GET", undefined, "?media=KUAISHOU");
    expect(listed.status).toBe(200);
    // scope 为空 → 一条都看不到，而不是看到全空间。
    expect(((listed.body as { data: { items: unknown[] } }).data.items)).toEqual([]);

    // 不在授权内的账户改不动，且回 404 不是 403——403 等于确认这个账户存在。
    expect((await callRoute(optimizer, "/api/v1/admin/account-names/KUAISHOU/n1", "PATCH",
      { segments: { biz: "改一下" } })).status).toBe(404);

    // 规范本身仍读得到：账户列表取维度要用它（dimensionsFor），那是普通读路径。
    expect((await callRoute(optimizer, "/api/v1/admin/naming-rules", "GET", undefined, "?media=KUAISHOU")).status)
      .toBe(200);
  });

  it("★Q-039 ②: every cleaning row carries raw, parsed segments and the segments that failed", async () => {
    const listed = await callRoute(auth, "/api/v1/admin/account-names", "GET", undefined, "?media=KUAISHOU");
    expect(listed.status).toBe(200);
    const items = (listed.body as { data: { items: Record<string, unknown>[] } }).data.items;
    expect(items.length).toBeGreaterThan(0);

    for (const item of items) {
      // fe 的「未归属样例」闭环要三样：原文、切出来的段、没切出来的段。
      expect(typeof item.raw).toBe("string");
      expect(item.raw).toBe(item.accountName);
      expect(item.segments).toBeDefined();
      expect(Array.isArray(item.failedSegments)).toBe(true);
    }

    // 「乱起的名字」那条切不出几段，失败段就该列出来——fe 靠它知道该往哪个段加别名。
    const messy = items.find((item) => String(item.accountName).includes("乱起"));
    expect(messy, "种子里那条乱名不见了").toBeDefined();
    expect((messy!.failedSegments as string[]).length).toBeGreaterThan(0);
  });

  it("★Q-039 ③: saving a rule returns how well it parses the whole workspace right away", async () => {
    const result = await callRoute(auth, "/api/v1/admin/naming-rules", "PUT", {
      segments: [
        { key: "biz", label: "业务", order: 1, source: "free", required: false, multi: false, mapsTo: "biz" },
        { key: "agent", label: "运营方", order: 2, source: "enum", required: false, multi: false,
          mapsTo: "agent_type", values: ["自投", "代投"], anchor: true },
      ],
      separators: ["-"],
      effective_from: "2026-09-01",
    }, "?media=KUAISHOU");
    expect(result.status, JSON.stringify(result.body)).toBe(200);

    // v1.9.24 裁决：`dryRun` 在 `meta`，`data` 保持规则本身。
    const dryRun = (result.body as { meta: { dryRun: Record<string, unknown> | null } }).meta.dryRun;
    expect((result.body as { data: Record<string, unknown> }).data.dryRun, "data 里不该再有 dryRun").toBeUndefined();
    // 改规则的人当场看见「这版能解析出多少、还差哪几段」，不用再点一次干跑。
    expect(dryRun, "保存规则后应带回干跑结果").not.toBeNull();
    expect(typeof dryRun!.total).toBe("number");
    expect(dryRun!.byStatus).toBeDefined();
    expect(dryRun!.failedSegments).toBeDefined();
    // 有昵称可跑时命中率是个数；一个都没有时是 null 而不是 0——0 会被当成「规则很烂」。
    if ((dryRun!.total as number) > 0) expect(typeof dryRun!.hitRate).toBe("number");
    else expect(dryRun!.hitRate).toBeNull();
  });
  it("★Q-038: the pending segment's value distribution rides along on both governance reads", async () => {
    // 腾讯第 10 段这类「位置固定、含义没定」的段：解析照常存值，但不进任何维度，
    // 治理页靠取值分布让优化师每月确认它到底是什么。
    const put = await callRoute(auth, "/api/v1/admin/naming-rules", "PUT", {
      segments: [
        { key: "channel", label: "渠道", order: 0, source: "enum", values: ["DAU"],
          required: true, multi: false, mapsTo: null },
        { key: "unknown_1", label: "第 10 段·待确认", order: 1, source: "free",
          required: false, multi: false, mapsTo: null, pending: true },
      ],
      separators: ["-"], effective_from: "2026-09-01", note: "待确认段",
    }, "?media=KUAISHOU");
    expect(put.status, JSON.stringify(put.body)).toBe(200);
    // 前面的用例已经把 a1/a2 确认、a3 人工改过，重解析一律绕开它们（这正是「人工结论优先」）。
    // 所以这条用例自带一个新账户，让待确认段真有值可统计，而不是去动别人的行。
    await pool.query(
      "INSERT INTO accounts(workspace_id,media,account_id,account_name) VALUES($1,'KUAISHOU','r017h-a4','DAU-待确认值')",
      [workspaceId]);
    auth.scope.accounts.push({ media: "KUAISHOU", accountId: "r017h-a4", accessLevel: "execute" });
    await callRoute(auth, "/api/v1/admin/account-names/reparse", "POST", { media: "KUAISHOU" });

    // v1.9.24：`data` 只放资源本身，算出来的观测值在 `meta`。
    const distribution = (result: Captured): Record<string, unknown>[] =>
      (result.body as { meta: { pendingSegments: Record<string, unknown>[] } }).meta.pendingSegments;

    const listed = await call("/api/v1/admin/account-names", "GET", undefined, "?media=KUAISHOU");
    const [pending, ...rest] = distribution(listed);
    // 只有标了 pending 的段进来：渠道段是正式段，不该出现在「待确认」清单里。
    expect(rest).toEqual([]);
    expect(pending).toMatchObject({ media: "KUAISHOU", key: "unknown_1", label: "第 10 段·待确认" });
    const values = pending!.values as { value: string; count: number }[];
    expect(values.length).toBeGreaterThan(0);
    expect(values.every((entry) => typeof entry.value === "string" && entry.count > 0)).toBe(true);
    // 截断了要说出来，别让人以为看见的就是全部取值。
    expect(pending!.distinctValues).toBe(values.length);

    // GET/PUT 规范也带同一份分布：治理页在一屏里既看得到段定义又看得到实际取值。
    expect(distribution(await call("/api/v1/admin/naming-rules", "GET", undefined, "?media=KUAISHOU"))[0])
      .toMatchObject({ key: "unknown_1" });
    expect(distribution(put)).toBeDefined();

    // 待确认段声明 mapsTo 就是自相矛盾（规则说映射、运行时忽略），写入这一关直接拒。
    const contradiction = await callRoute(auth, "/api/v1/admin/naming-rules", "PUT", {
      segments: [{ key: "unknown_1", label: "第 10 段·待确认", order: 0, source: "free",
        required: false, multi: false, mapsTo: "placement", pending: true }],
      separators: ["-"], effective_from: "2026-09-01",
    }, "?media=KUAISHOU");
    expect(contradiction.status).toBe(400);
  });
  it("★Q-041 ⑩: every segment in the rule response says whether it can be analysed", async () => {
    const read = await call("/api/v1/admin/naming-rules", "GET", undefined, "?media=KUAISHOU");
    const segments = (dataOf(read).segments as { key: string; mapsTo: string | null; analyzable?: boolean }[]);
    expect(segments.length).toBeGreaterThan(0);
    for (const segment of segments) {
      // 老板要「每个清洗字段都能分析」：落了归属维度的段一定可分析；
      // 没落维度的段要么显式开过，要么就是不可分析——fe 不必自己再推一遍这条规则。
      expect(typeof segment.analyzable, segment.key).toBe("boolean");
      if (segment.mapsTo !== null) expect(segment.analyzable, segment.key).toBe(true);
    }
  });
});
