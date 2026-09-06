import {
  authorityUseCaseSchema,
  canonicalRowSchemaVersionByQueryId,
  dataQueryIdSchema,
  dataViewModeSchema,
  type AuthorityUseCase,
  type DataQueryId,
  type DataViewMode,
} from "@ka/domain";
import { z } from "zod";

const RESOLVED_QUERY = Symbol("resolved-data-query");
const AUTHORITY_POLICY_VERSION = "2026-08-24";
const accountIdSchema = z.string().min(1).max(128).regex(/^[A-Za-z0-9_-]+$/);
const mediaSchema = z.string().min(1).max(32).regex(/^[A-Z0-9_]+$/);

export type AccountScope = "optional_many" | "required_one";
export type QueryOutputShape = "aggregate" | "account_rows";
export type AuthorityDefaultSource = "ka_data" | "platform" | "source_versioned";

export interface QueryAuthorityPolicy {
  policyVersion: string;
  useCase: AuthorityUseCase;
  defaultSource: AuthorityDefaultSource;
}

export interface NormalizedQueryParams {
  dateFrom: string;
  dateTo: string;
  media?: string;
  accountIds?: string[];
  accountId?: string;
  page?: number;
  pageSize?: number;
}

export interface KaDataQueryPlan {
  backend: "sqlite";
  sql: string;
  limit: number;
  queryTemplateVersion: string;
}

export interface ScopedAccount {
  media: string;
  accountId: string;
}

export interface ResolvedDataQuery {
  readonly queryId: DataQueryId;
  readonly dataView: DataViewMode;
  readonly params: NormalizedQueryParams;
  readonly supportedViews: readonly DataViewMode[];
  readonly maxDateSpanDays: number;
  readonly maxRows: number;
  readonly accountScope: AccountScope;
  readonly outputShape: QueryOutputShape;
  readonly queryTemplateVersion: string;
  readonly metricVersion: string;
  readonly rowSchemaVersion: string;
  readonly authorityPolicy: QueryAuthorityPolicy;
  readonly [RESOLVED_QUERY]: true;
}

type SqlAccountScope = { kind: "explicit_accounts"; accounts: readonly ScopedAccount[] } | { kind: "team_workspace_readonly" };

interface QueryDefinition {
  queryId: DataQueryId;
  supportedViews: readonly DataViewMode[];
  maxDateSpanDays: number;
  maxRows: number;
  accountScope: AccountScope;
  outputShape: QueryOutputShape;
  queryTemplateVersion: string;
  metricVersion: string;
  paramsSchema: z.ZodType<NormalizedQueryParams>;
  authorityPolicy: QueryAuthorityPolicy;
  buildSql?: (params: NormalizedQueryParams, scope: SqlAccountScope) => string;
}

export class QueryRegistryError extends Error {
  constructor(
    readonly code: "QUERY_NOT_ALLOWED" | "VIEW_UNSUPPORTED" | "INVALID_REQUEST",
    message: string,
  ) {
    super(message);
    this.name = "QueryRegistryError";
  }
}

function parseCalendarDate(value: string): string {
  if (!/^(?:\d{8}|\d{4}-\d{2}-\d{2})$/.test(value)) throw new Error("date must use YYYY-MM-DD or YYYYMMDD");
  const compact = value.replaceAll("-", "");
  if (!/^\d{8}$/.test(compact)) throw new Error("date must use YYYY-MM-DD or YYYYMMDD");
  const iso = `${compact.slice(0, 4)}-${compact.slice(4, 6)}-${compact.slice(6, 8)}`;
  const parsed = new Date(`${iso}T00:00:00.000Z`);
  if (Number.isNaN(parsed.valueOf()) || parsed.toISOString().slice(0, 10) !== iso) {
    throw new Error("date must be a valid calendar date");
  }
  return iso;
}

const dateInputSchema = z.string().transform((value, context) => {
  try {
    return parseCalendarDate(value);
  } catch (error) {
    context.addIssue({ code: "custom", message: error instanceof Error ? error.message : "invalid date" });
    return z.NEVER;
  }
});

const commonDateFields = {
  date: dateInputSchema.optional(),
  dateFrom: dateInputSchema.optional(),
  dateTo: dateInputSchema.optional(),
  date_from: dateInputSchema.optional(),
  date_to: dateInputSchema.optional(),
  media: mediaSchema.optional(),
  accountIds: z.array(accountIdSchema).min(1).max(1_000).optional(),
};

function normalizeDateParams(input: {
  date?: string;
  dateFrom?: string;
  dateTo?: string;
  date_from?: string;
  date_to?: string;
  media?: string;
  accountIds?: string[];
  accountId?: string;
  page?: number;
  pageSize?: number;
}): NormalizedQueryParams {
  const camel = input.dateFrom !== undefined || input.dateTo !== undefined;
  const snake = input.date_from !== undefined || input.date_to !== undefined;
  if (camel && snake) throw new Error("date range spellings cannot be mixed");
  const dateFrom = input.date ?? input.dateFrom ?? input.date_from;
  const dateTo = input.date ?? input.dateTo ?? input.date_to;
  if (dateFrom === undefined || dateTo === undefined) {
    throw new Error("provide date or both dateFrom and dateTo");
  }
  if (input.date !== undefined && (camel || snake)) {
    throw new Error("date cannot be combined with dateFrom/dateTo");
  }
  return {
    dateFrom,
    dateTo,
    ...(input.media === undefined ? {} : { media: input.media }),
    ...(input.accountIds === undefined ? {} : { accountIds: input.accountIds }),
    ...(input.accountId === undefined ? {} : { accountId: input.accountId }),
    ...(input.page === undefined ? {} : { page: input.page }),
    ...(input.pageSize === undefined ? {} : { pageSize: input.pageSize }),
  };
}

function normalizedSchema<Shape extends z.ZodRawShape>(shape: Shape): z.ZodType<NormalizedQueryParams> {
  return z.object(shape).strict().transform((input, context) => {
    try {
      return normalizeDateParams(input);
    } catch (error) {
      context.addIssue({
        code: "custom",
        message: error instanceof Error ? error.message : "invalid date parameters",
      });
      return z.NEVER;
    }
  });
}

const intervalSchema = normalizedSchema(commonDateFields);
const tableSchema = normalizedSchema({
  ...commonDateFields,
  page: z.number().int().min(1).default(1),
  pageSize: z.number().int().min(1).max(500).default(50),
});
const detailSchema = normalizedSchema({
  date: commonDateFields.date,
  dateFrom: commonDateFields.dateFrom,
  dateTo: commonDateFields.dateTo,
  date_from: commonDateFields.date_from,
  date_to: commonDateFields.date_to,
  media: mediaSchema.optional(),
  accountId: accountIdSchema,
});

function authority(
  useCase: AuthorityUseCase,
  defaultSource: AuthorityDefaultSource,
): QueryAuthorityPolicy {
  return { policyVersion: AUTHORITY_POLICY_VERSION, useCase, defaultSource };
}

function sqlString(value: string): string {
  return `'${value.replaceAll("'", "''")}'`;
}

function compactDate(value: string): string {
  return value.replaceAll("-", "");
}

function whereClause(
  params: NormalizedQueryParams,
  scope: SqlAccountScope,
): string {
  const byMedia = new Map<string, string[]>();
  for (const account of scope.kind === "explicit_accounts" ? scope.accounts : []) {
    const accountIds = byMedia.get(account.media) ?? [];
    accountIds.push(account.accountId);
    byMedia.set(account.media, accountIds);
  }
  const accountScope = scope.kind === "team_workspace_readonly" ? "1 = 1" : byMedia.size === 0
    ? "1 = 0"
    : `(${[...byMedia.entries()]
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([media, accountIds]) =>
          `(media = ${sqlString(media)} AND account_id IN (${[...new Set(accountIds)].sort().map(sqlString).join(", ")}))`,
        )
        .join(" OR ")})`;
  const filters = [
    `ds BETWEEN ${compactDate(params.dateFrom)} AND ${compactDate(params.dateTo)}`,
    accountScope,
  ];
  if (params.media !== undefined) filters.push(`media = ${sqlString(params.media)}`);
  const requested = params.accountId === undefined ? params.accountIds : [params.accountId];
  if (requested !== undefined) filters.push(`account_id IN (${requested.map(sqlString).join(", ")})`);
  return filters.join(" AND ");
}

// Static identifiers only. SQLite SUM coerces invalid text to zero; expose corruption
// to the strict adapter before considering missing-member propagation.
function completeSum(column: "cost_yuan" | "show" | "click" | "conv" | "cash_yuan"): string {
  return `CASE WHEN MAX(CASE WHEN typeof(${column}) NOT IN ('integer', 'real', 'null') OR ABS(CAST(${column} AS REAL)) > 1.7976931348623157e308 THEN 1 ELSE 0 END) = 1 OR ABS(SUM(${column})) > 1.7976931348623157e308 THEN 'INVALID_METRIC' WHEN COUNT(${column}) = COUNT(*) AND COUNT(*) > 0 THEN ROUND(SUM(${column}), 6) ELSE NULL END`;
}

function expectedAccountDays(params: NormalizedQueryParams, accountScope: SqlAccountScope): string {
  const accounts = accountScope.kind === "explicit_accounts" ? accountScope.accounts : [];
  const tuples = [...new Set(accounts
    .filter((account) => params.media === undefined || account.media === params.media)
    .map((account) => `(${sqlString(account.media)}, ${sqlString(account.accountId)})`))];
  const scope = accountScope.kind === "team_workspace_readonly"
    ? `SELECT DISTINCT media, account_id FROM dwd_account_daily WHERE ${whereClause(params, accountScope)}`
    : tuples.length === 0 ? "SELECT NULL, NULL WHERE 1 = 0" : `VALUES ${tuples.join(", ")}`;
  return `WITH RECURSIVE dates(day) AS (
    SELECT ${sqlString(params.dateFrom)} UNION ALL
    SELECT date(day, '+1 day') FROM dates WHERE day < ${sqlString(params.dateTo)}
  ), approved(media, account_id) AS (${scope}), expected AS (
    SELECT replace(dates.day, '-', '') AS ds, approved.media, approved.account_id
    FROM dates CROSS JOIN approved
  ), members AS (
    SELECT e.ds, e.media, e.account_id, d.account_id AS observed_account_id,
      d.cost_yuan, d.show, d.click, d.conv, d.cash_yuan
    FROM expected e LEFT JOIN dwd_account_daily d
      ON d.ds = CAST(e.ds AS INTEGER) AND d.media = e.media AND d.account_id = e.account_id
  )`;
}

const AGGREGATE_COLUMNS = `COUNT(observed_account_id) AS row_count,
  COUNT(DISTINCT CASE WHEN observed_account_id IS NOT NULL THEN ds || ':' || media || ':' || account_id END) AS account_day_count,
  COUNT(DISTINCT CASE WHEN observed_account_id IS NOT NULL THEN media || ':' || account_id END) AS account_count,
  ${completeSum("cost_yuan")} AS cost, ${completeSum("show")} AS exposure,
  ${completeSum("click")} AS click, ${completeSum("conv")} AS real_conversion,
  ${completeSum("cash_yuan")} AS cash_cost`;

function summarySql(params: NormalizedQueryParams, accounts: SqlAccountScope): string {
  return `${expectedAccountDays(params, accounts)} SELECT ${AGGREGATE_COLUMNS} FROM members`;
}

function trendSql(params: NormalizedQueryParams, accounts: SqlAccountScope): string {
  return `${expectedAccountDays(params, accounts)} SELECT ds, ${AGGREGATE_COLUMNS} FROM members GROUP BY ds ORDER BY ds`;
}

function tableSql(params: NormalizedQueryParams, accounts: SqlAccountScope): string {
  const page = params.page ?? 1;
  const pageSize = params.pageSize ?? 50;
  const offset = (page - 1) * pageSize;
  return `SELECT CAST(ds AS TEXT) AS ds, media, account_id, account_name, task_id, biz_name, sub_biz, cost_yuan, cash_yuan, assessment, cash_assessment, conv, show, click FROM dwd_account_daily WHERE ${whereClause(params, accounts)} ORDER BY ds DESC, media, account_id, task_id LIMIT ${pageSize} OFFSET ${offset}`;
}

function detailSql(params: NormalizedQueryParams, accounts: SqlAccountScope): string {
  return `SELECT CAST(ds AS TEXT) AS ds, media, account_id, account_name, task_id, biz_name, sub_biz, cost_yuan, cash_yuan, assessment, cash_assessment, conv, show, click FROM dwd_account_daily WHERE ${whereClause(params, accounts)} ORDER BY ds, media, account_id, task_id`;
}

function reconciliationSql(params: NormalizedQueryParams, accounts: SqlAccountScope): string {
  return `SELECT CAST(ds AS TEXT) AS ds, media, account_id, ${completeSum("cost_yuan")} AS cost, ${completeSum("conv")} AS real_conversion, ${completeSum("cash_yuan")} AS cash_cost FROM dwd_account_daily WHERE ${whereClause(params, accounts)} GROUP BY ds, media, account_id ORDER BY ds, media, account_id`;
}

const DEFINITION_INPUT: QueryDefinition[] = [
  {
    queryId: "account.anomalies",
    supportedViews: ["platform"],
    maxDateSpanDays: 7,
    maxRows: 2_000,
    accountScope: "optional_many",
    outputShape: "account_rows",
    queryTemplateVersion: "v1",
    metricVersion: "platform-diagnostics-v1",
    paramsSchema: intervalSchema,
    authorityPolicy: authority("diagnostics", "platform"),
  },
  {
    queryId: "account.detail",
    supportedViews: ["ka_data", "platform", "reconcile"],
    maxDateSpanDays: 31,
    maxRows: 2_000,
    accountScope: "required_one",
    outputShape: "account_rows",
    queryTemplateVersion: "v1",
    metricVersion: "account-detail-v1",
    paramsSchema: detailSchema,
    authorityPolicy: authority("diagnostics", "platform"),
    buildSql: detailSql,
  },
  {
    queryId: "account.summary",
    supportedViews: ["ka_data", "platform", "reconcile"],
    maxDateSpanDays: 31,
    maxRows: 1,
    accountScope: "optional_many",
    outputShape: "aggregate",
    queryTemplateVersion: "v2",
    metricVersion: "account-summary-v2",
    paramsSchema: intervalSchema,
    authorityPolicy: authority("cross_media_operations", "ka_data"),
    buildSql: summarySql,
  },
  {
    queryId: "account.table",
    supportedViews: ["ka_data", "platform", "reconcile"],
    maxDateSpanDays: 31,
    maxRows: 10_000,
    accountScope: "optional_many",
    outputShape: "account_rows",
    queryTemplateVersion: "v1",
    metricVersion: "account-table-v1",
    paramsSchema: tableSchema,
    authorityPolicy: authority("cross_media_operations", "ka_data"),
    buildSql: tableSql,
  },
  {
    queryId: "account.trend",
    supportedViews: ["ka_data", "platform", "reconcile"],
    maxDateSpanDays: 90,
    maxRows: 366,
    accountScope: "optional_many",
    outputShape: "aggregate",
    queryTemplateVersion: "v2",
    metricVersion: "account-trend-v2",
    paramsSchema: intervalSchema,
    authorityPolicy: authority("historical_analysis", "ka_data"),
    buildSql: trendSql,
  },
  {
    queryId: "reconcile.account_daily",
    supportedViews: ["reconcile"],
    maxDateSpanDays: 31,
    maxRows: 10_000,
    accountScope: "optional_many",
    outputShape: "account_rows",
    queryTemplateVersion: "v2",
    metricVersion: "source-versioned-v2",
    paramsSchema: intervalSchema,
    authorityPolicy: authority("source_versioned_financials", "source_versioned"),
    buildSql: reconciliationSql,
  },
];
const DEFINITIONS: readonly QueryDefinition[] = DEFINITION_INPUT.sort(
  (left, right) => left.queryId.localeCompare(right.queryId),
);

function inclusiveDays(dateFrom: string, dateTo: string): number {
  const from = Date.parse(`${dateFrom}T00:00:00.000Z`);
  const to = Date.parse(`${dateTo}T00:00:00.000Z`);
  return Math.floor((to - from) / 86_400_000) + 1;
}

function assertDateBudget(params: NormalizedQueryParams, maxDateSpanDays: number): void {
  const days = inclusiveDays(params.dateFrom, params.dateTo);
  if (days <= 0) throw new QueryRegistryError("INVALID_REQUEST", "date range must be ascending");
  if (days > maxDateSpanDays) {
    throw new QueryRegistryError(
      "INVALID_REQUEST",
      `date range exceeds the configured ${maxDateSpanDays}-day limit`,
    );
  }
}

export class DataQueryRegistry {
  private readonly entries = new Map(DEFINITIONS.map((entry) => [entry.queryId, entry]));
  private readonly today: () => string;

  constructor(options: { today?: () => string } = {}) {
    this.today = options.today ?? (() => new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Shanghai",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date()));
  }

  list(): readonly (Omit<QueryDefinition, "paramsSchema" | "buildSql"> & {
    rowSchemaVersion: string;
  })[] {
    return DEFINITIONS.map((entry) => ({
      queryId: entry.queryId,
      supportedViews: entry.supportedViews,
      maxDateSpanDays: entry.maxDateSpanDays,
      maxRows: entry.maxRows,
      accountScope: entry.accountScope,
      outputShape: entry.outputShape,
      queryTemplateVersion: entry.queryTemplateVersion,
      metricVersion: entry.metricVersion,
      rowSchemaVersion: canonicalRowSchemaVersionByQueryId[entry.queryId],
      authorityPolicy: entry.authorityPolicy,
    }));
  }

  resolve(queryIdInput: string, paramsInput: unknown, viewInput: unknown): ResolvedDataQuery {
    const queryId = dataQueryIdSchema.safeParse(queryIdInput);
    const dataView = dataViewModeSchema.safeParse(viewInput);
    if (!queryId.success) {
      throw new QueryRegistryError("QUERY_NOT_ALLOWED", "The requested query is not allowed");
    }
    if (!dataView.success) {
      throw new QueryRegistryError("VIEW_UNSUPPORTED", "The requested data view is unsupported");
    }
    const entry = this.entries.get(queryId.data);
    if (entry === undefined) {
      throw new QueryRegistryError("QUERY_NOT_ALLOWED", "The requested query is not allowed");
    }
    if (!entry.supportedViews.includes(dataView.data)) {
      throw new QueryRegistryError("VIEW_UNSUPPORTED", "The query does not support this data view");
    }
    const parsedParams = entry.paramsSchema.safeParse(paramsInput);
    if (!parsedParams.success) {
      throw new QueryRegistryError("INVALID_REQUEST", "Invalid query parameter set");
    }
    assertDateBudget(parsedParams.data, entry.maxDateSpanDays);
    const authorityPolicy = this.resolveAuthorityPolicy(entry, parsedParams.data);
    return {
      queryId: entry.queryId,
      dataView: dataView.data,
      params: parsedParams.data,
      supportedViews: entry.supportedViews,
      maxDateSpanDays: entry.maxDateSpanDays,
      maxRows: entry.maxRows,
      accountScope: entry.accountScope,
      outputShape: entry.outputShape,
      queryTemplateVersion: entry.queryTemplateVersion,
      metricVersion: entry.metricVersion,
      rowSchemaVersion: canonicalRowSchemaVersionByQueryId[entry.queryId],
      authorityPolicy,
      [RESOLVED_QUERY]: true,
    };
  }

  private resolveAuthorityPolicy(
    entry: QueryDefinition,
    params: NormalizedQueryParams,
  ): QueryAuthorityPolicy {
    if (
      (entry.queryId === "account.summary" || entry.queryId === "account.table") &&
      params.dateFrom === params.dateTo &&
      params.dateTo === this.today()
    ) {
      return authority("realtime_delivery", "platform");
    }
    return entry.authorityPolicy;
  }

  /** Pure fixed-template builder. Only KaDataClient's server binding authorizes execution. */
  buildTeamKaDataPlan(resolved: ResolvedDataQuery): KaDataQueryPlan {
    if (!isResolvedDataQuery(resolved)) throw new QueryRegistryError("INVALID_REQUEST", "Query must be resolved by the registry");
    const entry = this.entries.get(resolved.queryId);
    if (entry?.buildSql === undefined) throw new QueryRegistryError("VIEW_UNSUPPORTED", "KA Data does not support this query");
    return {
      backend: "sqlite",
      sql: entry.buildSql(resolved.params, { kind: "team_workspace_readonly" }),
      limit: entry.maxRows,
      queryTemplateVersion: `${entry.queryTemplateVersion}-team-bound-v1`,
    };
  }

  buildKaDataPlan(
    resolved: ResolvedDataQuery,
    scopedAccounts: readonly ScopedAccount[],
  ): KaDataQueryPlan {
    if (resolved[RESOLVED_QUERY] !== true) {
      throw new QueryRegistryError("INVALID_REQUEST", "Query must be resolved by the registry");
    }
    const entry = this.entries.get(resolved.queryId);
    if (entry?.buildSql === undefined) {
      throw new QueryRegistryError("VIEW_UNSUPPORTED", "KA Data does not support this query");
    }
    const validatedAccounts = z.array(z.object({
      media: mediaSchema,
      accountId: accountIdSchema,
    }).strict()).max(1_000).parse(scopedAccounts);
    return {
      backend: "sqlite",
      sql: entry.buildSql(resolved.params, { kind: "explicit_accounts", accounts: validatedAccounts }),
      limit: entry.maxRows,
      queryTemplateVersion: entry.queryTemplateVersion,
    };
  }
}

export function createDataQueryRegistry(options: { today?: () => string } = {}): DataQueryRegistry {
  return new DataQueryRegistry(options);
}

export function isResolvedDataQuery(value: unknown): value is ResolvedDataQuery {
  return typeof value === "object" && value !== null && RESOLVED_QUERY in value;
}

export function assertAuthorityUseCase(value: unknown): AuthorityUseCase {
  return authorityUseCaseSchema.parse(value);
}
