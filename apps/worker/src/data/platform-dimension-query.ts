import type { Pool } from "pg";
import { z } from "zod";
import {
  SemanticQueryRepository, WindowAssessmentRepository, SemanticQueryContractError, withSemanticReadSnapshot,
  type AccountDailyAssessment, type SemanticQueryScope,
} from "@ka/db";
import {
  accountDimensionWindowRowSchema, dailyAssessmentInputSchema, queryWindowSchema,
  computeWindowAssessment, sumMetricValues, type MetricValue,
} from "@ka/domain";
import { canonicalSummaryBaseRow } from "./canonical-query-rows.js";

const tupleSchema = z.object({ media: z.string().regex(/^[A-Z0-9_]{1,32}$/), accountId: z.string().regex(/^[A-Za-z0-9_-]{1,128}$/) }).strict();
const inputSchema = z.object({ workspaceId: z.string().uuid(), accounts: tupleSchema.array().max(1000), window: queryWindowSchema }).strict()
  .refine((value) => new Set(value.accounts.map(key)).size === value.accounts.length, "Duplicate account tuple")
  .refine((value) => span(value.window.from, value.window.to) <= 31, "Dimension window exceeds 31 days");
const lineageSchema = z.object({ dataAsOf: z.string().datetime({ offset: true }).nullable(),
  canonicalRows: z.number().int().nonnegative(), returnedAccounts: z.number().int().nonnegative(),
  requestedAccountDays: z.number().int().nonnegative(), returnedAccountDays: z.number().int().nonnegative(),
}).strict();
interface DimensionRepository {
  queryDimension: SemanticQueryRepository["queryDimension"];
  queryLineage: SemanticQueryRepository["queryLineage"];
  loadByAccount: WindowAssessmentRepository["loadByAccount"];
}
type Result = { rows: z.infer<typeof accountDimensionWindowRowSchema>[]; window: z.infer<typeof queryWindowSchema>;
  lineage: z.infer<typeof lineageSchema>; warnings: string[] };
type Snapshot = (read: (repository: DimensionRepository) => Promise<Result>) => Promise<Result>;
function key(account: { media: string; accountId: string }): string { return `${account.media}:${account.accountId}`; }
function span(from: string, to: string): number { return (Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000 + 1; }
function invalid(): never { throw new SemanticQueryContractError("Invalid dimension window result"); }
function equal(left: MetricValue, right: MetricValue): boolean {
  if (left.availability !== right.availability) return false;
  if (left.value === null || right.value === null) return left.value === right.value;
  return Math.abs(left.value - right.value) <= Math.max(0.000001, Math.abs(left.value) * Number.EPSILON * 16);
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

/** Three bounded reads on one RR/RO connection. No row-level N+1 and no live-source fallback. */
export class PlatformDimensionQuery {
  constructor(private readonly snapshot: Snapshot) {}
  async account(value: unknown): Promise<Result> {
    const input = inputSchema.parse(value), expectedDays = span(input.window.from, input.window.to);
    const scope: SemanticQueryScope = { workspaceId: input.workspaceId, dateFrom: input.window.from, dateTo: input.window.to,
      filters: { accountScopes: input.accounts } };
    return this.snapshot(async (repository) => {
      const lineage = lineageSchema.parse(await repository.queryLineage(scope));
      const raw = await repository.queryDimension({ ...scope, dimension: "account" });
      const history = groupHistory(await repository.loadByAccount(scope), input);
      if (!Array.isArray(raw) || raw.length > input.accounts.length || raw.length !== history.size ||
        lineage.requestedAccountDays !== input.accounts.length * expectedDays ||
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
        if (!allowed.has(accountKey) || seen.has(accountKey) || !members || members.length !== expectedDays) return invalid();
        seen.add(accountKey);
        const summary = canonicalSummaryBaseRow(row.metrics as unknown as Record<string, unknown>, "platform");
        if (summary.accountCount > 1 || summary.accountCount !== (summary.rowCount > 0 ? 1 : 0) || summary.rowCount > expectedDays || summary.anomalyRows! > summary.rowCount ||
          !equal(summary.metrics.cashCost, sumMetricValues(members.map((day) => day.cashCost))) ||
          !equal(summary.metrics.realConversion, sumMetricValues(members.map((day) => day.realConversion)))) return invalid();
        observedRows += summary.rowCount; observedAccounts += summary.accountCount;
        const assessment = computeWindowAssessment(members);
        return accountDimensionWindowRowSchema.parse({ key: accountKey, label: row.dimensionLabel, media: identity.media,
          accountId: identity.accountId, metrics: { ...summary.metrics, costSpace: assessment.costSpace },
          assessment: assessment.assessment, anomaly: summary.anomalyRows! > 0 });
      });
      if (observedRows !== lineage.canonicalRows || observedAccounts !== lineage.returnedAccounts) return invalid();
      return { rows, window: input.window, lineage, warnings: ["BUDGET_SOURCE_NOT_READY"] };
    });
  }
}

export function createPlatformDimensionQuery(pool: Pick<Pool, "connect">): PlatformDimensionQuery {
  return new PlatformDimensionQuery((read) => withSemanticReadSnapshot(pool, (connection) => {
    const semantic = new SemanticQueryRepository(connection), assessment = new WindowAssessmentRepository(connection);
    return read({ queryDimension: semantic.queryDimension.bind(semantic), queryLineage: semantic.queryLineage.bind(semantic),
      loadByAccount: assessment.loadByAccount.bind(assessment) });
  }));
}
