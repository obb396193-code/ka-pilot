import {
  SEARCH_LIMIT_PER_TYPE, normalizeSearchQuery, orderSearchItems, searchTypeSchema, toLikePattern,
  type ApprovedWorkspaceAuthContext, type SearchItem, type SearchType,
} from "@ka/domain";
import type { Pool } from "pg";

import { R014RepositoryError, approveAuth } from "./workspace-authority.js";

/**
 * v1.7.4 G6 全局搜索：五类、每类 ≤5、**无 LLM**（纯 ILIKE 包含匹配）。
 *
 * `material` / `document` 的表分别在 migration 016（R-015）与知识库批次，现在还没有；
 * 缺哪类就在 `unavailable` 里如实报出来，不返回空数组冒充「搜过了没有」。
 *
 * v1.9 ⑦ 已裁：**后端不出 subtitle**，只出结构化 `meta` 机器字段，中文由 fe 组装。
 */
export interface SearchOutcome {
  items: SearchItem[];
  unavailable: SearchType[];
}

/** 只把真有值的键放进 meta：缺的键就不出现，不用空串占位。 */
function meta(entries: Record<string, string | number | null | undefined>): Record<string, string | number> {
  const result: Record<string, string | number> = {};
  for (const [key, value] of Object.entries(entries)) {
    if (value === null || value === undefined || value === "") continue;
    result[key] = value;
  }
  return result;
}

export class SearchRepository {
  constructor(private readonly pool: Pool) {}

  async search(auth: ApprovedWorkspaceAuthContext, rawQuery: unknown, rawType?: unknown): Promise<SearchOutcome> {
    const approved = approveAuth(auth);
    const query = normalizeSearchQuery(rawQuery);
    if (query === null) throw new R014RepositoryError("INVALID_INPUT");
    let types: SearchType[] = [...searchTypeSchema.options];
    if (rawType !== undefined && rawType !== null) {
      const parsed = searchTypeSchema.safeParse(rawType);
      if (!parsed.success) throw new R014RepositoryError("INVALID_INPUT");
      types = [parsed.data];
    }
    const pattern = toLikePattern(query);
    const items: SearchItem[] = [];
    const unavailable: SearchType[] = [];

    if (types.includes("account")) items.push(...await this.accounts(approved, pattern));
    if (types.includes("task")) items.push(...await this.tasks(approved, pattern));
    if (types.includes("work_item")) items.push(...await this.workItems(approved, pattern));
    for (const type of ["material", "document"] as const) {
      if (!types.includes(type)) continue;
      const table = type === "material" ? "materials" : "knowledge_items";
      const exists = await this.pool.query("SELECT to_regclass($1) AS name", [`public.${table}`]);
      // 表还没建：报缺，不用空结果冒充「没搜到」。
      if (exists.rows[0]?.name === null) unavailable.push(type);
    }
    return { items: orderSearchItems(items), unavailable };
  }

  /** 个人空间只搜有 live 授权的户；团队空间只读全量。 */
  private async accounts(auth: ApprovedWorkspaceAuthContext, pattern: string): Promise<SearchItem[]> {
    const personal = auth.workspaceKind === "personal";
    const result = await this.pool.query(
      `SELECT account.media, account.account_id, account.account_name, account.lifecycle_stage, account.product_name
       FROM accounts AS account
       ${personal ? `JOIN account_access_grants AS grant_row ON grant_row.workspace_id=account.workspace_id
         AND grant_row.media=account.media AND grant_row.account_id=account.account_id
       JOIN workspace_memberships AS member ON member.workspace_id=grant_row.workspace_id
         AND member.identity_id=grant_row.identity_id AND member.is_active=true AND member.user_id=$3` : ""}
       WHERE account.workspace_id=$1
         AND (coalesce(account.account_name,'') ILIKE $2 ESCAPE '\\' OR account.account_id ILIKE $2 ESCAPE '\\')
       ORDER BY account.account_name NULLS LAST, account.account_id
       LIMIT ${SEARCH_LIMIT_PER_TYPE}`,
      personal ? [auth.workspaceId, pattern, auth.userId] : [auth.workspaceId, pattern],
    );
    return (result.rows as Record<string, unknown>[]).map((row) => ({
      type: "account" as const,
      id: `${String(row.media)}:${String(row.account_id)}`,
      title: (row.account_name as string | null) ?? String(row.account_id),
      meta: meta({ status: row.lifecycle_stage as string | null, taskName: row.product_name as string | null }),
      href: `/accounts/${String(row.media)}/${String(row.account_id)}`,
      workspaceKind: auth.workspaceKind,
    }));
  }

  private async tasks(auth: ApprovedWorkspaceAuthContext, pattern: string): Promise<SearchItem[]> {
    const result = await this.pool.query(
      `SELECT task.task_id, task.task_name, task.stage,
              (SELECT count(DISTINCT (link.media, link.account_id))::int FROM task_accounts AS link
               WHERE link.workspace_id=task.workspace_id AND link.task_id=task.task_id) AS account_count
       FROM tasks AS task
       WHERE task.workspace_id=$1
         AND (coalesce(task.task_name,'') ILIKE $2 ESCAPE '\\' OR task.task_id ILIKE $2 ESCAPE '\\')
       ORDER BY task.task_name NULLS LAST, task.task_id
       LIMIT ${SEARCH_LIMIT_PER_TYPE}`,
      [auth.workspaceId, pattern],
    );
    return (result.rows as Record<string, unknown>[]).map((row) => ({
      type: "task" as const,
      id: String(row.task_id),
      title: (row.task_name as string | null) ?? String(row.task_id),
      meta: meta({ stage: row.stage as string | null, accountCount: Number(row.account_count) }),
      href: `/tasks/${String(row.task_id)}`,
      workspaceKind: auth.workspaceKind,
    }));
  }

  /** 路由用 v1.7.6 正名后的 `/work-items/[id]`；fixture 里的 `/?tab=today&item=` 是改名前的写法。 */
  private async workItems(auth: ApprovedWorkspaceAuthContext, pattern: string): Promise<SearchItem[]> {
    const result = await this.pool.query(
      `SELECT id, title, severity, status FROM work_items
       WHERE workspace_id=$1 AND coalesce(title,'') ILIKE $2 ESCAPE '\\'
       ORDER BY created_at DESC LIMIT ${SEARCH_LIMIT_PER_TYPE}`,
      [auth.workspaceId, pattern],
    );
    return (result.rows as Record<string, unknown>[]).map((row) => ({
      type: "work_item" as const,
      id: String(row.id),
      title: (row.title as string | null) ?? "工作项",
      meta: meta({ severity: row.severity as string | null, status: row.status as string | null }),
      href: `/work-items/${String(row.id)}`,
      workspaceKind: auth.workspaceKind,
    }));
  }
}
