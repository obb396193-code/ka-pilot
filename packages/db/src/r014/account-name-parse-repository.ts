import {
  EMPTY_DIMENSIONS_DTO, applyOverride, namingRuleSchema, parseAccountName, parsedSegmentsSchema,
  parseOverrideSchema, parseStatusSchema, pendingSegmentDefs,
  resolveAccountDimensions, toDimensionsDto, toNamingRule,
  type AccountDimensionsDto, type ApprovedWorkspaceAuthContext, type NamingRule,
  type ParseConflict, type ParseStatus, type TaskAlias,
} from "@ka/domain";
import type { Pool } from "pg";

import {
  R014RepositoryError, accountScopeClause, accountScopeParams, approveAuth, inTransaction, lockWorkspaceMembership, requireOwnWorkspace, requireTimestamp,
} from "./workspace-authority.js";

/**
 * v1.8 昵称解析的存储层（R-017 T3）。
 *
 * 三条硬要求落在这里：
 * ① 规范**按 media 版本化**——`putRule` 永远新建一个 version，不改旧版，
 *    「改了不追溯已确认的」靠这个实现；
 * ③ `override` 永久优先，`reparse` **跳过 overridden**；冲突进 `conflict` 状态给人看，
 *    仓储不替谁选一边。
 */
export interface NamingRuleRecord extends NamingRule {
  effectiveFrom: string;
  note: string | null;
  createdAt: string | null;
}

export interface AccountNameParseRecord {
  media: string;
  accountId: string;
  accountName: string;

  ruleVersion: number;
  status: ParseStatus;
  segments: Record<string, unknown>;
  taskIds: string[];
  conflicts: ParseConflict[] | null;
  override: Record<string, string> | null;
  parsedAt: string | null;
  confirmedAt: string | null;
}

/**
 * v1.9.22 ②：清洗页列表行。fe 的「未归属样例」闭环要三样——原文、切好的段、
 * **没切出来的段**。前两样底层本来就有（`accountName` / `segments`），这里补：
 * - `raw` = 原昵称（与 accountName 同值，给 fe 一个语义明确的名字）；
 * - `failedSegments` = **规则里定义了、这条却没解析出来的段**，从规则反推，不加列。
 *   status=partial/failed 的行靠它直接回答「该往哪个段加别名」。
 */
export interface AccountNameParseRow extends AccountNameParseRecord {
  raw: string;
  failedSegments: string[];
}

/**
 * v1.9.23：待确认段的取值分布。优化师每月看这个来确认「第 10 段到底是什么」，
 * 所以口径是**该媒体在他可见范围内的全量**，不跟着列表的 status/q/翻页走——
 * 被搜索词裁过的分布会让人按半份数据下结论。
 */
export interface PendingSegmentDistribution {
  /** 段 key 在不同媒体下可能重名（两家都叫 `unknown_1`），所以带上 media。 */
  media: string;
  key: string;
  label: string;
  values: { value: string; count: number }[];
  /** 去重后的取值总数；大于 `values.length` 就是被下面的上限截过。 */
  distinctValues: number;
}

/** 单个待确认段最多回多少种取值：free 段的取值可能上千，全回等于把响应撑爆。 */
const PENDING_VALUE_LIMIT = 200;

export interface ReparseCandidate {
  media: string;
  accountId: string;
  accountName: string;
  /** 已有解析行的状态；null = 还没解析过。 */
  status: ParseStatus | null;
}

const PARSE_COLUMNS = `workspace_id, media, account_id, account_name, rule_version, status,
  segments, task_ids, conflicts, override, parsed_at, confirmed_by, confirmed_at`;

/**
 * v1.9.23：读回来的规则里，待确认段身上的 `mapsTo` 一律抹掉。
 *
 * 写入那道闸（`putRule` 走 `namingRuleSchema`）已经拒了「pending 又声明 mapsTo」这种
 * 自相矛盾的规则，但 `segments` 是 JSONB——历史行、手写 SQL 都能塞进来。读的时候
 * **抹掉而不是报错**：报错会让这个 media 的账户列表维度整体 500，
 * 打击面比「少一个还没确认的维度」大得多。
 */
function sanitizeStoredSegments(segments: unknown): unknown {
  if (!Array.isArray(segments)) return segments;
  return segments.map((segment) => (
    typeof segment === "object" && segment !== null
      && (segment as { pending?: unknown }).pending === true
      ? { ...(segment as Record<string, unknown>), mapsTo: null }
      : segment
  ));
}

function mapRule(row: Record<string, unknown>, workspaceId: string): NamingRuleRecord {
  requireOwnWorkspace(row, workspaceId);
  const parsed = namingRuleSchema.safeParse({
    media: row.media,
    version: Number(row.version),
    segments: sanitizeStoredSegments(row.segments),
    separators: row.separators,
  });
  if (!parsed.success) throw new R014RepositoryError("INVALID_RESULT");
  return {
    ...parsed.data,
    effectiveFrom: String(row.effective_from_text),
    note: (row.note as string | null) ?? null,
    createdAt: row.created_at === null ? null : requireTimestamp(row.created_at).toISOString(),
  };
}

function mapParse(row: Record<string, unknown>, workspaceId: string): AccountNameParseRecord {
  requireOwnWorkspace(row, workspaceId);
  const status = parseStatusSchema.safeParse(row.status);
  if (!status.success) throw new R014RepositoryError("INVALID_RESULT");
  return {
    media: String(row.media),
    accountId: String(row.account_id),
    accountName: String(row.account_name),
    ruleVersion: Number(row.rule_version),
    status: status.data,
    segments: (row.segments as Record<string, unknown>) ?? {},
    taskIds: Array.isArray(row.task_ids) ? (row.task_ids as string[]) : [],
    conflicts: (row.conflicts as ParseConflict[] | null) ?? null,
    override: (row.override as Record<string, string> | null) ?? null,
    parsedAt: row.parsed_at === null ? null : requireTimestamp(row.parsed_at).toISOString(),
    confirmedAt: row.confirmed_at === null ? null : requireTimestamp(row.confirmed_at).toISOString(),
  };
}

const WRITE_ROLES = new Set(["lead", "admin"]);
/**
 * 归属清洗六端点的权限（契约 v1.9.9 裁定）：
 * - `putRule` / `reparseCandidates` = lead|admin —— 改规范、批量重解析是全空间动作。
 * - `list` / `patch` / `upsertParse` / `confirmBatch` = **任何成员，但只作用于会话
 *   scope 内的账户**（v1.8「归属可人工改」+ 与账户列表同口径）；团队空间只读，写 403。
 * - `currentRule` 不加闸：账户列表取维度要读规范（`dimensionsFor`），那是普通读路径。
 *
 * 我上一版把四个也做成了 lead|admin —— 方向对（原来全敞开），但过严；按裁决放宽成
 * 「成员可用 + 按授权收口」。
 */
function assertGovernance(role: string): void {
  if (!WRITE_ROLES.has(role)) throw new R014RepositoryError("FORBIDDEN");
}

/** 成员级归属操作：团队空间只读；个人空间必须是他授权内的账户。 */
function assertScopedWrite(auth: ApprovedWorkspaceAuthContext): void {
  if (auth.workspaceKind === "team") throw new R014RepositoryError("FORBIDDEN");
}

function assertAccountInScope(auth: ApprovedWorkspaceAuthContext, media: string, accountId: string): void {
  if (auth.scope.kind === "team_workspace_readonly") return;
  const allowed = auth.scope.accounts.some(
    (account) => account.media === media && account.accountId === accountId);
  // 不在授权内 → 404 而不是 403：403 等于确认「这个账户存在」。与账户列表同口径。
  if (!allowed) throw new R014RepositoryError("NOT_FOUND");
}
const MEDIA = /^[A-Z0-9_]{1,32}$/;

export class AccountNameParseRepository {
  constructor(private readonly pool: Pool) {}

  /** 取该渠道当前生效的规范：版本号最大的一版。没配过返回 null，不编一份默认规范。 */
  async currentRule(auth: ApprovedWorkspaceAuthContext, media: string): Promise<NamingRuleRecord | null> {
    const approved = approveAuth(auth);
    if (!MEDIA.test(media)) throw new R014RepositoryError("INVALID_INPUT");
    const result = await this.pool.query(
      `SELECT workspace_id, media, version, segments, separators, note, created_at,
              to_char(effective_from, 'YYYY-MM-DD') AS effective_from_text
       FROM naming_rules WHERE workspace_id=$1 AND media=$2
       ORDER BY version DESC LIMIT 1`,
      [approved.workspaceId, media],
    );
    if (result.rows.length === 0) return null;
    return mapRule(result.rows[0] as Record<string, unknown>, approved.workspaceId);
  }

  /**
   * 存新版规范。**永远新建 version = 当前最大 + 1，绝不改旧版**——
   * 已确认的账户挂在旧版本号上，改旧版等于偷偷改写历史结论。
   */
  async putRule(
    auth: ApprovedWorkspaceAuthContext,
    media: string,
    input: { segments: unknown; separators: unknown; effectiveFrom: string; note?: string | null },
  ): Promise<NamingRuleRecord> {
    const approved = approveAuth(auth);
    if (!WRITE_ROLES.has(approved.role)) throw new R014RepositoryError("FORBIDDEN");
    if (!MEDIA.test(media)) throw new R014RepositoryError("INVALID_INPUT");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(input.effectiveFrom)) throw new R014RepositoryError("INVALID_INPUT");
    const candidate = namingRuleSchema.safeParse({
      media, version: 1, segments: input.segments, separators: input.separators,
    });
    if (!candidate.success) throw new R014RepositoryError("INVALID_INPUT");
    const fixed = { ...candidate.data, effectiveFrom: input.effectiveFrom, note: input.note ?? null };
    return inTransaction(this.pool, async (client) => {
      await lockWorkspaceMembership(client, approved);
      // 版本号分配要串行：max() 上不能加 FOR UPDATE，改用事务级 advisory lock 按
      // (workspace, media) 排队。靠 PK 撞车只会报错，不会排队。
      await client.query("SELECT pg_advisory_xact_lock(hashtext($1), hashtext($2))",
        [`naming_rules:${approved.workspaceId}`, media]);
      const next = Number((await client.query(
        "SELECT COALESCE(max(version),0)+1 AS version FROM naming_rules WHERE workspace_id=$1 AND media=$2",
        [approved.workspaceId, media],
      )).rows[0].version);
      const result = await client.query(
        `INSERT INTO naming_rules(workspace_id, media, version, segments, separators, effective_from, created_by, note)
         VALUES($1,$2,$3,$4::jsonb,$5::text[],$6::date,$7,$8)
         RETURNING workspace_id, media, version, segments, separators, note, created_at,
                   to_char(effective_from, 'YYYY-MM-DD') AS effective_from_text`,
        [approved.workspaceId, media, next, JSON.stringify(fixed.segments), fixed.separators,
          fixed.effectiveFrom, approved.userId, fixed.note],
      );
      if (result.rows.length !== 1) throw new R014RepositoryError("INVALID_RESULT");
      return mapRule(result.rows[0] as Record<string, unknown>, approved.workspaceId);
    });
  }

  /** 清洗页列表。`q` 同时搜账户 ID 与昵称。 */
  async list(
    auth: ApprovedWorkspaceAuthContext,
    options: { status?: string; media?: string; q?: string; page?: number; pageSize?: number } = {},
  ): Promise<{ items: AccountNameParseRow[]; total: number }> {
    const approved = approveAuth(auth);
    const page = options.page ?? 1;
    const pageSize = options.pageSize ?? 20;
    if (!Number.isInteger(page) || page < 1 || !Number.isInteger(pageSize) || pageSize < 1 || pageSize > 100) {
      throw new R014RepositoryError("INVALID_INPUT");
    }
    if (options.status !== undefined && !parseStatusSchema.safeParse(options.status).success) {
      throw new R014RepositoryError("INVALID_INPUT");
    }
    if (options.media !== undefined && !MEDIA.test(options.media)) throw new R014RepositoryError("INVALID_INPUT");
    const like = options.q === undefined || options.q.trim() === ""
      ? null
      : `%${options.q.trim().replace(/[\\%_]/g, (char) => `\\${char}`)}%`;
    const scope = accountScopeParams(approved);
    // 表必须起别名：谓词里的 `media`/`account_id` 不带前缀时，PG 会先在
    // `jsonb_to_recordset(...) AS scoped(media, account_id)` 这一层里找到同名列，
    // 于是条件退化成 `scoped.media = scoped.media` —— 恒真，闸等于没装。
    const where = `WHERE parse.workspace_id=$1
       AND ($2::text IS NULL OR parse.status=$2)
       AND ($3::text IS NULL OR parse.media=$3)
       AND ($4::text IS NULL OR parse.account_id ILIKE $4 ESCAPE '\\' OR parse.account_name ILIKE $4 ESCAPE '\\')
       -- v1.9.9：成员看得到列表，但只看得到自己授权内的账户。
       AND ${accountScopeClause("$5", "$6", "parse.media", "parse.account_id")}`;
    const values = [approved.workspaceId, options.status ?? null, options.media ?? null, like,
      scope.kind, scope.allowed];
    const total = Number((await this.pool.query(
      `SELECT count(*)::int AS n FROM account_name_parses AS parse ${where}`, values,
    )).rows[0].n);
    const result = await this.pool.query(
      `SELECT ${PARSE_COLUMNS} FROM account_name_parses AS parse ${where}
       ORDER BY parse.media, parse.account_id LIMIT $7 OFFSET $8`,
      [...values, pageSize, (page - 1) * pageSize],
    );
    // 每行的失败段要对着**它自己那版规则**推：规则改过之后，旧行不能拿新规则算缺了什么。
    const rulesByMedia = new Map<string, NamingRule | null>();
    const items: AccountNameParseRow[] = [];
    for (const row of result.rows as Record<string, unknown>[]) {
      const record = mapParse(row, approved.workspaceId);
      const media = record.media;
      if (!rulesByMedia.has(media)) {
        const stored = await this.currentRule(approved, media);
        rulesByMedia.set(media, stored === null ? null : toNamingRule(stored));
      }
      const rule = rulesByMedia.get(media) ?? null;
      const parsedKeys = new Set(Object.keys(record.segments));
      items.push({
        ...record,
        raw: record.accountName,
        // 没有规则就谈不上「缺了哪段」——空数组而不是把所有段都算成缺。
        failedSegments: rule === null
          ? []
          : rule.segments.map((segment) => segment.key).filter((key) => !parsedKeys.has(key)),
      });
    }
    return { items, total };
  }

  /**
   * v1.9.28 ③：本空间所有任务的别名索引，给「昵称没写任务 ID 时按最长别名绑任务」用。
   *
   * **不按 scope 收口**：这里读的是任务的别名（用来解释昵称），不是任何账户数据；
   * 而且解析本身跑在治理动作里（reparse 是 lead|admin）。收口只会让同一条昵称
   * 在不同人手里解出不同的任务，那才是真正的麻烦。
   */
  async taskAliases(auth: ApprovedWorkspaceAuthContext): Promise<TaskAlias[]> {
    const approved = approveAuth(auth);
    const rows = (await this.pool.query(
      `SELECT task.task_id, alias
       FROM tasks AS task, unnest(task.aliases) AS alias
       WHERE task.workspace_id=$1 AND btrim(alias) <> ''
       ORDER BY length(alias) DESC, task.task_id
       LIMIT 5000`,
      [approved.workspaceId],
    )).rows as { task_id: string; alias: string }[];
    return rows.map((row) => ({ taskId: String(row.task_id), alias: String(row.alias) }));
  }

  /**
   * v1.9.23：待确认段的取值分布（`GET /admin/account-names` 与 naming-rules 都回它）。
   *
   * 取值优先用**人工覆盖值**：优化师确认段含义时看的应该是这段现在实际是什么，
   * 而不是解析器当初切出来的原值——人已经纠正过的行还按旧值统计会把分布带偏。
   *
   * 可见范围与列表同一套谓词：成员只统计得到自己授权内的账户，
   * 否则「取值分布」会变成一条绕过授权看全空间昵称的旁路。
   */
  async pendingSegmentDistribution(
    auth: ApprovedWorkspaceAuthContext,
    options: { media?: string } = {},
  ): Promise<PendingSegmentDistribution[]> {
    const approved = approveAuth(auth);
    if (options.media !== undefined && !MEDIA.test(options.media)) {
      throw new R014RepositoryError("INVALID_INPUT");
    }
    // 只有配过规范的媒体才谈得上待确认段；没配过的媒体连段定义都没有。
    const media = options.media !== undefined
      ? [options.media]
      : (await this.pool.query(
        "SELECT DISTINCT media FROM naming_rules WHERE workspace_id=$1 ORDER BY media",
        [approved.workspaceId],
      )).rows.map((row: { media: string }) => String(row.media));

    const scope = accountScopeParams(approved);
    const distributions: PendingSegmentDistribution[] = [];
    for (const item of media) {
      const stored = await this.currentRule(approved, item);
      if (stored === null) continue;
      for (const segment of pendingSegmentDefs(toNamingRule(stored))) {
        const rows = (await this.pool.query(
          `SELECT COALESCE(parse.override->>$3::text, parse.segments->$3::text->>'value') AS value,
                  count(*)::int AS n
           FROM account_name_parses AS parse
           WHERE parse.workspace_id=$1 AND parse.media=$2
             AND COALESCE(parse.override->>$3::text, parse.segments->$3::text->>'value') IS NOT NULL
             AND ${accountScopeClause("$4", "$5", "parse.media", "parse.account_id")}
           GROUP BY 1 ORDER BY n DESC, value ASC`,
          [approved.workspaceId, item, segment.key, scope.kind, scope.allowed],
        )).rows as { value: string; n: number }[];
        distributions.push({
          media: item,
          key: segment.key,
          label: segment.label,
          values: rows.slice(0, PENDING_VALUE_LIMIT).map((row) => ({ value: String(row.value), count: Number(row.n) })),
          // 截断了就说出来，别让人以为看见的就是全部取值。
          distinctValues: rows.length,
        });
      }
    }
    return distributions;
  }

  /**
   * 落一条解析结果。**已 overridden 的行不覆盖**（人工改过的永远优先）；
   * 已 confirmed 的行只在昵称真的变了时才重解析——改名了旧结论就作废。
   */
  async upsertParse(
    auth: ApprovedWorkspaceAuthContext,
    input: {
      media: string; accountId: string; accountName: string; ruleVersion: number;
      status: ParseStatus; segments: Record<string, unknown>; taskIds: readonly string[];
      conflicts: readonly ParseConflict[];
    },
  ): Promise<AccountNameParseRecord> {
    const approved = approveAuth(auth);
    assertScopedWrite(approved);
    if (!MEDIA.test(input.media) || !parseStatusSchema.safeParse(input.status).success) {
      throw new R014RepositoryError("INVALID_INPUT");
    }
    assertAccountInScope(approved, input.media, input.accountId);
    const result = await this.pool.query(
      `INSERT INTO account_name_parses
         (workspace_id, media, account_id, account_name, rule_version, status, segments, task_ids, conflicts, parsed_at)
       VALUES($1,$2,$3,$4,$5,$6,$7::jsonb,$8::text[],$9::jsonb,now())
       ON CONFLICT (workspace_id, media, account_id) DO UPDATE SET
         account_name = EXCLUDED.account_name,
         rule_version = EXCLUDED.rule_version,
         status = EXCLUDED.status,
         segments = EXCLUDED.segments,
         task_ids = EXCLUDED.task_ids,
         conflicts = EXCLUDED.conflicts,
         parsed_at = now()
       WHERE account_name_parses.status <> 'overridden'
         AND (account_name_parses.status <> 'confirmed'
              OR account_name_parses.account_name <> EXCLUDED.account_name)
       RETURNING ${PARSE_COLUMNS}`,
      [approved.workspaceId, input.media, input.accountId, input.accountName, input.ruleVersion,
        input.status, JSON.stringify(input.segments), [...input.taskIds],
        input.conflicts.length === 0 ? null : JSON.stringify(input.conflicts)],
    );
    // 被 WHERE 挡住 = 这行有人工结论，按约定原样返回它，不报错也不覆盖。
    if (result.rows.length === 0) {
      const existing = await this.pool.query(
        `SELECT ${PARSE_COLUMNS} FROM account_name_parses WHERE workspace_id=$1 AND media=$2 AND account_id=$3`,
        [approved.workspaceId, input.media, input.accountId],
      );
      if (existing.rows.length !== 1) throw new R014RepositoryError("INVALID_RESULT");
      return mapParse(existing.rows[0] as Record<string, unknown>, approved.workspaceId);
    }
    return mapParse(result.rows[0] as Record<string, unknown>, approved.workspaceId);
  }

  /** 人工改段 / 确认。改过就是 overridden，确认就是 confirmed；两者都不再被重解析动。 */
  async patch(
    auth: ApprovedWorkspaceAuthContext,
    media: string,
    accountId: string,
    input: { segments?: unknown; confirm?: boolean },
  ): Promise<AccountNameParseRecord> {
    const approved = approveAuth(auth);
    assertScopedWrite(approved);
    if (!MEDIA.test(media)) throw new R014RepositoryError("INVALID_INPUT");
    assertAccountInScope(approved, media, accountId);
    const hasOverride = input.segments !== undefined && input.segments !== null;
    const override = hasOverride ? parseOverrideSchema.safeParse(input.segments) : null;
    if (hasOverride && (override === null || !override.success)) throw new R014RepositoryError("INVALID_INPUT");
    if (!hasOverride && input.confirm !== true) throw new R014RepositoryError("INVALID_INPUT");
    return inTransaction(this.pool, async (client) => {
      await lockWorkspaceMembership(client, approved);
      const result = await client.query(
        `UPDATE account_name_parses SET
           override = CASE WHEN $4::jsonb IS NULL THEN override
                           ELSE COALESCE(override, '{}'::jsonb) || $4::jsonb END,
           status = CASE WHEN $4::jsonb IS NOT NULL THEN 'overridden'
                         WHEN $5::boolean THEN 'confirmed' ELSE status END,
           confirmed_by = CASE WHEN $5::boolean OR $4::jsonb IS NOT NULL THEN $6::uuid ELSE confirmed_by END,
           confirmed_at = CASE WHEN $5::boolean OR $4::jsonb IS NOT NULL THEN now() ELSE confirmed_at END
         WHERE workspace_id=$1 AND media=$2 AND account_id=$3
         RETURNING ${PARSE_COLUMNS}`,
        [approved.workspaceId, media, accountId,
          hasOverride ? JSON.stringify(override!.data) : null,
          input.confirm === true, approved.userId],
      );
      if (result.rows.length !== 1) throw new R014RepositoryError("NOT_FOUND");
      return mapParse(result.rows[0] as Record<string, unknown>, approved.workspaceId);
    });
  }

  /** 批量确认：只放行 parsed 状态（一键过），conflict / failed 必须人工看，不许批量吞掉。 */
  async confirmBatch(
    auth: ApprovedWorkspaceAuthContext,
    items: readonly { media: string; accountId: string }[],
  ): Promise<{ confirmed: number; skipped: { media: string; accountId: string; status: ParseStatus }[] }> {
    const approved = approveAuth(auth);
    assertScopedWrite(approved);
    if (!Array.isArray(items) || items.length === 0 || items.length > 500) {
      throw new R014RepositoryError("INVALID_INPUT");
    }
    for (const item of items) {
      if (!MEDIA.test(item.media) || typeof item.accountId !== "string" || item.accountId.length === 0) {
        throw new R014RepositoryError("INVALID_INPUT");
      }
      // 整批里只要有一个不在授权内就整批拒，不静默跳过——静默跳过等于告诉他
      // 「这些确认了那些没确认」，反而把授权边界透出去了。
      assertAccountInScope(approved, item.media, item.accountId);
    }
    const media = items.map((item) => item.media);
    const ids = items.map((item) => item.accountId);
    return inTransaction(this.pool, async (client) => {
      await lockWorkspaceMembership(client, approved);
      const confirmed = await client.query(
        `UPDATE account_name_parses SET status='confirmed', confirmed_by=$2, confirmed_at=now()
         WHERE workspace_id=$1 AND status='parsed'
           AND (media, account_id) IN (SELECT * FROM unnest($3::text[], $4::text[]))
         RETURNING media, account_id`,
        [approved.workspaceId, approved.userId, media, ids],
      );
      const skipped = await client.query(
        `SELECT media, account_id, status FROM account_name_parses
         WHERE workspace_id=$1 AND status <> 'confirmed'
           AND (media, account_id) IN (SELECT * FROM unnest($2::text[], $3::text[]))`,
        [approved.workspaceId, media, ids],
      );
      return {
        confirmed: confirmed.rows.length,
        skipped: (skipped.rows as Record<string, unknown>[]).map((row) => ({
          media: String(row.media),
          accountId: String(row.account_id),
          status: parseStatusSchema.parse(row.status),
        })),
      };
    });
  }

  /** 重解析候选：**跳过 overridden**（人工结论不动），其余账户都给出来。 */
  async reparseCandidates(
    auth: ApprovedWorkspaceAuthContext,
    options: { media?: string; accountIds?: readonly string[] } = {},
  ): Promise<ReparseCandidate[]> {
    const approved = approveAuth(auth);
    assertGovernance(approved.role);
    if (options.media !== undefined && !MEDIA.test(options.media)) throw new R014RepositoryError("INVALID_INPUT");
    const result = await this.pool.query(
      `SELECT account.media, account.account_id, COALESCE(account.account_name, '') AS account_name,
              parse.status
       FROM accounts AS account
       LEFT JOIN account_name_parses AS parse
         ON parse.workspace_id = account.workspace_id
        AND parse.media = account.media
        AND parse.account_id = account.account_id
       WHERE account.workspace_id=$1
         AND ($2::text IS NULL OR account.media=$2)
         AND ($3::text[] IS NULL OR account.account_id = ANY($3::text[]))
         AND COALESCE(parse.status, '') <> 'overridden'
       ORDER BY account.media, account.account_id`,
      [approved.workspaceId, options.media ?? null, options.accountIds ? [...options.accountIds] : null],
    );
    return (result.rows as Record<string, unknown>[]).map((row) => ({
      media: String(row.media),
      accountId: String(row.account_id),
      accountName: String(row.account_name),
      status: row.status === null ? null : parseStatusSchema.parse(row.status),
    }));
  }

  /**
   * R-017 T5：账户列表要的十个维度。**人工 > 昵称 > 平台**（`resolveAccountDimensions`）。
   *
   * 平台那一路现在**没有源**：`accounts` 表里没有任何平台侧维度列
   * （v1.7.9 说的 `custom_tags` 代投/自投也还没入库），所以 platform 传空。
   * 昵称没解析到的维度就是 `{value:null, source:null}`——不写 "unknown" 当值。
   */
  async dimensionsFor(
    auth: ApprovedWorkspaceAuthContext,
    tuples: readonly { media: string; accountId: string }[],
  ): Promise<Map<string, AccountDimensionsDto>> {
    const approved = approveAuth(auth);
    const result = new Map<string, AccountDimensionsDto>();
    if (tuples.length === 0) return result;

    const rows = (await this.pool.query(
      `SELECT parse.media, parse.account_id, parse.segments, parse.override, parse.rule_version
       FROM account_name_parses AS parse
       WHERE parse.workspace_id=$1
         AND (parse.media, parse.account_id) IN (SELECT * FROM unnest($2::text[], $3::text[]))`,
      [approved.workspaceId, tuples.map((item) => item.media), tuples.map((item) => item.accountId)],
    )).rows as Record<string, unknown>[];
    if (rows.length === 0) return result;

    // 规范按 media 存，一次列表最多几个 media，按 media 缓存避免逐行查规范。
    const rules = new Map<string, NamingRule | null>();
    for (const row of rows) {
      const media = String(row.media);
      if (!rules.has(media)) {
        const record = await this.currentRule(approved, media);
        rules.set(media, record === null ? null : toNamingRule(record));
      }
      const rule = rules.get(media) ?? null;
      // 没有规范就没有 mapsTo，段落不知道该落到哪个维度 → 全 null，不硬凑。
      if (rule === null) continue;

      const override = parseOverrideSchema.safeParse(row.override ?? {});
      // 库里的 segments 是 JSONB，不盲信：形状不对就当这个账户没有解析（全 null），
      // 而不是把半个对象塞进解析器。
      const segments = parsedSegmentsSchema.safeParse(row.segments ?? {});
      if (!segments.success) continue;
      const applied = applyOverride(
        { status: "parsed", segments: segments.data, taskIds: [], unmatched: [], leftover: [] },
        override.success ? override.data : {},
        rule,
      );
      result.set(`${media}:${String(row.account_id)}`, toDimensionsDto(resolveAccountDimensions({
        segments: applied.segments,
        overriddenKeys: Object.keys(override.success ? override.data : {}),
        platform: {},
      })));
    }
    return result;
  }

  /** 列表里没有解析行的账户用它填位，保证十个键恒在。 */
  static emptyDimensions(): AccountDimensionsDto {
    return EMPTY_DIMENSIONS_DTO;
  }

  /**
   * 昵称解析出的**业务段**（`mapsTo="biz"`）。它不在十个 DTO 维度里（那十个是投放属性），
   * 但日报 dim_biz 要用它兜底：任务没填 biz_name 时，账户昵称里往往写着业务。
   */
  async bizFor(
    auth: ApprovedWorkspaceAuthContext,
    tuples: readonly { media: string; accountId: string }[],
  ): Promise<Map<string, string>> {
    const approved = approveAuth(auth);
    const found = new Map<string, string>();
    if (tuples.length === 0) return found;

    const rows = (await this.pool.query(
      `SELECT media, account_id, segments, override FROM account_name_parses
       WHERE workspace_id=$1 AND (media, account_id) IN (SELECT * FROM unnest($2::text[], $3::text[]))`,
      [approved.workspaceId, tuples.map((item) => item.media), tuples.map((item) => item.accountId)],
    )).rows as Record<string, unknown>[];

    const rules = new Map<string, NamingRule | null>();
    for (const row of rows) {
      const media = String(row.media);
      if (!rules.has(media)) {
        const record = await this.currentRule(approved, media);
        rules.set(media, record === null ? null : toNamingRule(record));
      }
      const rule = rules.get(media) ?? null;
      if (rule === null) continue;
      const segments = parsedSegmentsSchema.safeParse(row.segments ?? {});
      if (!segments.success) continue;
      const override = parseOverrideSchema.safeParse(row.override ?? {});
      const applied = applyOverride(
        { status: "parsed", segments: segments.data, taskIds: [], unmatched: [], leftover: [] },
        override.success ? override.data : {}, rule,
      );
      const biz = Object.values(applied.segments).find((segment) => segment.mapsTo === "biz");
      if (biz !== undefined && biz.value !== "") found.set(`${media}:${String(row.account_id)}`, biz.value);
    }
    return found;
  }

  /**
   * v1.9.22 ③：拿一份规则对**本空间该媒体的全部昵称**干跑，回命中率。
   * 只读不写——改规则的人先看见「这版规则能解析出多少」，再决定要不要重解析。
   *
   * `hitRate` 的分母是**参与干跑的账户数**，不是全空间账户数：没有昵称的账户
   * 本来就无从解析，算进分母只会让命中率无谓地低，看不出规则好坏。
   */
  async dryRunAll(
    auth: ApprovedWorkspaceAuthContext, media: string, rule: NamingRule,
  ): Promise<{ total: number; byStatus: Record<string, number>; hitRate: number | null; failedSegments: Record<string, number> }> {
    const approved = approveAuth(auth);
    if (!MEDIA.test(media)) throw new R014RepositoryError("INVALID_INPUT");

    const rows = (await this.pool.query(
      `SELECT account.account_name FROM accounts AS account
       WHERE account.workspace_id=$1 AND account.media=$2
         AND account.account_name IS NOT NULL AND btrim(account.account_name) <> ''
       LIMIT 5000`,
      [approved.workspaceId, media],
    )).rows as { account_name: string }[];

    const byStatus: Record<string, number> = {};
    const failedSegments: Record<string, number> = {};
    for (const row of rows) {
      const parse = parseAccountName(String(row.account_name), rule);
      byStatus[parse.status] = (byStatus[parse.status] ?? 0) + 1;
      for (const key of parse.unmatched) failedSegments[key] = (failedSegments[key] ?? 0) + 1;
    }
    return {
      total: rows.length,
      byStatus,
      // 一个可干跑的昵称都没有时命中率是**不知道**，不是 0——0 会被当成「规则很烂」。
      hitRate: rows.length === 0 ? null : Number(((byStatus.parsed ?? 0) / rows.length).toFixed(4)),
      failedSegments,
    };
  }
}
