import type { Pool, QueryResult, QueryResultRow } from "pg";

import {
  taskListCalendarDateSchema,
  workItemListRequestSchema,
  type WorkItemListRequest,
} from "@ka/domain";

import { isoTimestamp } from "./semantic-query-support.js";
import { loadWorkspaceSyncReadiness } from "./workspace-sync-readiness.js";
import { WORK_ITEM_LIST_COUNT_SQL, WORK_ITEM_LIST_PAGE_SQL } from "./work-item-list-sql.js";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export interface WorkItemListAccountScope { media: string; accountId: string }

export interface WorkItemListRepositoryQuery extends Partial<WorkItemListRequest> {
  workspaceId: string;
  requestingUserId: string;
  businessDate: string;
  scopeKind: "explicit_accounts" | "team_workspace_readonly";
  allowedAccounts: readonly WorkItemListAccountScope[];
}

export interface WorkItemListRepositoryClient {
  query<Row extends QueryResultRow = QueryResultRow>(sql: string, values?: unknown[]): Promise<QueryResult<Row>>;
  release(): void;
}

export interface WorkItemListRepositoryPool { connect(): Promise<WorkItemListRepositoryClient> }

export class WorkItemListRepositoryContractError extends Error {
  constructor(message = "Work item list repository returned a value outside the canonical contract") {
    super(message);
    this.name = "WorkItemListRepositoryContractError";
  }
}

export interface WorkItemListRepositoryRow {
  workItemId: string;
  workspaceId: string;
  type: string;
  status: string;
  severity: string | null;
  title: string;
  media: string | null;
  accountId: string | null;
  accountName: string | null;
  taskId: string | null;
  taskName: string | null;
  assigneeUserId: string | null;
  assigneeDisplayName: string | null;
  creatorUserId: string | null;
  slaDue: string | null;
  createdAt: string;
  resolvedAt: string | null;
}

export interface WorkItemListRepositoryResult {
  rows: WorkItemListRepositoryRow[];
  page: number;
  pageSize: number;
  total: number;
  accountItemCount: number;
  dataAsOf: string | null;
  coverageComplete: boolean;
  initialFullComplete: boolean;
}

interface CountRow extends QueryResultRow {
  total: string | number;
  account_item_count: string | number;
  data_as_of: Date | string | null;
  coverage_complete: boolean;
}

interface ListRow extends QueryResultRow {
  id: string;
  workspace_id: string;
  type: string;
  status: string;
  severity: string | null;
  title: string;
  media: string | null;
  account_id: string | null;
  account_name: string | null;
  task_id: string | null;
  task_name: string | null;
  assignee: string | null;
  assignee_display_name: string | null;
  creator: string | null;
  sla_due: Date | string | null;
  created_at: Date | string;
  resolved_at: Date | string | null;
}

interface NormalizedQuery extends WorkItemListRequest {
  workspaceId: string;
  requestingUserId: string;
  businessDate: string;
  scopeKind: "explicit_accounts" | "team_workspace_readonly";
  allowedAccounts: WorkItemListAccountScope[];
}

function count(value: string | number, field: string): number {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 0) {
    throw new WorkItemListRepositoryContractError(`${field} returned an invalid count`);
  }
  return parsed;
}

function normalizeQuery(input: WorkItemListRepositoryQuery): NormalizedQuery {
  if (!UUID_PATTERN.test(input.workspaceId)) throw new Error("workspaceId must be a UUID");
  if (!UUID_PATTERN.test(input.requestingUserId)) throw new Error("requestingUserId must be a UUID");
  if (input.scopeKind !== "explicit_accounts" && input.scopeKind !== "team_workspace_readonly") {
    throw new Error("scopeKind is invalid");
  }
  const businessDate = taskListCalendarDateSchema.parse(input.businessDate);
  const parsed = workItemListRequestSchema.parse({
    page: input.page,
    pageSize: input.pageSize,
    q: input.q,
    status: input.status,
    severity: input.severity,
    type: input.type,
    assigneeUserId: input.assigneeUserId,
    taskId: input.taskId,
  });
  const seen = new Set<string>();
  const allowedAccounts = input.allowedAccounts.map((account) => {
    const media = account.media.trim();
    const accountId = account.accountId.trim();
    if (media === "" || accountId === "") throw new Error("allowedAccounts require media and accountId");
    const key = JSON.stringify([media, accountId]);
    if (seen.has(key)) throw new Error("allowedAccounts contain a duplicate tuple");
    seen.add(key);
    return { media, accountId };
  });
  if (input.scopeKind === "team_workspace_readonly" && allowedAccounts.length !== 0) {
    throw new Error("team workspace scope must not carry account grants");
  }
  return {
    ...parsed,
    workspaceId: input.workspaceId,
    requestingUserId: input.requestingUserId,
    businessDate,
    scopeKind: input.scopeKind,
    allowedAccounts,
  };
}

function values(query: NormalizedQuery): unknown[] {
  return [
    query.workspaceId,
    query.requestingUserId,
    query.scopeKind,
    JSON.stringify(query.allowedAccounts.map((account) => ({ media: account.media, account_id: account.accountId }))),
    query.q === undefined || query.q === "" ? null : query.q,
    query.status ?? null,
    query.severity ?? null,
    query.type ?? null,
    query.assigneeUserId ?? null,
    query.taskId ?? null,
  ];
}

function timestamp(value: Date | string | null): string | null {
  return value === null ? null : isoTimestamp(value);
}

function mapRow(row: ListRow): WorkItemListRepositoryRow {
  try {
    return {
      workItemId: row.id,
      workspaceId: row.workspace_id,
      type: row.type,
      status: row.status,
      severity: row.severity,
      title: row.title,
      media: row.media,
      accountId: row.account_id,
      accountName: row.account_name,
      taskId: row.task_id,
      taskName: row.task_name,
      assigneeUserId: row.assignee,
      assigneeDisplayName: row.assignee_display_name,
      creatorUserId: row.creator,
      slaDue: timestamp(row.sla_due),
      createdAt: timestamp(row.created_at) as string,
      resolvedAt: timestamp(row.resolved_at),
    };
  } catch {
    throw new WorkItemListRepositoryContractError("Work item row timestamps are invalid");
  }
}

async function rollback(client: WorkItemListRepositoryClient): Promise<void> {
  try { await client.query("ROLLBACK"); } catch { /* Preserve original failure. */ }
}

export class WorkItemListRepository {
  private readonly pool: WorkItemListRepositoryPool;
  constructor(pool: Pool | WorkItemListRepositoryPool) { this.pool = pool; }

  async list(input: WorkItemListRepositoryQuery): Promise<WorkItemListRepositoryResult> {
    const query = normalizeQuery(input);
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");
      const common = values(query);
      const countResult = await client.query<CountRow>(WORK_ITEM_LIST_COUNT_SQL, common);
      const summary = countResult.rows[0];
      if (!summary) {
        throw new WorkItemListRepositoryContractError("work item list count query returned no row");
      }
      const initialFullComplete = query.scopeKind === "team_workspace_readonly"
        ? false
        : await loadWorkspaceSyncReadiness(client, {
            workspaceId: query.workspaceId,
            requestingUserId: query.requestingUserId,
            allowedAccounts: query.allowedAccounts,
          });
      const pageResult = await client.query<ListRow>(WORK_ITEM_LIST_PAGE_SQL, [
        ...common, query.pageSize, (query.page - 1) * query.pageSize,
      ]);
      await client.query("COMMIT");
      return {
        rows: pageResult.rows.map(mapRow),
        page: query.page,
        pageSize: query.pageSize,
        total: count(summary.total, "total"),
        accountItemCount: count(summary.account_item_count, "accountItemCount"),
        dataAsOf: timestamp(summary.data_as_of),
        coverageComplete: summary.coverage_complete,
        initialFullComplete,
      };
    } catch (error) {
      await rollback(client);
      throw error;
    } finally {
      client.release();
    }
  }
}
