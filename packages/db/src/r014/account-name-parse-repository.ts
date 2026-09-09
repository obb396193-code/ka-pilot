import {
  EMPTY_DIMENSIONS_DTO, applyOverride, namingRuleSchema, parsedSegmentsSchema,
  parseOverrideSchema, parseStatusSchema,
  resolveAccountDimensions, toDimensionsDto, toNamingRule,
  type AccountDimensionsDto, type ApprovedWorkspaceAuthContext, type NamingRule,
  type ParseConflict, type ParseStatus,
} from "@ka/domain";
import type { Pool } from "pg";

import {
  R014RepositoryError, approveAuth, inTransaction, lockWorkspaceMembership,
  requireOwnWorkspace, requireTimestamp,
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

export interface ReparseCandidate {
  media: string;
  accountId: string;
  accountName: string;
  /** 已有解析行的状态；null = 还没解析过。 */
  status: ParseStatus | null;
}

const PARSE_COLUMNS = `workspace_id, media, account_id, account_name, rule_version, status,
  segments, task_ids, conflicts, override, parsed_at, confirmed_by, confirmed_at`;

function mapRule(row: Record<string, unknown>, workspaceId: string): NamingRuleRecord {
  requireOwnWorkspace(row, workspaceId);
  const parsed = namingRuleSchema.safeParse({
    media: row.media,
    version: Number(row.version),
    segments: row.segments,
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
 * 归属清洗后台（六个端点全在 `/api/v1/admin/` 下）一律 lead|admin。
 * 原来只有 `putRule` 挡了角色，`list/patch/confirmBatch/reparseCandidates/upsertParse`
 * 五个是敞开的——个人空间里任何优化师都能列出并改**全空间**账户的昵称解析，
 * 而账户列表本身是按授权收口的。和 Q-020 是同一类：一个入口收口了，旁边的没收。
 *
 * `currentRule` 不在此列：账户列表取维度要读规范（`dimensionsFor`），那是普通读路径。
 */
function assertGovernance(role: string): void {
  if (!WRITE_ROLES.has(role)) throw new R014RepositoryError("FORBIDDEN");
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
  ): Promise<{ items: AccountNameParseRecord[]; total: number }> {
    const approved = approveAuth(auth);
    assertGovernance(approved.role);
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
    const where = `WHERE workspace_id=$1
       AND ($2::text IS NULL OR status=$2)
       AND ($3::text IS NULL OR media=$3)
       AND ($4::text IS NULL OR account_id ILIKE $4 ESCAPE '\\' OR account_name ILIKE $4 ESCAPE '\\')`;
    const values = [approved.workspaceId, options.status ?? null, options.media ?? null, like];
    const total = Number((await this.pool.query(
      `SELECT count(*)::int AS n FROM account_name_parses ${where}`, values,
    )).rows[0].n);
    const result = await this.pool.query(
      `SELECT ${PARSE_COLUMNS} FROM account_name_parses ${where}
       ORDER BY media, account_id LIMIT $5 OFFSET $6`,
      [...values, pageSize, (page - 1) * pageSize],
    );
    return {
      items: result.rows.map((row) => mapParse(row as Record<string, unknown>, approved.workspaceId)),
      total,
    };
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
    assertGovernance(approved.role);
    if (!MEDIA.test(input.media) || !parseStatusSchema.safeParse(input.status).success) {
      throw new R014RepositoryError("INVALID_INPUT");
    }
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
    assertGovernance(approved.role);
    if (!MEDIA.test(media)) throw new R014RepositoryError("INVALID_INPUT");
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
    assertGovernance(approved.role);
    if (!Array.isArray(items) || items.length === 0 || items.length > 500) {
      throw new R014RepositoryError("INVALID_INPUT");
    }
    for (const item of items) {
      if (!MEDIA.test(item.media) || typeof item.accountId !== "string" || item.accountId.length === 0) {
        throw new R014RepositoryError("INVALID_INPUT");
      }
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
}
