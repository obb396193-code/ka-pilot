import type {
  SemanticQueryScope,
  SemanticSortField,
  SemanticTableQuery,
  SortDirection,
} from "./semantic-query-types.js";

export interface NormalizedTableQuery extends SemanticQueryScope {
  page: number;
  pageSize: number;
  sortBy: SemanticSortField;
  sortDirection: SortDirection;
}

export interface SqlFilter {
  whereSql: string;
  values: unknown[];
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

function isValidIsoDate(value: string): boolean {
  if (!ISO_DATE.test(value)) {
    return false;
  }
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(parsed.valueOf()) && parsed.toISOString().slice(0, 10) === value;
}

export function validateScope(scope: SemanticQueryScope): void {
  if (!scope.workspaceId) {
    throw new Error("workspaceId is required");
  }
  if (!isValidIsoDate(scope.dateFrom) || !isValidIsoDate(scope.dateTo)) {
    throw new Error("dateFrom and dateTo must use valid YYYY-MM-DD dates");
  }
  if (scope.dateFrom > scope.dateTo) {
    throw new Error("dateFrom must not be after dateTo");
  }
}

export function normalizeTableQuery(input: SemanticTableQuery): NormalizedTableQuery {
  validateScope(input);
  const page = input.page ?? 1;
  const pageSize = input.pageSize ?? 50;
  const sortBy = input.sortBy ?? "ds";
  const sortDirection = input.sortDirection ?? "desc";
  const supportedSortFields: readonly string[] = [
    "ds",
    "accountId",
    "cost",
    "realCpa",
    "computedAt",
  ];
  if (!Number.isInteger(page) || page < 1) {
    throw new Error("page must be a positive integer");
  }
  if (!Number.isInteger(pageSize) || pageSize < 1 || pageSize > 500) {
    throw new Error("pageSize must be between 1 and 500");
  }
  if (!supportedSortFields.includes(sortBy)) {
    throw new Error(`Unsupported sort field: ${String(sortBy)}`);
  }
  if (sortDirection !== "asc" && sortDirection !== "desc") {
    throw new Error(`Unsupported sort direction: ${String(sortDirection)}`);
  }
  return { ...input, page, pageSize, sortBy, sortDirection };
}

export function buildMetricFilter(
  scope: SemanticQueryScope,
  options: { includeTaskFilter?: boolean } = {},
): SqlFilter {
  validateScope(scope);
  const values: unknown[] = [scope.workspaceId, scope.dateFrom, scope.dateTo];
  const conditions = [
    "metric.workspace_id = $1",
    "metric.ds BETWEEN $2::date AND $3::date",
  ];
  const add = (condition: (placeholder: string) => string, value: unknown): void => {
    values.push(value);
    conditions.push(condition(`$${values.length}`));
  };
  if (scope.filters?.accountId) {
    add((placeholder) => `metric.account_id = ${placeholder}`, scope.filters.accountId);
  }
  if (scope.filters?.accountIds) {
    if (scope.filters.accountIds.length === 0) {
      conditions.push("false");
    } else {
      add(
        (placeholder) => `metric.account_id = ANY(${placeholder}::text[])`,
        scope.filters.accountIds,
      );
    }
  }
  if (scope.filters?.accountScopes) {
    const encoded = new Set<string>();
    for (const account of scope.filters.accountScopes) {
      if (account.media.trim() === "" || account.accountId.trim() === "") {
        throw new Error("accountScopes require media and accountId");
      }
      const key = JSON.stringify([account.media, account.accountId]);
      if (encoded.has(key)) throw new Error("accountScopes contain a duplicate tuple");
      encoded.add(key);
    }
    if (scope.filters.accountScopes.length === 0) {
      conditions.push("false");
    } else {
      add(
        (placeholder) => `EXISTS (
          SELECT 1
          FROM jsonb_to_recordset(${placeholder}::jsonb)
            AS allowed(media text, account_id text)
          WHERE allowed.media = metric.media
            AND allowed.account_id = metric.account_id
        )`,
        JSON.stringify(scope.filters.accountScopes.map((account) => ({
          media: account.media,
          account_id: account.accountId,
        }))),
      );
    }
  }
  if (scope.filters?.ownerUserId) {
    add((placeholder) => `account.owner_user_id = ${placeholder}::uuid`, scope.filters.ownerUserId);
  }
  if (scope.filters?.media) {
    add((placeholder) => `account.media = ${placeholder}`, scope.filters.media);
  }
  if (scope.filters?.dataAnomaly !== undefined) {
    add((placeholder) => `metric.data_anomaly = ${placeholder}`, scope.filters.dataAnomaly);
  }
  if (scope.filters?.taskId && options.includeTaskFilter !== false) {
    add(
      (placeholder) => `EXISTS (
        SELECT 1
        FROM task_accounts AS filtered_relation
        WHERE filtered_relation.workspace_id = metric.workspace_id
          AND filtered_relation.media = metric.media
          AND filtered_relation.account_id = metric.account_id
          AND filtered_relation.task_id = ${placeholder}
          AND filtered_relation.valid_from <= metric.ds
          AND (filtered_relation.valid_to IS NULL OR filtered_relation.valid_to >= metric.ds)
      )`,
      scope.filters.taskId,
    );
  }
  return { whereSql: conditions.join("\n         AND "), values };
}

export function tableOrderBy(
  sortBy: SemanticSortField,
  direction: SortDirection,
): string {
  const columns: Record<SemanticSortField, string> = {
    ds: "metric.ds",
    accountId: "metric.account_id",
    cost: "metric.cost",
    realCpa: "metric.real_cpa",
    computedAt: "metric.computed_at",
  };
  const sqlDirection = direction === "asc" ? "ASC" : "DESC";
  return `${columns[sortBy]} ${sqlDirection} NULLS LAST, metric.ds DESC, metric.account_id ASC`;
}

export function nullableNumber(value: string | number | null | undefined): number | null {
  if (value === null || value === undefined) {
    return null;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export function isoTimestamp(value: string | Date): string {
  return value instanceof Date ? value.toISOString() : value;
}
