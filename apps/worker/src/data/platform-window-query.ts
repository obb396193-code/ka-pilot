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
} from "@ka/domain";
import { canonicalSummaryBaseRow } from "./canonical-query-rows.js";
import { createDataQueryRegistry } from "./query-registry.js";

const ratioUnknown = { value: null, state: "undefined" } as const;
const tuple = z.object({ media: z.string().regex(/^[A-Z0-9_]{1,32}$/), accountId: z.string().regex(/^[A-Za-z0-9_-]{1,128}$/) }).strict();
const inputSchema = z.object({
  workspaceId: z.string().uuid(), accounts: z.array(tuple).max(1000), window: queryWindowSchema,
  compare: z.enum(["dod", "wow"]).optional(),
}).strict().superRefine((input, context) => {
  if (new Set(input.accounts.map((account) => JSON.stringify([account.media, account.accountId]))).size !== input.accounts.length) {
    context.addIssue({ code: "custom", message: "Duplicate approved account tuple" });
  }
});
const lineageSchema = z.object({
  dataAsOf: z.string().datetime({ offset: true }).nullable(), canonicalRows: z.number().int().nonnegative(),
  returnedAccounts: z.number().int().nonnegative(), requestedAccountDays: z.number().int().nonnegative(),
  returnedAccountDays: z.number().int().nonnegative(),
}).strict();
interface WindowReadRepository {
  querySummary: SemanticQueryRepository["querySummary"];
  queryLineage: SemanticQueryRepository["queryLineage"];
  loadAssessment: WindowAssessmentRepository["load"];
}
interface WindowReadResult {
  row: SummaryWindowRow;
  lineage: SemanticLineageResult;
  window: z.infer<typeof queryWindowSchema>;
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
 * Public boundary switches only together with KA/BFF. P058 unknown-conversion reason and
 * onTargetRate denominator remain explicit review items; no invented budget/history source.
 */
export class PlatformWindowQuery {
  private readonly registry = createDataQueryRegistry();
  constructor(private readonly snapshot: WindowSnapshot) {}

  async summary(value: unknown): Promise<WindowReadResult> {
    const input = inputSchema.parse(value);
    this.registry.resolve("account.summary", { dateFrom: input.window.from, dateTo: input.window.to }, "platform");
    const scope: SemanticQueryScope = {
      workspaceId: input.workspaceId, dateFrom: input.window.from, dateTo: input.window.to,
      filters: { accountScopes: input.accounts },
    };
    return this.snapshot(async (repository) => {
      const expectedDays = dayCount(scope.dateFrom, scope.dateTo), expectedMembers = input.accounts.length * expectedDays;
      const parsedLineage = lineageSchema.safeParse(await repository.queryLineage(scope));
      if (!parsedLineage.success) return invalid();
      const lineage = parsedLineage.data;
      const summary = canonicalSummary(await repository.querySummary(scope));
      const rawHistory = await repository.loadAssessment(scope);
      const parsedHistory = z.array(dailyAssessmentInputSchema).max(10_000).safeParse(rawHistory);
      if (!parsedHistory.success) return invalid();
      const history = parsedHistory.data;
      if (lineage.requestedAccountDays !== expectedMembers || lineage.returnedAccounts > input.accounts.length ||
        lineage.returnedAccountDays > expectedMembers || lineage.canonicalRows > expectedMembers ||
        summary.accountCount !== lineage.returnedAccounts || summary.rowCount !== lineage.canonicalRows ||
        history.some((row) => row.ds < scope.dateFrom || row.ds > scope.dateTo) ||
        new Set(history.map((row) => row.ds)).size !== (input.accounts.length ? expectedDays : 0)) return invalid();
      if (!equalMetric(sumMetricValues(history.map((row) => row.cashCost)), summary.metrics.cashCost) ||
        !equalMetric(sumMetricValues(history.map((row) => row.realConversion)), summary.metrics.realConversion)) return invalid();
      const assessment = computeWindowAssessment(history);
      let compare: SummaryWindowRow["compare"];
      if (input.compare) {
        const previousWindow = comparisonWindow(input.window, input.compare);
        if (previousWindow === null) compare = unavailableWindowComparison(input.compare);
        else {
          const previous = canonicalSummary(await repository.querySummary({ ...scope, dateFrom: previousWindow.from, dateTo: previousWindow.to }));
          if (previous.accountCount > input.accounts.length || previous.rowCount > expectedMembers) return invalid();
          const point = (metrics: typeof summary.metrics) => ({
            cost: metrics.cost, cashCost: metrics.cashCost, realConversion: metrics.realConversion,
            cashCpa: metrics.ratios.cashCpa, onTargetRate: ratioUnknown,
          });
          compare = compareWindowPoints(input.compare, point(summary.metrics), point(previous.metrics));
        }
      }
      return {
        window: input.window, lineage,
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
      querySummary: semantic.querySummary.bind(semantic), queryLineage: semantic.queryLineage.bind(semantic),
      loadAssessment: assessment.load.bind(assessment),
    });
  }));
}
