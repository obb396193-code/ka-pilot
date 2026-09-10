import {
  buildDocumentTree, buildSnippet, collectMentions, contentFingerprint,
  kbCreateRequestSchema, kbPatchRequestSchema, projectContentText, relevanceScore, splitMentions,
  kbObjectTypeSchema,
  type ApprovedWorkspaceAuthContext, type KbCreateRequest, type KbDocument,
  type KbPatchRequest, type KbRefItem, type KbSearchItem, type KbTreeNode, KB_KINDS,
} from "@ka/domain";
import type { Pool, PoolClient } from "pg";

import {
  R014RepositoryError, approveAuth, inTransaction, lockWorkspaceMembership,
  requireOwnWorkspace, requireTimestamp, requireUuid,
} from "./workspace-authority.js";

/**
 * v1.4 知识库 8.x。表在 migration 019。
 *
 * 两条权限规则（api.md 8.x「权限：`visibility` + workspaceKind；team 空间只读」）：
 * - `visibility=private` 只有 owner 自己看得见；`team`/`workspace` 本空间成员都看得见。
 * - **team 空间整体只读**：读得到，任何写都拒。DTO 的 `readOnly` 就是这个。
 */
type KindFilter = (typeof KB_KINDS)[number];

const SELECT_COLUMNS = `
  document.id, document.workspace_id, document.title, document.kind, document.parent_id,
  document.position, document.content_json, document.content_text, document.tags,
  document.owner, document.visibility, document.updated_at`;

/** 可见性谓词：private 只给 owner。参数顺序固定为 (workspaceId, userId)。 */
const DEFAULT_PAGE_SIZE = 50;
const MAX_PAGE_SIZE = 200;
/** 整棵树没有分页概念，但也不能无上限——超出就如实标 `truncated`，让调用方改用筛选。 */
const TREE_HARD_LIMIT = 2_000;
/** 反查一次最多回这么多条；多出来只标 `truncated`，不静默截断。 */
const REF_LIMIT = 200;

const VISIBLE = `document.workspace_id=$1
  AND document.deleted_at IS NULL
  AND (document.visibility <> 'private' OR document.owner=$2)`;

function mapKind(value: unknown): KindFilter {
  const kind = String(value ?? "");
  if ((KB_KINDS as readonly string[]).includes(kind)) return kind as KindFilter;
  throw new R014RepositoryError("INVALID_RESULT");
}

export class KbRepository {
  constructor(private readonly pool: Pool) {}

  private readOnly(auth: ApprovedWorkspaceAuthContext): boolean {
    return auth.workspaceKind === "team";
  }

  private assertWritable(auth: ApprovedWorkspaceAuthContext): void {
    // team 空间是别人系统的镜像，写进去无处落地，所以整体只读。
    if (this.readOnly(auth)) throw new R014RepositoryError("FORBIDDEN");
  }

  /**
   * 8.x 树/列表。`parentId` 不传 = 整棵树；传了 = 该节点的直接子级（扁平）。
   *
   * 一律有上限：契约里 `page` 是列出来的参数，而且**不加 LIMIT 的话，空间文档一多
   * 就会把整库的正文投影一次性捞出来**（`content_text` 是全文，不是摘要）。
   * 整棵树也给硬上限并如实回 `truncated`，不假装「就这么多」。
   */
  async list(
    auth: ApprovedWorkspaceAuthContext,
    filter: {
      parentId?: string | null; kind?: string; visibility?: string; q?: string;
      page?: number; pageSize?: number;
    } = {},
  ): Promise<{ items: KbTreeNode[]; page: number; pageSize: number; total: number; truncated: boolean }> {
    const approved = approveAuth(auth);
    const page = filter.page ?? 1;
    const pageSize = filter.pageSize ?? DEFAULT_PAGE_SIZE;
    if (!Number.isInteger(page) || page < 1 || !Number.isInteger(pageSize)
      || pageSize < 1 || pageSize > MAX_PAGE_SIZE) {
      throw new R014RepositoryError("INVALID_INPUT");
    }
    const conditions: string[] = [VISIBLE];
    const params: unknown[] = [approved.workspaceId, approved.userId];

    if (filter.kind !== undefined) {
      params.push(mapKind(filter.kind));
      conditions.push(`document.kind=$${params.length}`);
    }
    if (filter.visibility !== undefined) {
      params.push(filter.visibility);
      conditions.push(`document.visibility=$${params.length}`);
    }
    if (filter.q !== undefined && filter.q.trim() !== "") {
      params.push(`%${filter.q.trim()}%`);
      conditions.push(`(document.title ILIKE $${params.length} OR document.content_text ILIKE $${params.length})`);
    }
    const flat = filter.parentId !== undefined;
    if (flat) {
      if (filter.parentId === null) conditions.push("document.parent_id IS NULL");
      else {
        params.push(requireUuid(filter.parentId));
        conditions.push(`document.parent_id=$${params.length}`);
      }
    }

    const total = Number((await this.pool.query(
      `SELECT count(*)::int AS n FROM kb_documents AS document WHERE ${conditions.join(" AND ")}`,
      params,
    )).rows[0].n);

    // 排序必须唯一到 id：只按 position/title 排，同名同位的行在翻页之间会漏也会重。
    const limit = flat ? pageSize : TREE_HARD_LIMIT;
    const offset = flat ? (page - 1) * pageSize : 0;
    const rows = (await this.pool.query(
      `SELECT ${SELECT_COLUMNS} FROM kb_documents AS document
       WHERE ${conditions.join(" AND ")}
       ORDER BY document.position NULLS LAST, document.title, document.id
       LIMIT $${params.length + 1} OFFSET $${params.length + 2} /* kb-list-page */`,
      [...params, limit, offset],
    )).rows as Record<string, unknown>[];

    const nodes = rows.map((row) => {
      requireOwnWorkspace(row, approved.workspaceId);
      return {
        id: String(row.id), title: String(row.title), kind: mapKind(row.kind),
        parentId: row.parent_id === null ? null : String(row.parent_id),
        position: row.position === null ? null : String(row.position),
      };
    });
    // 过滤过的结果不成树（父可能被筛掉），只有整棵树才嵌套。
    const truncated = !flat && total > rows.length;
    const paging = { page, pageSize: flat ? pageSize : rows.length, total, truncated };
    if (flat || filter.kind !== undefined || filter.visibility !== undefined
      || (filter.q !== undefined && filter.q.trim() !== "")) {
      return { items: nodes.map((node) => ({ ...node, children: [] })), ...paging };
    }
    return { items: buildDocumentTree(nodes), ...paging };
  }

  async get(auth: ApprovedWorkspaceAuthContext, documentId: string): Promise<KbDocument> {
    const approved = approveAuth(auth);
    const id = requireUuid(documentId);
    const row = (await this.pool.query(
      `SELECT ${SELECT_COLUMNS} FROM kb_documents AS document WHERE ${VISIBLE} AND document.id=$3`,
      [approved.workspaceId, approved.userId, id],
    )).rows[0] as Record<string, unknown> | undefined;
    // 看不见和不存在返回同一个 NOT_FOUND：区分开等于告诉外人「这个 id 存在但你没权限」。
    if (row === undefined) throw new R014RepositoryError("NOT_FOUND");
    return this.hydrate(this.pool, approved, row);
  }

  private async hydrate(
    client: Pool | PoolClient,
    auth: ApprovedWorkspaceAuthContext,
    row: Record<string, unknown>,
  ): Promise<KbDocument> {
    requireOwnWorkspace(row, auth.workspaceId);
    const id = String(row.id);

    const links = (await client.query(
      `SELECT link.target_document_id, target.title FROM kb_links AS link
       JOIN kb_documents AS target ON target.id=link.target_document_id
       WHERE link.workspace_id=$1 AND link.source_document_id=$2
         AND target.deleted_at IS NULL
         AND (target.visibility <> 'private' OR target.owner=$3)
       ORDER BY target.title, target.id`,
      [auth.workspaceId, id, auth.userId],
    )).rows as Record<string, unknown>[];

    const refs = (await client.query(
      `SELECT object_type, object_id FROM kb_business_refs
       WHERE workspace_id=$1 AND document_id=$2 ORDER BY object_type, object_id`,
      [auth.workspaceId, id],
    )).rows as Record<string, unknown>[];

    const revision = (await client.query(
      `SELECT revision.revision, revision.edited_by, actor.name
       FROM kb_revisions AS revision
       LEFT JOIN users AS actor ON actor.workspace_id=$2 AND actor.id=revision.edited_by
       WHERE revision.document_id=$1 ORDER BY revision.revision DESC LIMIT 1`,
      [id, auth.workspaceId],
    )).rows[0] as Record<string, unknown> | undefined;

    return {
      id,
      title: String(row.title),
      kind: mapKind(row.kind),
      parentId: row.parent_id === null ? null : String(row.parent_id),
      contentJson: row.content_json ?? null,
      contentText: row.content_text === null ? "" : String(row.content_text),
      documentLinks: links.map((link) => ({
        toId: String(link.target_document_id), label: String(link.title),
      })),
      businessRefs: refs.map((ref) => ({
        type: String(ref.object_type) as KbDocument["businessRefs"][number]["type"],
        id: String(ref.object_id),
      })),
      // 没有修订历史 = 从未编辑过；revision 0，作者 null，不拿 owner 冒充「最后编辑人」。
      revision: revision === undefined ? 0 : Number(revision.revision),
      updatedBy: revision === undefined || revision.edited_by === null || revision.name === null
        ? null
        : { userId: String(revision.edited_by), name: String(revision.name) },
      updatedAt: requireTimestamp(row.updated_at).toISOString(),
      readOnly: this.readOnly(auth),
    };
  }

  async create(auth: ApprovedWorkspaceAuthContext, input: KbCreateRequest): Promise<KbDocument> {
    const approved = approveAuth(auth);
    this.assertWritable(approved);
    const parsed = kbCreateRequestSchema.safeParse(input);
    if (!parsed.success) throw new R014RepositoryError("INVALID_INPUT");
    const request = parsed.data; // Freeze caller input before the first await.

    return inTransaction(this.pool, async (client) => {
      await lockWorkspaceMembership(client, approved);
      if (request.parentId !== undefined && request.parentId !== null) {
        await this.assertVisibleDocument(client, approved, request.parentId);
      }
      const contentText = projectContentText(request.contentJson ?? null);
      const inserted = (await client.query(
        `INSERT INTO kb_documents(workspace_id, title, kind, parent_id, content_json, content_text,
           content_fingerprint, owner, visibility)
         VALUES($1,$2,$3,$4,$5::jsonb,$6,$7,$8,$9)
         RETURNING ${SELECT_COLUMNS.replace(/document\./g, "")}`,
        [approved.workspaceId, request.title, request.kind, request.parentId ?? null,
          request.contentJson === undefined ? null : JSON.stringify(request.contentJson),
          contentText, contentFingerprint(contentText), approved.userId, request.visibility],
      )).rows[0] as Record<string, unknown>;

      await this.rewriteReferences(client, approved, String(inserted.id), request.contentJson ?? null);
      await this.appendRevision(client, approved, String(inserted.id), request.contentJson ?? null);
      return this.hydrate(client, approved, inserted);
    });
  }

  /**
   * PATCH：写一条 `kb_revisions` + 重算 `content_text`/`content_fingerprint` +
   * 重建 `kb_links`/`kb_business_refs`（api.md 8.x 原文）。
   */
  async patch(
    auth: ApprovedWorkspaceAuthContext,
    documentId: string,
    input: KbPatchRequest,
  ): Promise<KbDocument> {
    const approved = approveAuth(auth);
    this.assertWritable(approved);
    const id = requireUuid(documentId);
    const parsed = kbPatchRequestSchema.safeParse(input);
    if (!parsed.success) throw new R014RepositoryError("INVALID_INPUT");
    const patch = parsed.data; // Freeze caller input before the first await.

    return inTransaction(this.pool, async (client) => {
      await lockWorkspaceMembership(client, approved);
      const current = (await client.query(
        `SELECT ${SELECT_COLUMNS} FROM kb_documents AS document
         WHERE ${VISIBLE} AND document.id=$3 FOR UPDATE OF document`,
        [approved.workspaceId, approved.userId, id],
      )).rows[0] as Record<string, unknown> | undefined;
      if (current === undefined) throw new R014RepositoryError("NOT_FOUND");

      if (patch.parentId !== undefined && patch.parentId !== null) {
        if (patch.parentId === id) throw new R014RepositoryError("INVALID_INPUT");
        await this.assertVisibleDocument(client, approved, patch.parentId);
        await this.assertNoCycle(client, approved, id, patch.parentId);
      }

      const changesContent = patch.contentJson !== undefined;
      const contentJson = changesContent ? patch.contentJson : current.content_json;
      const contentText = changesContent
        ? projectContentText(contentJson ?? null)
        : String(current.content_text ?? "");

      const updated = (await client.query(
        `UPDATE kb_documents SET
           title=COALESCE($4, title),
           parent_id=CASE WHEN $5::boolean THEN $6::uuid ELSE parent_id END,
           position=CASE WHEN $7::boolean THEN $8::text ELSE position END,
           tags=COALESCE($9::text[], tags),
           visibility=COALESCE($10, visibility),
           content_json=CASE WHEN $11::boolean THEN $12::jsonb ELSE content_json END,
           content_text=$13, content_fingerprint=$14, updated_at=now()
         -- 事务内再核一次可见性（$2 = 当前用户）：FOR UPDATE 之后条件不会变，
         -- 但把它写进 UPDATE 自身，改写路径就不依赖「上面那条 SELECT 筛过了」这个前提。
         WHERE workspace_id=$1 AND id=$3 AND (visibility <> 'private' OR owner=$2)
         RETURNING ${SELECT_COLUMNS.replace(/document\./g, "")}`,
        [approved.workspaceId, approved.userId, id,
          patch.title ?? null,
          patch.parentId !== undefined, patch.parentId ?? null,
          patch.position !== undefined, patch.position ?? null,
          patch.tags ?? null,
          patch.visibility ?? null,
          changesContent, changesContent ? JSON.stringify(contentJson ?? null) : null,
          contentText, contentFingerprint(contentText)],
      )).rows[0] as Record<string, unknown>;

      if (changesContent) {
        await this.rewriteReferences(client, approved, id, contentJson ?? null);
        await this.appendRevision(client, approved, id, contentJson ?? null);
      }
      return this.hydrate(client, approved, updated);
    });
  }

  /** 装了 pg_trgm 就用它算相关度；没装则降级到子串 + 启发式分数（v1.9.8）。 */
  private trgm: boolean | null = null;

  private async hasTrigram(): Promise<boolean> {
    // 每进程问一次就够：扩展不会在运行期装上或卸掉。
    if (this.trgm === null) {
      this.trgm = (await this.pool.query(
        "SELECT 1 FROM pg_extension WHERE extname='pg_trgm'",
      )).rows.length === 1;
    }
    return this.trgm;
  }

  /**
   * 搜索（非 LLM）。**匹配一律靠子串**——实测 `simple` 分词把连续中文串当一个词、
   * 而 trigram 的 `similarity('新任务开户到基建SOP','开户')` 也是 **0**（短中文词的
   * trigram 集合几乎不重叠）。所以 `%` 算子和 FTS 都不能当匹配条件，只有 ILIKE 能。
   *
   * 装了 pg_trgm 的价值有两条：GIN 索引能加速这个 ILIKE；`similarity()` 给长查询
   * 一个真实相关度。所以 v1.9.8 说的「score 换 similarity」我这样落：
   * **similarity 有值就用它，为 0（短中文词）时回落到可解释的启发式**，
   * 否则整页搜索结果分数全 0，排序等于没有。
   */
  async search(
    auth: ApprovedWorkspaceAuthContext,
    query: string,
    kind?: string,
    limit = 20,
  ): Promise<{ items: KbSearchItem[]; warnings: string[] }> {
    const approved = approveAuth(auth);
    const needle = query.trim();
    const trigram = await this.hasTrigram();
    const warnings = trigram ? [] : ["TRGM_MISSING"];
    if (needle === "") return { items: [], warnings };
    const params: unknown[] = [approved.workspaceId, approved.userId, `%${needle}%`, needle];
    let kindClause = "";
    if (kind !== undefined) {
      params.push(mapKind(kind));
      kindClause = ` AND document.kind=$${params.length}`;
    }
    params.push(Math.min(Math.max(limit, 1), 100));

    const scoreColumn = trigram
      ? `GREATEST(similarity(document.title, $4), similarity(coalesce(document.content_text,''), $4)) AS trgm_score`
      : "NULL::float8 AS trgm_score";
    const rows = (await this.pool.query(
      `SELECT ${SELECT_COLUMNS}, ${scoreColumn} FROM kb_documents AS document
       WHERE ${VISIBLE}${kindClause}
         AND (document.title ILIKE $3 OR document.content_text ILIKE $3
              OR to_tsvector('simple', coalesce(document.title,'') || ' ' || coalesce(document.content_text,''))
                 @@ plainto_tsquery('simple', $4))
       LIMIT $${params.length} /* kb-search-page */`,
      params,
    )).rows as Record<string, unknown>[];

    const items = rows.map((row) => {
      requireOwnWorkspace(row, approved.workspaceId);
      const title = String(row.title);
      const contentText = row.content_text === null ? "" : String(row.content_text);
      const trgmScore = row.trgm_score === null ? 0 : Number(row.trgm_score);
      return {
        id: String(row.id), title, kind: mapKind(row.kind),
        snippet: buildSnippet(needle, contentText),
        // similarity 为 0 的多半是短中文词（实测「开户」对整串标题就是 0）；
        // 那种情况下用启发式排序，总好过一屏 0 分。
        score: trgmScore > 0 ? Number(trgmScore.toFixed(4)) : relevanceScore(needle, title, contentText),
      };
    });
    items.sort((left, right) => right.score - left.score || left.title.localeCompare(right.title));
    return { items, warnings };
  }

  /**
   * v1.9.3 软删：只置位不删行。文档的修订历史、双链、反查都留着——
   * 真删了「这篇当初引用过谁」就永久消失，跟 A7 保留授权审计行是同一条理。
   */
  async softDelete(auth: ApprovedWorkspaceAuthContext, documentId: string): Promise<{ deletedAt: string }> {
    const approved = approveAuth(auth);
    this.assertWritable(approved);
    const id = requireUuid(documentId);

    return inTransaction(this.pool, async (client) => {
      await lockWorkspaceMembership(client, approved);
      const row = (await client.query(
        `UPDATE kb_documents AS document SET deleted_at=now(), deleted_by=$2
         WHERE ${VISIBLE} AND document.id=$3
         RETURNING deleted_at`,
        [approved.workspaceId, approved.userId, id],
      )).rows[0] as Record<string, unknown> | undefined;
      // 已经删过的再删也是 404：VISIBLE 里 deleted_at IS NULL 把它挡在外面，幂等靠调用方看状态码。
      if (row === undefined) throw new R014RepositoryError("NOT_FOUND");
      return { deletedAt: requireTimestamp(row.deleted_at).toISOString() };
    });
  }

  /**
   * 8.4 反查一：谁引用了这篇文档。已软删的不出现。
   * 有上限：一篇被广泛引用的 SOP 反引用可以很多，不设限就是一次请求把它们全捞出来。
   */
  async backlinks(
    auth: ApprovedWorkspaceAuthContext, documentId: string,
  ): Promise<{ items: KbRefItem[]; truncated: boolean }> {
    const approved = approveAuth(auth);
    const id = requireUuid(documentId);
    // 目标文档本身不可见时不能返空列表——那等于确认它存在。
    const target = (await this.pool.query(
      `SELECT 1 FROM kb_documents AS document WHERE ${VISIBLE} AND document.id=$3`,
      [approved.workspaceId, approved.userId, id],
    )).rows.length;
    if (target !== 1) throw new R014RepositoryError("NOT_FOUND");

    const rows = (await this.pool.query(
      `SELECT ${SELECT_COLUMNS} FROM kb_links AS link
       JOIN kb_documents AS document ON document.id=link.source_document_id
       WHERE link.workspace_id=$1 AND link.target_document_id=$3
         AND document.deleted_at IS NULL
         AND (document.visibility <> 'private' OR document.owner=$2)
       ORDER BY document.title, document.id LIMIT $4`,
      [approved.workspaceId, approved.userId, id, REF_LIMIT + 1],
    )).rows as Record<string, unknown>[];
    return {
      items: rows.slice(0, REF_LIMIT).map((row) => this.refItem(row, approved.workspaceId)),
      truncated: rows.length > REF_LIMIT,
    };
  }

  /** 8.4 反查二：某个业务对象关联了哪些文档。没有关联返 `items:[]`，不是 404。 */
  async byObject(
    auth: ApprovedWorkspaceAuthContext, objectType: string, objectId: string,
  ): Promise<{ objectType: string; objectId: string; items: KbRefItem[]; truncated: boolean }> {
    const approved = approveAuth(auth);
    const parsed = kbObjectTypeSchema.safeParse(objectType);
    if (!parsed.success) throw new R014RepositoryError("INVALID_INPUT");
    if (typeof objectId !== "string" || objectId.length === 0 || objectId.length > 128) {
      throw new R014RepositoryError("INVALID_INPUT");
    }
    const rows = (await this.pool.query(
      `SELECT ${SELECT_COLUMNS} FROM kb_business_refs AS ref
       JOIN kb_documents AS document ON document.id=ref.document_id
       WHERE ref.workspace_id=$1 AND ref.object_type=$3 AND ref.object_id=$4
         AND document.deleted_at IS NULL
         AND (document.visibility <> 'private' OR document.owner=$2)
       ORDER BY document.title, document.id LIMIT $5`,
      [approved.workspaceId, approved.userId, parsed.data, objectId, REF_LIMIT + 1],
    )).rows as Record<string, unknown>[];
    return {
      objectType: parsed.data, objectId,
      items: rows.slice(0, REF_LIMIT).map((row) => this.refItem(row, approved.workspaceId)),
      truncated: rows.length > REF_LIMIT,
    };
  }

  private refItem(row: Record<string, unknown>, workspaceId: string): KbRefItem {
    requireOwnWorkspace(row, workspaceId);
    return { id: String(row.id), title: String(row.title), kind: mapKind(row.kind) };
  }

  private async assertVisibleDocument(
    client: PoolClient,
    auth: ApprovedWorkspaceAuthContext,
    documentId: string,
  ): Promise<void> {
    const found = (await client.query(
      `SELECT 1 FROM kb_documents AS document WHERE ${VISIBLE} AND document.id=$3`,
      [auth.workspaceId, auth.userId, requireUuid(documentId)],
    )).rows.length;
    if (found !== 1) throw new R014RepositoryError("NOT_FOUND");
  }

  /** 移动节点时禁止把文档挂到自己的后代下——那会造出一棵谁都读不到的孤环。 */
  private async assertNoCycle(
    client: PoolClient,
    auth: ApprovedWorkspaceAuthContext,
    documentId: string,
    nextParentId: string,
  ): Promise<void> {
    const cycle = (await client.query(
      `WITH RECURSIVE ancestors AS (
         SELECT id, parent_id FROM kb_documents WHERE workspace_id=$1 AND id=$2
         UNION ALL
         SELECT parent.id, parent.parent_id FROM kb_documents AS parent
         JOIN ancestors ON parent.id=ancestors.parent_id AND parent.workspace_id=$1
       )
       SELECT 1 FROM ancestors WHERE id=$3 LIMIT 1`,
      [auth.workspaceId, nextParentId, documentId],
    )).rows.length;
    if (cycle > 0) throw new R014RepositoryError("CONFLICT");
  }

  private async appendRevision(
    client: PoolClient,
    auth: ApprovedWorkspaceAuthContext,
    documentId: string,
    contentJson: unknown,
  ): Promise<void> {
    // 版本号靠 (document_id, revision) 唯一约束兜底；并发下同号会直接冲突失败，不会静默覆盖。
    await client.query("SELECT pg_advisory_xact_lock(hashtext($1), hashtext($2))", [auth.workspaceId, documentId]);
    await client.query(
      `INSERT INTO kb_revisions(document_id, revision, content_json, edited_by)
       VALUES($1, COALESCE((SELECT max(revision) FROM kb_revisions WHERE document_id=$1), 0) + 1, $2::jsonb, $3)`,
      [documentId, contentJson === null ? null : JSON.stringify(contentJson), auth.userId],
    );
  }

  /** 重建引用：全删再插。正文才是真相源，链接表只是它的投影。 */
  private async rewriteReferences(
    client: PoolClient,
    auth: ApprovedWorkspaceAuthContext,
    documentId: string,
    contentJson: unknown,
  ): Promise<void> {
    const { businessRefs, documentRefs } = splitMentions(collectMentions(contentJson));

    await client.query(
      "DELETE FROM kb_links WHERE workspace_id=$1 AND source_document_id=$2",
      [auth.workspaceId, documentId],
    );
    for (const ref of documentRefs) {
      // 按 id 直接连；只有标题的（`[[标题]]`）在本空间里按标题找，找不到就**不建链接**，
      // 不新建一个空文档去凑——那会往知识库里塞垃圾。
      const target = ref.id !== null
        ? (await client.query(
          "SELECT id FROM kb_documents WHERE workspace_id=$1 AND id=$2 AND deleted_at IS NULL",
          [auth.workspaceId, ref.id],
        )).rows[0]
        : (await client.query(
          `SELECT id FROM kb_documents WHERE workspace_id=$1 AND title=$2 AND deleted_at IS NULL
           ORDER BY created_at LIMIT 1`,
          [auth.workspaceId, ref.label],
        )).rows[0];
      if (target === undefined) continue;
      const targetId = String((target as { id: unknown }).id);
      if (targetId === documentId) continue; // 自链接没有信息量
      await client.query(
        `INSERT INTO kb_links(workspace_id, source_document_id, target_document_id)
         VALUES($1,$2,$3) ON CONFLICT DO NOTHING`,
        [auth.workspaceId, documentId, targetId],
      );
    }

    await client.query(
      "DELETE FROM kb_business_refs WHERE workspace_id=$1 AND document_id=$2",
      [auth.workspaceId, documentId],
    );
    for (const ref of businessRefs) {
      await client.query(
        `INSERT INTO kb_business_refs(workspace_id, document_id, object_type, object_id)
         VALUES($1,$2,$3,$4) ON CONFLICT DO NOTHING`,
        [auth.workspaceId, documentId, ref.type, ref.id],
      );
    }
  }
}
