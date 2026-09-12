import type { Pool } from "pg";
import { z } from "zod";
import {
  SemanticQueryRepository, WindowAssessmentRepository, SemanticQueryContractError, withSemanticReadSnapshot,
  AccountDimensionEvidenceRepository, AccountDimensionRuleRepository,
  type AccountDailyAssessment, type SemanticQueryScope,
} from "@ka/db";
import {
  accountDimensionWindowRowSchema, groupedDimensionWindowRowSchema, dailyAssessmentInputSchema, queryWindowSchema,
  computeWindowAssessment, sumMetricValues, type MetricValue,
  namedDimensionTypeSchema, namedDimensionWindowRowSchema, accountDimensionRuleSchema,
  resolveNamedDimensions, summarizeDimensionSources, aggregateWindowMetrics,
  dashboardFiltersSchema, calendarDateSchema,

  sumMetricValuesPartial, type CanonicalMetricValue,
} from "@ka/domain";
import { canonicalSummaryBaseRow } from "./canonical-query-rows.js";
import { createDashboardScopeResolver, type DashboardScopeResolver } from "./dashboard-filter-scope.js";

const tupleSchema = z.object({ media: z.string().regex(/^[A-Z0-9_]{1,32}$/), accountId: z.string().regex(/^[A-Za-z0-9_-]{1,128}$/) }).strict();
const inputFields = { workspaceId: z.string().uuid(), accounts: tupleSchema.array().max(1000), window: queryWindowSchema,
  filters: dashboardFiltersSchema.optional() };
const inputSchema = z.object(inputFields).strict()
  .refine((value) => new Set(value.accounts.map(key)).size === value.accounts.length, "Duplicate account tuple")
  .refine((value) => span(value.window.from, value.window.to) <= 31, "Dimension window exceeds 31 days");
const lineageSchema = z.object({ dataAsOf: z.string().datetime({ offset: true }).nullable(),
  canonicalRows: z.number().int().nonnegative(), returnedAccounts: z.number().int().nonnegative(),
  requestedAccountDays: z.number().int().nonnegative(), returnedAccountDays: z.number().int().nonnegative(),
  requestedDates: calendarDateSchema.array().max(366).optional(),
}).strict();
interface DimensionRepository {
  resolveDashboardScope?: DashboardScopeResolver;
  queryDimension: SemanticQueryRepository["queryDimension"];
  queryLineage: SemanticQueryRepository["queryLineage"];
  loadByAccount: WindowAssessmentRepository["loadByAccount"];
  loadEvidence?: AccountDimensionEvidenceRepository["load"];
  loadRules?: AccountDimensionRuleRepository["load"];
}
type Result = { rows: z.infer<typeof accountDimensionWindowRowSchema>[]; window: z.infer<typeof queryWindowSchema>;
  lineage: z.infer<typeof lineageSchema>; warnings: string[] };
type GroupResult = Omit<Result, "rows"> & { rows: z.infer<typeof groupedDimensionWindowRowSchema>[] };
type NamedResult = Omit<Result, "rows"> & { rows: z.infer<typeof namedDimensionWindowRowSchema>[] };
type Snapshot = <T>(read: (repository: DimensionRepository) => Promise<T>) => Promise<T>;
const groupInputSchema = z.object({ ...inputFields,
  dimensionType: z.enum(["task", "biz"]),
}).strict().superRefine((value, ctx) => {
  const result = inputSchema.safeParse({ workspaceId: value.workspaceId, accounts: value.accounts, window: value.window });
  if (!result.success) for (const issue of result.error.issues) ctx.addIssue({ code: "custom", path: issue.path, message: issue.message });
});
const namedInputSchema = z.object({ ...inputFields, dimensionType: namedDimensionTypeSchema }).strict();
const membershipLabelsSchema = z.object({ taskId: z.string().trim().min(1).nullable(), bizName: z.string().trim().min(1).nullable() });
function key(account: { media: string; accountId: string }): string { return `${account.media}:${account.accountId}`; }
function span(from: string, to: string): number { return (Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000 + 1; }
function invalid(): never { throw new SemanticQueryContractError("Invalid dimension window result"); }
function equal(left: MetricValue, right: MetricValue): boolean {
  if (left.availability !== right.availability) return false;
  if (left.value === null || right.value === null) return left.value === right.value;
  return Math.abs(left.value - right.value) <= Math.max(0.000001, Math.abs(left.value) * Number.EPSILON * 16);
}
/**
 * v1.9.35：窗口里缺账户日时，两个**逐日可证**的指标改发部分合计（与 summary 同口径）。
 * 其余字段仍走 SQL 的整窗聚合——那条是多查询共用的 `expected_metric`，给它加 partial
 * 是共享聚合那批的活，不在这一笔里动。判定已因 partial 挂起，部分值读不成「达标」。
 */
function partialWindowMetrics(
  costSpace: { availability: string },
  members: readonly { cashCost: CanonicalMetricValue; realConversion: CanonicalMetricValue }[],
): { cashCost: CanonicalMetricValue; realConversion: CanonicalMetricValue } | Record<string, never> {
  if (costSpace.availability !== "partial") return {};
  return {
    cashCost: sumMetricValuesPartial(members.map((member) => member.cashCost)),
    realConversion: sumMetricValuesPartial(members.map((member) => member.realConversion)),
  };
}

function groupHistory(raw: AccountDailyAssessment[], input: z.infer<typeof inputSchema>) {
  if (!Array.isArray(raw) || raw.length > 10000 || Buffer.byteLength(JSON.stringify(raw)) >= 16 * 1024 * 1024) return invalid();
  const allowed = new Set(input.accounts.map(key)), seen = new Set<string>();
  const grouped = new Map<string, z.infer<typeof dailyAssessmentInputSchema>[]>();
  for (const row of raw) {
    const identity = tupleSchema.safeParse({ media: row?.media, accountId: row?.accountId });
    const parsed = dailyAssessmentInputSchema.safeParse(row?.input);
    if (!identity.success || !parsed.success || row.workspaceId !== input.workspaceId) return invalid();
    const accountKey = key(identity.data), dayKey = `${accountKey}:${parsed.data.ds}`;
    if (!allowed.has(accountKey) || seen.has(dayKey) || parsed.data.ds < input.window.from || parsed.data.ds > input.window.to ||
      (parsed.data.price !== null && parsed.data.price.effectiveDate! > parsed.data.ds)) return invalid();
    seen.add(dayKey);
    const group = grouped.get(accountKey) ?? []; group.push(parsed.data); grouped.set(accountKey, group);
  }
  return grouped;
}
function expectedCounts(scope: SemanticQueryScope, input: z.infer<typeof inputSchema>, history: ReturnType<typeof groupHistory>) {
  const selected = scope.filters?.accountDays;
  const counts = new Map<string, number>();
  if (selected === undefined) for (const account of input.accounts) counts.set(key(account), span(input.window.from, input.window.to));
  else for (const day of selected) counts.set(key(day), (counts.get(key(day)) ?? 0) + 1);
  const allowedDays = selected === undefined ? null : new Set(selected.map(day => `${key(day)}:${day.ds}`));
  if (history.size !== counts.size || [...history].some(([accountKey, days]) => days.length !== counts.get(accountKey) ||
    (allowedDays !== null && days.some(day => !allowedDays.has(`${accountKey}:${day.ds}`))))) return invalid();
  return counts;
}

/** Three repository reads on one RR/RO connection; task/biz adds one overlap probe.
 * No row-level N+1 and no live-source fallback.
 */
export class PlatformDimensionQuery {
  constructor(private readonly snapshot: Snapshot) {}
  async named(value: unknown): Promise<NamedResult> {
    const { dimensionType, ...rawInput } = namedInputSchema.parse(value), input = inputSchema.parse(rawInput);
    return this.snapshot(async repository => {
      if (!repository.loadEvidence || !repository.loadRules) return invalid();
      // Bind existing account computation to this very connection, without a
      // second transaction. Capture its already-read daily inputs for weighting.
      let historyRows: AccountDailyAssessment[] = [];
      const accountResult = await new PlatformDimensionQuery(async read => read({ ...repository,
        loadByAccount: async scope => { historyRows = await repository.loadByAccount(scope); return historyRows; },
      })).account(input);
      const history = groupHistory(historyRows, input), scope = { workspaceId: input.workspaceId, accounts: input.accounts };
      const evidence = await repository.loadEvidence(scope), rules = await repository.loadRules(scope);
      const allowed = new Set(input.accounts.map(key));
      for (const rows of [evidence, rules]) {
        if (!Array.isArray(rows) || rows.length > input.accounts.length || Buffer.byteLength(JSON.stringify(rows)) >= 16 * 1024 * 1024) return invalid();
        const seen = new Set<string>();
        for (const row of rows) {
          if (!row || row.workspaceId !== input.workspaceId || !allowed.has(key(row)) || seen.has(key(row))) return invalid();
          seen.add(key(row));
        }
      }
      const evidenceByKey = new Map(evidence.map(row => [key(row), row])), rulesByKey = new Map(rules.map(row => [key(row), accountDimensionRuleSchema.parse(row)]));
      const warnings = new Set(accountResult.warnings);
      type Member = { row: Result["rows"][number]; source: ReturnType<typeof resolveNamedDimensions>["optimizer"]["source"]; days: z.infer<typeof dailyAssessmentInputSchema>[] };
      const groups = new Map<string | null, Member[]>();
      for (const row of accountResult.rows) {
        const stored = evidenceByKey.get(row.key), rule = rulesByKey.get(row.key), days = history.get(row.key);
        if (!stored || !rule || !days || rule.ruleVersion !== (stored.parse?.ruleVersion ?? null)) return invalid();
        if (stored.parse !== null && (typeof stored.parse !== "object" || Array.isArray(stored.parse))) return invalid();
        let dimension: ReturnType<typeof resolveNamedDimensions>["optimizer"] = { value: null, source: null };
        if (stored.parse === null) warnings.add("NAMING_PARSE_MISSING");
        else {
          if (!stored.parse.nameMatches) warnings.add("NAMING_PARSE_STALE");
          if (rule.mappings === null) warnings.add("NAMING_RULE_MISSING");
          try {
            dimension = resolveNamedDimensions({ segments: stored.parse.segments, override: stored.parse.override ?? {},
              nameMatches: stored.parse.nameMatches, ruleMappings: rule.mappings })[dimensionType];
          } catch { return invalid(); }
        }
        const members = groups.get(dimension.value) ?? []; members.push({ row, source: dimension.source, days }); groups.set(dimension.value, members);
      }
      // Sort with the same deterministic JS comparator on all engines; no DB locale dependence.
      const rows = [...groups.entries()].sort(([a], [b]) => a === b ? 0 : a === null ? -1 : b === null ? 1 : a < b ? -1 : 1)
        .map(([key, members]) => {
          const assessment = computeWindowAssessment(members.flatMap(member => member.days));
          return namedDimensionWindowRowSchema.parse({ key, label: key ?? "未标注",
            ...summarizeDimensionSources(members.map(member => member.source)),
            metrics: { ...aggregateWindowMetrics(members.map(member => member.row.metrics)), costSpace: assessment.costSpace },
            assessment: assessment.assessment, anomaly: members.some(member => member.row.anomaly) });
        });
      return { ...accountResult, rows, warnings: [...warnings] };
    });
  }
  async group(value: unknown): Promise<GroupResult> {
    const input = groupInputSchema.parse(value);
    const baseScope: SemanticQueryScope = { workspaceId: input.workspaceId, dateFrom: input.window.from, dateTo: input.window.to,
      filters: { accountScopes: input.accounts } };
    return this.snapshot(async (repository) => {
      if (input.filters !== undefined && !repository.resolveDashboardScope) return invalid();
      const selection = input.filters === undefined ? { scope: baseScope, warnings: [] }
        : await repository.resolveDashboardScope!(baseScope, input.filters);
      const scope = selection.scope;
      const lineage = lineageSchema.parse(await repository.queryLineage(scope));
      const raw = await repository.queryDimension({ ...scope, dimension: input.dimensionType });
      const historyRows = await repository.loadByAccount(scope), accounts = groupHistory(historyRows, input);
      const counts = expectedCounts(scope, input, accounts);
      if (!Array.isArray(raw) || raw.length > 10000 || Buffer.byteLength(JSON.stringify(raw)) >= 16 * 1024 * 1024 ||
        lineage.requestedAccountDays !== [...counts.values()].reduce((a, b) => a + b, 0) || lineage.returnedAccounts > accounts.size ||
        lineage.returnedAccountDays > lineage.requestedAccountDays || lineage.canonicalRows !== lineage.returnedAccountDays ||
        lineage.returnedAccounts > lineage.canonicalRows) return invalid();
      const groups = new Map<string | null, AccountDailyAssessment[]>();
      for (const row of historyRows) {
        const labels = membershipLabelsSchema.safeParse({ taskId: row.taskId, bizName: row.bizName });
        if (!labels.success) return invalid();
        const groupKey = input.dimensionType === "task" ? row.taskId : row.bizName;
        const members = groups.get(groupKey) ?? []; members.push(row); groups.set(groupKey, members);
      }
      if (raw.length !== groups.size) return invalid();
      const seen = new Set<string | null>(); let observedRows = 0, groupAccounts = 0;
      const rows = raw.map((row) => {
        if (!row || typeof row !== "object" || Array.isArray(row) || !row.metrics || typeof row.metrics !== "object") return invalid();
        const members = groups.get(row.dimensionKey);
        if (!members || seen.has(row.dimensionKey)) return invalid();
        seen.add(row.dimensionKey);
        const summary = canonicalSummaryBaseRow(row.metrics as unknown as Record<string, unknown>, "platform");
        const accountCount = new Set(members.map(key)).size;
        if (summary.accountCount > accountCount || summary.accountCount > lineage.returnedAccounts ||
          (summary.rowCount > 0 && summary.accountCount === 0) ||
          summary.accountCount > summary.rowCount || summary.rowCount > members.length || summary.anomalyRows! > summary.rowCount ||
          !equal(summary.metrics.cashCost, sumMetricValues(members.map((row) => row.input.cashCost))) ||
          !equal(summary.metrics.realConversion, sumMetricValues(members.map((row) => row.input.realConversion)))) return invalid();
        observedRows += summary.rowCount; groupAccounts += summary.accountCount;
        const assessment = computeWindowAssessment(members.map((row) => row.input));
        return groupedDimensionWindowRowSchema.parse({ key: row.dimensionKey, label: row.dimensionLabel,
          metrics: { ...summary.metrics, ...partialWindowMetrics(assessment.costSpace, members.map((row) => row.input)),
            costSpace: assessment.costSpace },
          assessment: assessment.assessment, anomaly: summary.anomalyRows! > 0 });
      });
      // One account may occur in several groups across days: group counts are not a distinct account total.
      if (observedRows !== lineage.canonicalRows || groupAccounts < lineage.returnedAccounts ||
        (lineage.canonicalRows > 0 && lineage.returnedAccounts === 0)) return invalid();
      return { rows, window: input.window, lineage, warnings: ["BUDGET_SOURCE_NOT_READY", ...selection.warnings] };
    });
  }
  async account(value: unknown): Promise<Result> {
    const input = inputSchema.parse(value);
    const baseScope: SemanticQueryScope = { workspaceId: input.workspaceId, dateFrom: input.window.from, dateTo: input.window.to,
      filters: { accountScopes: input.accounts } };
    return this.snapshot(async (repository) => {
      if (input.filters !== undefined && !repository.resolveDashboardScope) return invalid();
      const selection = input.filters === undefined ? { scope: baseScope, warnings: [] }
        : await repository.resolveDashboardScope!(baseScope, input.filters);
      const scope = selection.scope;
      const lineage = lineageSchema.parse(await repository.queryLineage(scope));
      const raw = await repository.queryDimension({ ...scope, dimension: "account" });
      const history = groupHistory(await repository.loadByAccount(scope), input);
      const counts = expectedCounts(scope, input, history);
      if (!Array.isArray(raw) || raw.length > input.accounts.length || raw.length !== history.size ||
        lineage.requestedAccountDays !== [...counts.values()].reduce((a, b) => a + b, 0) ||
        lineage.returnedAccountDays > lineage.requestedAccountDays || lineage.canonicalRows !== lineage.returnedAccountDays ||
        lineage.returnedAccounts > input.accounts.length) return invalid();
      const allowed = new Set(input.accounts.map(key)), seen = new Set<string>();
      let observedRows = 0, observedAccounts = 0;
      const rows = raw.map((row) => {
        if (typeof row !== "object" || row === null || Array.isArray(row) ||
          typeof row.metrics !== "object" || row.metrics === null || Array.isArray(row.metrics)) return invalid();
        const identity = row.accountIdentity;
        if (!identity || identity.workspaceId !== input.workspaceId || row.dimensionKey !== identity.accountId) return invalid();
        const accountKey = key(identity), members = history.get(accountKey);
        const expectedDays = counts.get(accountKey);
        if (!allowed.has(accountKey) || seen.has(accountKey) || !members || expectedDays === undefined || members.length !== expectedDays) return invalid();
        seen.add(accountKey);
        const summary = canonicalSummaryBaseRow(row.metrics as unknown as Record<string, unknown>, "platform");
        if (summary.accountCount > 1 || summary.accountCount !== (summary.rowCount > 0 ? 1 : 0) || summary.rowCount > expectedDays || summary.anomalyRows! > summary.rowCount ||
          !equal(summary.metrics.cashCost, sumMetricValues(members.map((day) => day.cashCost))) ||
          !equal(summary.metrics.realConversion, sumMetricValues(members.map((day) => day.realConversion)))) return invalid();
        observedRows += summary.rowCount; observedAccounts += summary.accountCount;
        const assessment = computeWindowAssessment(members);
        return accountDimensionWindowRowSchema.parse({ key: accountKey, label: row.dimensionLabel, media: identity.media,
          accountId: identity.accountId,
          metrics: { ...summary.metrics, ...partialWindowMetrics(assessment.costSpace, members),
            costSpace: assessment.costSpace },
          assessment: assessment.assessment, anomaly: summary.anomalyRows! > 0 });
      });
      if (observedRows !== lineage.canonicalRows || observedAccounts !== lineage.returnedAccounts) return invalid();
      return { rows, window: input.window, lineage, warnings: ["BUDGET_SOURCE_NOT_READY", ...selection.warnings] };
    });
  }
}

export function createPlatformDimensionQuery(pool: Pick<Pool, "connect">): PlatformDimensionQuery {
  return new PlatformDimensionQuery((read) => withSemanticReadSnapshot(pool, (connection) => {
    const semantic = new SemanticQueryRepository(connection), assessment = new WindowAssessmentRepository(connection);
    const evidence = new AccountDimensionEvidenceRepository(connection), rules = new AccountDimensionRuleRepository(connection);
    return read({ resolveDashboardScope: createDashboardScopeResolver(connection),
      queryDimension: semantic.queryDimension.bind(semantic), queryLineage: semantic.queryLineage.bind(semantic),
      loadByAccount: assessment.loadByAccount.bind(assessment), loadEvidence: evidence.load.bind(evidence), loadRules: rules.load.bind(rules) });
  }));
}
