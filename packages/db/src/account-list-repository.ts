import type { Pool, QueryResult, QueryResultRow } from "pg";

import {
  accountListRequestSchema,
  taskListCalendarDateSchema,
  type AccountListRequest,
} from "@ka/domain";

import { isoTimestamp, nullableNumber } from "./semantic-query-support.js";
import { ACCOUNT_LIST_COUNT_SQL, ACCOUNT_LIST_PAGE_SQL } from "./account-list-sql.js";
import { loadWorkspaceSyncReadiness } from "./workspace-sync-readiness.js";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export interface AccountListAccountScope { media: string; accountId: string }

export interface AccountListRepositoryQuery extends Partial<AccountListRequest> {
  workspaceId: string;
  requestingUserId: string;
  businessDate: string;
  scopeKind: "explicit_accounts" | "team_workspace_readonly";
  allowedAccounts: readonly AccountListAccountScope[];
}

export interface AccountListRepositoryClient {
  query<Row extends QueryResultRow = QueryResultRow>(
    sql: string,
    values?: unknown[],
  ): Promise<QueryResult<Row>>;
  release(): void;
}

export interface AccountListRepositoryPool {
  connect(): Promise<AccountListRepositoryClient>;
}

export interface AccountListLinkedTask { taskId: string; taskName: string | null }

export class AccountListRepositoryContractError extends Error {
  constructor(message = "Account list repository returned a value outside the canonical contract") {
    super(message);
    this.name = "AccountListRepositoryContractError";
  }
}

export interface AccountListRepositoryRow {
  workspaceId: string;
  media: string;
  accountId: string;
  accountName: string | null;
  status: string | null;
  lifecycleStage: string | null;
  starred: boolean;
  tags: string[];
  owner: { userId: string; displayName: string } | null;
  linkedTasks: AccountListLinkedTask[];
  metricDate: string | null;
  cost: number | null;
  realConversion: number | null;
  assessmentPrice: number | null;
  dataAsOf: string | null;
  balance: number | null;
  balanceSyncedAt: string | null;
}

export interface AccountListRepositoryResult {
  rows: AccountListRepositoryRow[];
  page: number;
  pageSize: number;
  total: number;
  coverageComplete: boolean;
  metricsComplete: boolean;
  initialFullComplete: boolean;
}

interface CountRow extends QueryResultRow {
  total: string | number;
  coverage_complete: boolean;
  metrics_complete: boolean;
}

interface ListRow extends QueryResultRow {
  workspace_id: string;
  media: string;
  account_id: string;
  account_name: string | null;
  status: string | null;
  lifecycle_stage: string | null;
  is_starred: boolean;
  tags: unknown;
  owner_user_id: string | null;
  owner_display_name: string | null;
  linked_tasks: unknown;
  metric_date: string | null;
  cost: string | number | null;
  real_conversion: string | number | null;
  assessment_price_snapshot: string | number | null;
  data_as_of: Date | string | null;
  balance: string | number | null;
  balance_synced_at: Date | string | null;
}

interface NormalizedQuery extends AccountListRequest {
  media: "KUAISHOU";
  workspaceId: string;
  requestingUserId: string;
  businessDate: string;
  scopeKind: "explicit_accounts" | "team_workspace_readonly";
  allowedAccounts: AccountListAccountScope[];
}

function nonnegativeInteger(value: string | number, field: string): number {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 0) {
    throw new AccountListRepositoryContractError(`${field} returned an invalid count`);
  }
  return parsed;
}

function normalizeStringArray(value: unknown, field: string): string[] {
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string")) {
    throw new AccountListRepositoryContractError(`${field} returned an invalid value`);
  }
  return [...value];
}

function normalizeLinkedTasks(value: unknown): AccountListLinkedTask[] {
  if (!Array.isArray(value)) {
    throw new AccountListRepositoryContractError("linkedTasks returned an invalid value");
  }
  const tasks = value.map((item) => {
    if (
      typeof item !== "object" || item === null ||
      typeof (item as { taskId?: unknown }).taskId !== "string" ||
      ((item as { taskName?: unknown }).taskName !== null &&
       typeof (item as { taskName?: unknown }).taskName !== "string")
    ) throw new AccountListRepositoryContractError("linkedTasks returned an invalid item");
    return {
      taskId: (item as { taskId: string }).taskId,
      taskName: (item as { taskName: string | null }).taskName,
    };
  }).sort((left, right) => left.taskId < right.taskId ? -1 : left.taskId > right.taskId ? 1 : 0);
  for (let index = 1; index < tasks.length; index += 1) {
    if (tasks[index - 1]!.taskId === tasks[index]!.taskId) {
      throw new AccountListRepositoryContractError("linkedTasks returned a duplicate taskId");
    }
  }
  return tasks;
}

function normalizeQuery(input: AccountListRepositoryQuery): NormalizedQuery {
  if (!UUID_PATTERN.test(input.workspaceId)) throw new Error("workspaceId must be a UUID");
  if (!UUID_PATTERN.test(input.requestingUserId)) throw new Error("requestingUserId must be a UUID");
  const businessDate = taskListCalendarDateSchema.parse(input.businessDate);
  if (input.scopeKind !== "explicit_accounts" && input.scopeKind !== "team_workspace_readonly") {
    throw new Error("scopeKind is invalid");
  }
  const parsed = accountListRequestSchema.parse({
    page: input.page,
    pageSize: input.pageSize,
    q: input.q,
    media: input.media,
    stage: input.stage,
    starred: input.starred,
    tags: input.tags,
    ownerUserId: input.ownerUserId,
    status: input.status,
  });
  const seen = new Set<string>();
  const normalizedScope = input.allowedAccounts.map((account) => {
    const media = account.media.trim();
    const accountId = account.accountId.trim();
    if (media === "" || accountId === "") throw new Error("allowedAccounts require media and accountId");
    const key = JSON.stringify([media, accountId]);
    if (seen.has(key)) throw new Error("allowedAccounts contain a duplicate tuple");
    seen.add(key);
    return { media, accountId };
  });
  const media = parsed.media ?? "KUAISHOU";
  if (input.scopeKind === "team_workspace_readonly" && normalizedScope.length !== 0) {
    throw new Error("team workspace scope must not carry account grants");
  }
  return {
    ...parsed,
    media,
    workspaceId: input.workspaceId,
    requestingUserId: input.requestingUserId,
    businessDate,
    scopeKind: input.scopeKind,
    allowedAccounts: normalizedScope.filter((account) => account.media === media),
  };
}

function commonValues(query: NormalizedQuery): unknown[] {
  return [
    query.workspaceId,
    query.businessDate,
    query.scopeKind,
    JSON.stringify(query.allowedAccounts.map((account) => ({
      media: account.media,
      account_id: account.accountId,
    }))),
    query.q === undefined || query.q === "" ? null : query.q,
    query.media,
    query.stage ?? null,
    query.starred ?? null,
    query.tags ?? null,
    query.ownerUserId ?? null,
    query.status ?? null,
  ];
}

function mapListRow(row: ListRow): AccountListRepositoryRow {
  try {
    return {
      workspaceId: row.workspace_id,
      media: row.media,
      accountId: row.account_id,
      accountName: row.account_name,
      status: row.status,
      lifecycleStage: row.lifecycle_stage,
      starred: row.is_starred,
      tags: normalizeStringArray(row.tags, "tags"),
      owner: row.owner_user_id === null || row.owner_display_name === null
        ? null
        : { userId: row.owner_user_id, displayName: row.owner_display_name },
      linkedTasks: normalizeLinkedTasks(row.linked_tasks),
      metricDate: row.metric_date,
      cost: nullableNumber(row.cost),
      realConversion: nullableNumber(row.real_conversion),
      assessmentPrice: nullableNumber(row.assessment_price_snapshot),
      dataAsOf: row.data_as_of === null ? null : isoTimestamp(row.data_as_of),
      balance: nullableNumber(row.balance),
      balanceSyncedAt: row.balance === null || row.balance_synced_at === null
        ? null
        : isoTimestamp(row.balance_synced_at),
    };
  } catch (error) {
    if (error instanceof AccountListRepositoryContractError) throw error;
    throw new AccountListRepositoryContractError("Account list row is outside the canonical contract");
  }
}

async function rollback(client: AccountListRepositoryClient): Promise<void> {
  try { await client.query("ROLLBACK"); } catch { /* Preserve original error. */ }
}

export class AccountListRepository {
  private readonly pool: AccountListRepositoryPool;

  constructor(pool: Pool | AccountListRepositoryPool) { this.pool = pool; }

  async list(input: AccountListRepositoryQuery): Promise<AccountListRepositoryResult> {
    const query = normalizeQuery(input);
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");
      const values = commonValues(query);
      const countResult = await client.query<CountRow>(ACCOUNT_LIST_COUNT_SQL, values);
      const count = countResult.rows[0];
      if (!count) {
        throw new AccountListRepositoryContractError("account list count query returned no row");
      }
      const initialFullComplete = await loadWorkspaceSyncReadiness(client, {
        workspaceId: query.workspaceId,
        requestingUserId: query.requestingUserId,
        allowedAccounts: query.allowedAccounts,
      });
      const pageResult = await client.query<ListRow>(ACCOUNT_LIST_PAGE_SQL, [
        ...values,
        query.pageSize,
        (query.page - 1) * query.pageSize,
      ]);
      await client.query("COMMIT");
      return {
        rows: pageResult.rows.map(mapListRow),
        page: query.page,
        pageSize: query.pageSize,
        total: nonnegativeInteger(count.total, "total"),
        coverageComplete: count.coverage_complete,
        metricsComplete: count.metrics_complete,
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
