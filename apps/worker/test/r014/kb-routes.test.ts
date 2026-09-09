import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { runMigrations } from "@ka/db";
import { registerR014Routes } from "../../src/r014/routes.js";
import { createKbRoutes } from "../../src/r014/kb-routes.js";
import { callRoute as call, type Captured } from "./fake-http.js";

// Synthetic data only. Execute on the explicitly selected isolated test database (ka_be2_r014_test).
const databaseUrl = process.env.TEST_DATABASE_URL ?? "postgres://ka:ka@127.0.0.1:55432/ka_be2_r014_test";

interface AuthContext {
  workspaceId: string; userId: string; role: "optimizer";
  workspaceKind: "personal" | "team";
  // approvedWorkspaceAuthContextSchema 是按 workspaceKind 判别的联合：
  // personal 配 explicit_accounts，team 只能配 team_workspace_readonly。
  scope: { kind: "explicit_accounts"; accounts: never[] } | { kind: "team_workspace_readonly" };
}

const doc = (blocks: unknown[]): unknown => ({ type: "doc", content: blocks });
const paragraph = (...content: unknown[]): unknown => ({ type: "paragraph", content });
const text = (value: string): unknown => ({ type: "text", text: value });

describe("kb routes v1.4 8.x (real PostgreSQL)", () => {
  const pool = new Pool({ connectionString: databaseUrl });
  let workspaceId = "";
  const identityIds: string[] = [];
  let auth: AuthContext;
  let otherAuth: AuthContext;

  const dataOf = (result: Captured): Record<string, unknown> =>
    (result.body as { data: Record<string, unknown> }).data;

  async function makeMember(name: string): Promise<{ userId: string; identityId: string }> {
    const identity = (await pool.query(
      "INSERT INTO auth_identities(provider,provider_subject,display_name) VALUES('internal_test',$1,'synthetic') RETURNING id",
      [`kb-${randomUUID()}`],
    )).rows[0].id;
    const userId = (await pool.query(
      "INSERT INTO users(workspace_id,name,role) VALUES($1,$2,'optimizer') RETURNING id", [workspaceId, name],
    )).rows[0].id;
    await pool.query(
      "INSERT INTO workspace_memberships(workspace_id,identity_id,user_id,role,is_active) VALUES($1,$2,$3,'optimizer',true)",
      [workspaceId, identity, userId],
    );
    identityIds.push(identity);
    return { userId, identityId: identity };
  }

  beforeAll(async () => {
    await runMigrations({ databaseUrl });
    registerR014Routes(createKbRoutes(pool));
    workspaceId = (await pool.query(
      "INSERT INTO workspaces(name,kind) VALUES($1,'personal') RETURNING id", [`kb-${randomUUID()}`],
    )).rows[0].id;
    const mine = await makeMember("示例优化师");
    const theirs = await makeMember("同空间另一人");
    auth = { workspaceId, userId: mine.userId, role: "optimizer", workspaceKind: "personal",
      scope: { kind: "explicit_accounts", accounts: [] } };
    otherAuth = { ...auth, userId: theirs.userId };
  });

  afterAll(async () => {
    // kb_links / kb_business_refs 自己带 workspace_id；只有 kb_revisions 得顺着文档找。
    await pool.query("DELETE FROM kb_business_refs WHERE workspace_id=$1", [workspaceId]);
    await pool.query("DELETE FROM kb_links WHERE workspace_id=$1", [workspaceId]);
    await pool.query(
      "DELETE FROM kb_revisions WHERE document_id IN (SELECT id FROM kb_documents WHERE workspace_id=$1)",
      [workspaceId]);
    for (const table of ["kb_documents", "workspace_memberships", "users"]) {
      await pool.query(`DELETE FROM ${table} WHERE workspace_id=$1`, [workspaceId]);
    }
    await pool.query("DELETE FROM workspaces WHERE id=$1", [workspaceId]);
    // 只删本套件建的身份：按前缀批删会连带别的用例还在用的行（外键当场报错）。
    await pool.query("DELETE FROM auth_identities WHERE id = ANY($1::uuid[])", [identityIds]);
    await pool.end();
  });

  /** harness 收的是 pathname + search 两段，这里把带查询串的路径拆开。 */
  const callRoute = async (
    context: AuthContext, path: string, method = "GET", body?: unknown,
  ): Promise<Captured> => {
    const at = path.indexOf("?");
    const pathname = at < 0 ? path : path.slice(0, at);
    const search = at < 0 ? "" : path.slice(at);
    return call(context, pathname, method, body, search);
  };

  async function createDocument(
    context: AuthContext, title: string, extra: Record<string, unknown> = {},
  ): Promise<Record<string, unknown>> {
    const result = await callRoute(context, "/api/v1/kb/documents", "POST",
      { title, kind: "manual", visibility: "workspace", ...extra });
    expect(result.status, JSON.stringify(result.body)).toBe(200);
    return dataOf(result);
  }

  it("creates a document and projects its text, fingerprint and first revision", async () => {
    const created = await createDocument(auth, "开户 SOP", {
      content_json: doc([paragraph(text("准备 → 开户 → 充值"))]), kind: "sop",
    });
    expect(created.contentText).toBe("准备 → 开户 → 充值");
    expect(created.revision).toBe(1);
    expect(created.updatedBy).toEqual({ userId: auth.userId, name: "示例优化师" });
    expect(created.readOnly).toBe(false);

    const stored = (await pool.query(
      "SELECT content_fingerprint FROM kb_documents WHERE id=$1", [created.id],
    )).rows[0];
    expect(stored.content_fingerprint).toHaveLength(64);
  });

  it("rebuilds kb_links and kb_business_refs from the body on every content edit", async () => {
    const target = await createDocument(auth, "2026-09-05 日报");
    const source = await createDocument(auth, "引用了日报的文档", {
      content_json: doc([paragraph(
        text("见 [[2026-09-05 日报]]"),
        { type: "mention", attrs: { type: "task", id: "kb-task-1", label: "AAC 拉新" } },
      )]),
    });
    expect(source.documentLinks).toEqual([{ toId: target.id, label: "2026-09-05 日报" }]);
    expect(source.businessRefs).toEqual([{ type: "task", id: "kb-task-1" }]);

    // 正文里删掉引用 → 链接表必须跟着空，投影不能留残影。
    const patched = await callRoute(auth, `/api/v1/kb/documents/${String(source.id)}`, "PATCH",
      { content_json: doc([paragraph(text("引用都删掉了"))]) });
    expect(dataOf(patched).documentLinks).toEqual([]);
    expect(dataOf(patched).businessRefs).toEqual([]);
    expect(dataOf(patched).revision).toBe(2);
  });

  it("does not invent a document for an unresolved [[title]]", async () => {
    const source = await createDocument(auth, "引用了不存在的标题", {
      content_json: doc([paragraph(text("见 [[这篇根本不存在]]"))]),
    });
    expect(source.documentLinks).toEqual([]);
    const count = (await pool.query(
      "SELECT count(*)::int AS n FROM kb_documents WHERE workspace_id=$1 AND title='这篇根本不存在'", [workspaceId],
    )).rows[0].n;
    expect(count).toBe(0);
  });

  it("keeps a private document out of another member's list, read and search", async () => {
    const secret = await createDocument(auth, "错题本：只有我能看", {
      visibility: "private", content_json: doc([paragraph(text("私密内容 kbsecret"))]),
    });
    const listed = await callRoute(otherAuth, "/api/v1/kb/documents");
    const titles = JSON.stringify(dataOf(listed).items);
    expect(titles).not.toContain("错题本");

    const read = await callRoute(otherAuth, `/api/v1/kb/documents/${String(secret.id)}`);
    // 不存在与无权限返回同一个 404：区分开就是在确认「这个 id 存在」。
    expect(read.status).toBe(404);

    const found = await callRoute(otherAuth, "/api/v1/kb/search?q=kbsecret");
    expect(dataOf(found).items).toEqual([]);
    const mine = await callRoute(auth, "/api/v1/kb/search?q=kbsecret");
    expect((dataOf(mine).items as unknown[]).length).toBe(1);
  });

  it("finds a Chinese substring the frozen FTS index cannot match", async () => {
    const created = await createDocument(auth, "新任务开户到基建SOP", {
      content_json: doc([paragraph(text("准备开户充值基建冷启动"))]), kind: "sop",
    });
    // 实测：simple 分词把**连续**中文串整个当一个词
    // （'新任务开户到基建sop':1），所以搜「开户」FTS 一条都匹配不到。
    // （中间带空格的中文会被空格分开，那种能命中——问题只出在连续串上，而标题恰恰都是连续串。）
    const ftsOnly = (await pool.query(
      `SELECT count(*)::int AS n FROM kb_documents
       WHERE workspace_id=$1 AND id=$2
         AND to_tsvector('simple', coalesce(title,'')||' '||coalesce(content_text,''))
             @@ plainto_tsquery('simple','开户')`, [workspaceId, created.id],
    )).rows[0].n;
    expect(ftsOnly).toBe(0);

    // 端点靠子串照样搜得到；这条用例守住子串通路，别哪天被"优化"成纯 FTS。
    const found = await callRoute(auth, "/api/v1/kb/search?q=开户&kind=sop");
    const items = dataOf(found).items as { title: string; score: number; snippet: string }[];
    expect(items.map((item) => item.title)).toContain("新任务开户到基建SOP");
    expect(items[0]!.score).toBeGreaterThan(0);
    expect(items[0]!.snippet).toContain("开户");
  });

  it("nests the tree and flattens a filtered list", async () => {
    const parent = await createDocument(auth, "SOP 目录", { kind: "sop" });
    await createDocument(auth, "子文档", { kind: "sop", parent_id: parent.id });

    const tree = await callRoute(auth, "/api/v1/kb/documents");
    const roots = dataOf(tree).items as { id: string; children: unknown[] }[];
    const node = roots.find((item) => item.id === parent.id);
    expect(node?.children).toHaveLength(1);

    // 带筛选时父可能被筛掉，返回扁平列表而不是一棵缺父的残树。
    const children = await callRoute(auth, `/api/v1/kb/documents?parent_id=${String(parent.id)}`);
    const items = dataOf(children).items as { title: string; children: unknown[] }[];
    expect(items).toHaveLength(1);
    expect(items[0]!.title).toBe("子文档");
    expect(items[0]!.children).toEqual([]);
  });

  it("refuses to hang a document under its own descendant", async () => {
    const parent = await createDocument(auth, "环-父");
    const child = await createDocument(auth, "环-子", { parent_id: parent.id });
    const result = await callRoute(auth, `/api/v1/kb/documents/${String(parent.id)}`, "PATCH",
      { parent_id: child.id });
    expect(result.status).toBe(409);
  });

  it("makes every write fail in a team workspace and still allows reads", async () => {
    const teamAuth: AuthContext = { ...auth, workspaceKind: "team", scope: { kind: "team_workspace_readonly" } };
    const created = await callRoute(teamAuth, "/api/v1/kb/documents", "POST",
      { title: "团队空间不许写", kind: "manual", visibility: "workspace" });
    expect(created.status).toBe(403);

    const listed = await callRoute(teamAuth, "/api/v1/kb/documents");
    expect(listed.status).toBe(200);
    const existing = await createDocument(auth, "团队空间读得到");
    const read = await callRoute(teamAuth, `/api/v1/kb/documents/${String(existing.id)}`);
    expect(read.status).toBe(200);
    // readOnly 就是给前端用来收起编辑器的信号。
    expect(dataOf(read).readOnly).toBe(true);
  });

  it("soft-deletes: the row and its history stay, every read stops showing it", async () => {
    const target = await createDocument(auth, "被引用后又被删的文档", {
      content_json: doc([paragraph(text("待删正文 kbdeleted"))]),
    });
    const source = await createDocument(auth, "引用它的文档", {
      content_json: doc([paragraph({ type: "mention",
        attrs: { type: "document", id: target.id, label: "被引用后又被删的文档" } })]),
    });
    expect((dataOf(await callRoute(auth, `/api/v1/kb/documents/${String(target.id)}/backlinks`)).items as unknown[]))
      .toHaveLength(1);

    const deleted = await callRoute(auth, `/api/v1/kb/documents/${String(target.id)}`, "DELETE");
    expect(deleted.status).toBe(200);
    expect(typeof dataOf(deleted).deletedAt).toBe("string");

    // 行还在、修订历史还在——真删了「这篇当初引用过谁」就永久消失。
    const row = (await pool.query(
      "SELECT deleted_at, deleted_by FROM kb_documents WHERE id=$1", [target.id],
    )).rows[0];
    expect(row.deleted_at).not.toBeNull();
    expect(row.deleted_by).toBe(auth.userId);
    expect((await pool.query("SELECT count(*)::int AS n FROM kb_revisions WHERE document_id=$1", [target.id]))
      .rows[0].n).toBeGreaterThan(0);

    // 读侧一律看不到了：单读 404、搜索为空、别人的正文反查里也不出现。
    expect((await callRoute(auth, `/api/v1/kb/documents/${String(target.id)}`)).status).toBe(404);
    expect(dataOf(await callRoute(auth, "/api/v1/kb/search?q=kbdeleted")).items).toEqual([]);
    expect(JSON.stringify(dataOf(await callRoute(auth, "/api/v1/kb/documents")).items))
      .not.toContain("被引用后又被删的文档");
    expect(dataOf(await callRoute(auth, `/api/v1/kb/documents/${String(source.id)}`)).documentLinks).toEqual([]);
    // 再删一次是 404：已删的不在可见集里，幂等靠状态码表达。
    expect((await callRoute(auth, `/api/v1/kb/documents/${String(target.id)}`, "DELETE")).status).toBe(404);
  });

  it("answers by-object with the frozen three-field rows and an empty list when nothing links", async () => {
    const linked = await createDocument(auth, "挂了任务的文档", {
      content_json: doc([paragraph({ type: "mention",
        attrs: { type: "task", id: "kb-obj-task", label: "任务" } })]),
    });
    const found = dataOf(await callRoute(auth, "/api/v1/kb/by-object/task/kb-obj-task"));
    expect(found.objectType).toBe("task");
    expect(found.objectId).toBe("kb-obj-task");
    expect(found.items).toEqual([{ id: linked.id, title: "挂了任务的文档", kind: "manual" }]);

    // 无关联返回空列表而不是 404——「这个任务没有文档」是答案，不是错误。
    const empty = await callRoute(auth, "/api/v1/kb/by-object/task/kb-obj-none");
    expect(empty.status).toBe(200);
    expect(dataOf(empty).items).toEqual([]);
    // 不在 kb_business_refs 枚举里的类型直接拒。
    expect((await callRoute(auth, "/api/v1/kb/by-object/planet/mars")).status).toBe(400);
  });

  it("hides another member's private document from backlinks and by-object", async () => {
    const secret = await createDocument(auth, "私密的引用者", {
      visibility: "private",
      content_json: doc([paragraph({ type: "mention",
        attrs: { type: "task", id: "kb-private-task", label: "任务" } })]),
    });
    expect(dataOf(await callRoute(otherAuth, "/api/v1/kb/by-object/task/kb-private-task")).items).toEqual([]);
    expect((await callRoute(otherAuth, `/api/v1/kb/documents/${String(secret.id)}/backlinks`)).status).toBe(404);
  });

  it("rejects an empty patch and an unknown kind instead of silently doing nothing", async () => {
    const existing = await createDocument(auth, "空补丁");
    expect((await callRoute(auth, `/api/v1/kb/documents/${String(existing.id)}`, "PATCH", {})).status).toBe(400);
    expect((await callRoute(auth, "/api/v1/kb/documents", "POST",
      { title: "坏 kind", kind: "planet", visibility: "workspace" })).status).toBe(400);
  });

  it("scores with similarity when pg_trgm is installed, and still matches the short Chinese word it scores 0", async () => {
    await pool.query("CREATE EXTENSION IF NOT EXISTS pg_trgm");
    await createDocument(auth, "开户流程说明", { content_json: doc([paragraph(text("trgmcase 正文"))]) });
    // 仓储对扩展只探测一次，所以另起实例走「装好了」的路径。
    const { KbRepository } = await import("@ka/db");
    const fresh = new KbRepository(pool);

    const long = await fresh.search(auth as never, "开户流程说明");
    expect(long.warnings).toEqual([]);
    expect(long.items[0]!.score).toBeGreaterThan(0);

    // ★短中文词的 trigram 相似度实测是 0（'新任务开户到基建SOP' vs '开户' = 0）。
    // 匹配靠子串照样命中，分数回落到启发式——否则一屏 0 分等于没有排序。
    const short = await fresh.search(auth as never, "开户");
    expect(short.items.map((item) => item.title)).toContain("开户流程说明");
    expect(short.items[0]!.score).toBeGreaterThan(0);
  });

  it("degrades to the ILIKE path and flags TRGM_MISSING when the extension is not installed", async () => {
    // 扩展被 022 建的索引依赖着，删不掉；所以把「探测扩展」这一问拦掉来模拟没装的库。
    const withoutTrigram = {
      query: (async (text: unknown, values?: unknown) =>
        typeof text === "string" && text.includes("pg_extension")
          ? { rows: [] }
          : pool.query(text as never, values as never)) as typeof pool.query,
    };
    const { KbRepository } = await import("@ka/db");
    const degraded = new KbRepository(withoutTrigram as never);

    const found = await degraded.search(auth as never, "开户");
    // 扩展缺失要如实标出来，别让「搜得不准」看起来像搜索本身不行。
    expect(found.warnings).toEqual(["TRGM_MISSING"]);
    expect(found.items.map((item) => item.title)).toContain("开户流程说明");
    expect(found.items[0]!.score).toBeGreaterThan(0);
  });

  it("returns the frozen fixture's key sets for the document, tree, search and reverse lookups", async () => {
    const frozen = (path: string): Record<string, unknown> => (JSON.parse(readFileSync(
      new URL(`../../../../packages/contract/fixtures/kb/${path}`, import.meta.url), "utf8",
    )) as { data: Record<string, unknown> }).data;

    const created = await createDocument(auth, "对拍用文档", {
      content_json: doc([paragraph(text("正文"))]),
    });
    const read = dataOf(await callRoute(auth, `/api/v1/kb/documents/${String(created.id)}`));
    expect(Object.keys(read).sort()).toEqual(Object.keys(frozen("document.json")).sort());

    const tree = dataOf(await callRoute(auth, "/api/v1/kb/documents"));
    const node = (tree.items as Record<string, unknown>[])[0]!;
    const frozenNode = (frozen("tree.json").items as Record<string, unknown>[])[0]!;
    expect(Object.keys(node).sort()).toEqual(Object.keys(frozenNode).sort());

    const hits = dataOf(await callRoute(auth, "/api/v1/kb/search?q=对拍")).items as Record<string, unknown>[];
    expect(Object.keys(hits[0]!).sort())
      .toEqual(Object.keys((frozen("search.json").items as Record<string, unknown>[])[0]!).sort());

    const byObject = dataOf(await callRoute(auth, "/api/v1/kb/by-object/task/none"));
    expect(Object.keys(byObject).sort()).toEqual(Object.keys(frozen("by-object.json")).sort());
  });
});
