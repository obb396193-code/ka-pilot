import type { Pool } from "pg";
import { z } from "zod";
import {
  SemanticQueryRepository, WindowAssessmentRepository, SemanticQueryContractError,
  withSemanticReadSnapshot, type SemanticQueryScope, type SemanticLineageResult,
} from "@ka/db";
import {
  queryWindowSchema, summaryWindowRowSchema, dailyAssessmentInputSchema,
  comparisonWindow, computeWindowAssessment, compareWindowPoints, unavailableWindowComparison,
  sumMetricValues, type SummaryWindowRow,
  calendarDateSchema, dashboardFiltersSchema,
  type LineageWarning,
} from "@ka/domain";
import { canonicalSummaryBaseRow } from "./canonical-query-rows.js";
import { createDataQueryRegistry, taskQueryIdSchema } from "./query-registry.js";
import { assertTaskWindowDates, taskWindowDates } from "./task-window-coverage.js";
import { createDashboardScopeResolver, type DashboardScopeResolver } from "./dashboard-filter-scope.js";

const ratioUnknown = { value: null, state: "undefined" } as const;
const accountCountsSchema = z.object({ total: z.number().int().min(0).max(1000),
  determinable: z.number().int().nonnegative(), onTarget: z.number().int().nonnegative(),
}).strict().refine((row) => row.onTarget <= row.determinable && row.determinable <= row.total);
function targetRate(value: unknown, approvedCount: number, observedCount: number) {
  const parsed = accountCountsSchema.safeParse(value);
  if (!parsed.success || parsed.data.total > approvedCount || parsed.data.total < observedCount) return invalid();
  const { determinable, onTarget } = parsed.data;
  return determinable === 0 ? ratioUnknown : { value: onTarget / determinable, state: "finite" as const };
}
const tuple = z.object({ media: z.string().regex(/^[A-Z0-9_]{1,32}$/), accountId: z.string().regex(/^[A-Za-z0-9_-]{1,128}$/) }).strict();
const inputSchema = z.object({
  workspaceId: z.string().uuid(), accounts: z.array(tuple).max(1000), window: queryWindowSchema,
  compare: z.enum(["dod", "wow"]).optional(),
  taskId: taskQueryIdSchema.optional(),
  filters: dashboardFiltersSchema.optional(),
}).strict().superRefine((input, context) => {
  if (new Set(input.accounts.map((account) => JSON.stringify([account.media, account.accountId]))).size !== input.accounts.length) {
    context.addIssue({ code: "custom", message: "Duplicate approved account tuple" });
  }
});
const lineageSchema = z.object({
  dataAsOf: z.string().datetime({ offset: true }).nullable(), canonicalRows: z.number().int().nonnegative(),
  returnedAccounts: z.number().int().nonnegative(), requestedAccountDays: z.number().int().nonnegative(),
  returnedAccountDays: z.number().int().nonnegative(),
  requestedDates: calendarDateSchema.array().max(366).optional(),
}).strict();
interface WindowReadRepository {
  resolveDashboardScope?: DashboardScopeResolver;
  querySummary: SemanticQueryRepository["querySummary"];
  queryLineage: SemanticQueryRepository["queryLineage"];
  loadAssessment: WindowAssessmentRepository["load"];
  loadAccountCounts: WindowAssessmentRepository["loadAccountCounts"];
  loadMissingAccountDays: WindowAssessmentRepository["loadMissingAccountDays"];
}
interface WindowReadResult {
  row: SummaryWindowRow;
  lineage: SemanticLineageResult;
  window: z.infer<typeof queryWindowSchema>;
  warnings: string[];
  /**
   * v1.9.33 缺数点名：逐账户日的结构化告警（`ACCOUNT_DAY_MISSING` / `BATCH_FAILED`）。
   * 与 `warnings` 分开装是因为那一栏是既有的字符串告警，两者出口不同：
   * 点名进 `lineage.warnings`（前端据此显「N 户 × M 天缺失」），字符串告警照旧。
   */
  namedGaps: LineageWarning[];
}
type WindowSnapshot = (read: (repository: WindowReadRepository) => Promise<WindowReadResult>) => Promise<WindowReadResult>;
function dayCount(from: string, to: string): number { return (Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000 + 1; }
function invalid(): never { throw new SemanticQueryContractError("Invalid window source result"); }
function canonicalSummary(raw: unknown) {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) return invalid();
  return canonicalSummaryBaseRow(raw as Record<string, unknown>, "platform");
}
function equalMetric(left: { value: number | null; availability: string }, right: { value: number | null; availability: string }): boolean {
  if (left.availability !== right.availability) return false;
  if (left.value === null || right.value === null) return left.value === right.value;
  // PG NUMERIC sums are converted to IEEE numbers only after aggregation; allow conversion noise, not material divergence.
  return Math.abs(left.value - right.value) <= Math.max(0.000001, Math.abs(left.value) * Number.EPSILON * 16);
}

/** Internal v3 composition, not another public API or a second query registry.
 * Public boundary switches only together with KA/BFF; no invented budget/history source.
 */
export class PlatformWindowQuery {
  private readonly registry = createDataQueryRegistry();
  constructor(private readonly snapshot: WindowSnapshot) {}

  async summary(value: unknown): Promise<WindowReadResult> {
    const input = inputSchema.parse(value);
    this.registry.resolve("account.summary", { dateFrom: input.window.from, dateTo: input.window.to }, "platform");
    const baseScope: SemanticQueryScope = {
      workspaceId: input.workspaceId, dateFrom: input.window.from, dateTo: input.window.to,
      filters: { accountScopes: input.accounts, ...(input.taskId === undefined ? {} : { taskId: input.taskId }) },
    };
    return this.snapshot(async (repository) => {
      if (input.filters !== undefined && !repository.resolveDashboardScope) return invalid();
      const selection = input.filters === undefined ? { scope: baseScope, warnings: [] }
        : await repository.resolveDashboardScope!(baseScope, input.filters);
      const scope = selection.scope, selected = scope.filters?.accountDays !== undefined || input.taskId !== undefined;
      const expectedDays = dayCount(scope.dateFrom, scope.dateTo), expectedMembers = input.accounts.length * expectedDays;
      const parsedLineage = lineageSchema.safeParse(await repository.queryLineage(scope));
      if (!parsedLineage.success) return invalid();
      const lineage = parsedLineage.data;
      const summary = canonicalSummary(await repository.querySummary(scope));
      const rawHistory = await repository.loadAssessment(scope);
      const parsedHistory = z.array(dailyAssessmentInputSchema).max(10_000).safeParse(rawHistory);
      if (!parsedHistory.success) return invalid();
      const history = parsedHistory.data;
      if (selected) assertTaskWindowDates(scope, lineage, history.map((row) => row.ds));
      if ((!selected && lineage.requestedAccountDays !== expectedMembers) || lineage.returnedAccounts > input.accounts.length ||
        lineage.returnedAccountDays > expectedMembers || lineage.canonicalRows > expectedMembers ||
        summary.accountCount !== lineage.returnedAccounts || summary.rowCount !== lineage.canonicalRows ||
        history.some((row) => row.ds < scope.dateFrom || row.ds > scope.dateTo) ||
        (!selected && new Set(history.map((row) => row.ds)).size !== (input.accounts.length ? expectedDays : 0))) return invalid();
      if (!equalMetric(sumMetricValues(history.map((row) => row.cashCost)), summary.metrics.cashCost) ||
        !equalMetric(sumMetricValues(history.map((row) => row.realConversion)), summary.metrics.realConversion)) return invalid();
      const assessment = (() => { try { return computeWindowAssessment(history); } catch { return invalid(); } })();
      const onTargetRate = targetRate(await repository.loadAccountCounts(scope), input.accounts.length, summary.accountCount);
      let compare: SummaryWindowRow["compare"];
      if (input.compare) {
        const previousWindow = comparisonWindow(input.window, input.compare);
        if (previousWindow === null) compare = unavailableWindowComparison(input.compare);
        else {
          const previousBase = { ...baseScope, dateFrom: previousWindow.from, dateTo: previousWindow.to };
          const previousSelection = input.filters === undefined ? { scope: previousBase, warnings: [] }
            : await repository.resolveDashboardScope!(previousBase, input.filters);
          const previousScope = previousSelection.scope;
          selection.warnings.push(...previousSelection.warnings);
          const previous = canonicalSummary(await repository.querySummary(previousScope));
          if (previous.accountCount > input.accounts.length || previous.rowCount > expectedMembers) return invalid();
          if (selected) {
            const proof = lineageSchema.safeParse(await repository.queryLineage(previousScope));
            if (!proof.success) return invalid();
            taskWindowDates(previousScope, proof.data);
            if (previous.accountCount !== proof.data.returnedAccounts || previous.rowCount !== proof.data.canonicalRows) return invalid();
          }
          const previousRate = targetRate(await repository.loadAccountCounts(previousScope), input.accounts.length, previous.accountCount);
          const point = (metrics: typeof summary.metrics, rate: ReturnType<typeof targetRate>) => ({
            cost: metrics.cost, cashCost: metrics.cashCost, realConversion: metrics.realConversion,
            cashCpa: metrics.ratios.cashCpa, onTargetRate: rate,
          });
          compare = compareWindowPoints(input.compare, point(summary.metrics, onTargetRate), point(previous.metrics, previousRate));
        }
      }
      /**
       * v1.9.33 缺数点名：把「哪个账户的哪一天少了哪几个字段」逐条说出来。
       * 有失败批次记录的报 `BATCH_FAILED`（已知原因），其余报 `ACCOUNT_DAY_MISSING`。
       * 只给一屏「−」而不点名，用户分不清「这天没投」还是「这天没拉到」。
       * 上限 200 条：再多前端也读不完，且响应不该被告警撑爆；截断时补一条计数说明。
       */
      const missing = await repository.loadMissingAccountDays(scope);
      const named: LineageWarning[] = missing.slice(0, 200).map((row) => (row.batchFailed
        ? { code: "BATCH_FAILED", media: row.media, accountId: row.accountId, businessDate: row.ds }
        : { code: "ACCOUNT_DAY_MISSING", media: row.media, accountId: row.accountId, businessDate: row.ds,
          fields: row.fields.length > 0 ? row.fields : ["cashCost"] }));
      if (missing.length > 200) named.push(`ACCOUNT_DAY_MISSING_TRUNCATED:${missing.length}`);

      return {
        window: input.window,
        // v1.9.35：这一窗给的是部分合计时，lineage 明说 partial——判定那侧已经挂起，
        // 但调用方还要知道「这个数是不完整的」才敢往下用。
        lineage: { ...lineage, ...(missing.length > 0 ? { partial: true } : {}) },
        warnings: [...new Set(["BUDGET_SOURCE_NOT_READY", ...selection.warnings])],
        namedGaps: named,
        row: summaryWindowRowSchema.parse({
          ...summary, metrics: { ...summary.metrics, costSpace: assessment.costSpace },
          assessment: assessment.assessment, ...(compare ? { compare } : {}),
        }),
      };
    });
  }
}

export function createPlatformWindowQuery(pool: Pick<Pool, "connect">): PlatformWindowQuery {
  return new PlatformWindowQuery((read) => withSemanticReadSnapshot(pool, (connection) => {
    const semantic = new SemanticQueryRepository(connection), assessment = new WindowAssessmentRepository(connection);
    return read({
      resolveDashboardScope: createDashboardScopeResolver(connection),
      querySummary: semantic.querySummary.bind(semantic), queryLineage: semantic.queryLineage.bind(semantic),
      loadAssessment: assessment.load.bind(assessment),
      loadAccountCounts: assessment.loadAccountCounts.bind(assessment),
      loadMissingAccountDays: assessment.loadMissingAccountDays.bind(assessment),
    });
  }));
}
