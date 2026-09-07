import type { Pool } from "pg";
import {
  approvedWorkspaceAuthContextSchema, queryWindowSchema, calendarDateSchema, sourceLineageSchema,
  canonicalMetricSetSchema, dailyAssessmentInputSchema, metricValue,
} from "@ka/domain";
import { withSemanticReadSnapshot } from "./semantic-read-snapshot.js";
import { mapMetricSummary } from "./semantic-query-metrics.js";
import { PLATFORM_PIVOT_SQL, PIVOT_METRIC_FIELDS } from "./platform-pivot-sql.js";

export class PlatformPivotContractError extends Error {
  constructor() { super("Invalid platform pivot account-day evidence"); this.name = "PlatformPivotContractError"; }
}
function invalid(): never { throw new PlatformPivotContractError(); }
function number(value: unknown): number | null {
  if (value === null) return null;
  if (typeof value !== "number" && (typeof value !== "string" || !/^-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?$/.test(value))) return invalid();
  const result = Number(value);
  return Number.isFinite(result) ? result : invalid();
}
function text(value: unknown): string | null {
  return value === null || typeof value === "string" ? value : invalid();
}
function timestamp(value: unknown): string | null {
  const candidate = value instanceof Date ? (Number.isFinite(value.valueOf()) ? value.toISOString() : invalid()) : value;
  const result = sourceLineageSchema.shape.dataAsOf.safeParse(candidate);
  if (!result.success || (result.data !== null && !calendarDateSchema.safeParse(result.data.slice(0, 10)).success)) return invalid();
  return result.data === null ? null : new Date(result.data).toISOString();
}
const rowKeys = new Set(["workspace_id", "media", "account_id", "ds", "observed", "account_name", "task_id", "task_name", "biz_name",
  ...PIVOT_METRIC_FIELDS, "price_id", "price", "effective_date", "computed_at"]);
function decode(raw: unknown) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return invalid();
  const row = raw as Record<string, unknown>;
  if (Object.keys(row).length !== rowKeys.size || Object.keys(row).some(key => !rowKeys.has(key)) || typeof row.observed !== "boolean") return invalid();
  const ds = calendarDateSchema.safeParse(row.ds);
  if (!ds.success || typeof row.workspace_id !== "string" || typeof row.media !== "string" || typeof row.account_id !== "string") return invalid();
  const values = Object.fromEntries(PIVOT_METRIC_FIELDS.map(field => [field, number(row[field])])) as Record<typeof PIVOT_METRIC_FIELDS[number], number | null>;
  for (const field of ["exposure", "click", "conversion", "real_conversion", "wake_uv", "potential_uv"] as const) {
    if (values[field] !== null && !Number.isSafeInteger(values[field])) return invalid();
  }
  const computedAt = timestamp(row.computed_at);
  if (!row.observed && (Object.values(values).some(value => value !== null) || computedAt !== null)) return invalid();
  const base = mapMetricSummary({ ...values, cost_space: null, row_count: row.observed ? 1 : 0,
    account_count: row.observed ? 1 : 0, anomaly_rows: 0 });
  const metrics = canonicalMetricSetSchema.safeParse({
    cost: metricValue(base.cost), cashCost: metricValue(base.cashCost), exposure: metricValue(base.exposure), click: metricValue(base.click),
    conversion: metricValue(base.conversion), realConversion: metricValue(base.realConversion),
    costSpace: metricValue(null), wakeUv: metricValue(base.wakeUv), potentialUv: metricValue(base.potentialUv), ratios: base.ratios,
  });
  const priceAbsent = row.price_id === null && row.price === null && row.effective_date === null;
  if (!priceAbsent && (typeof row.price_id !== "string" || !/^-?\d{1,19}$/.test(row.price_id))) return invalid();
  const assessment = dailyAssessmentInputSchema.safeParse({ ds: ds.data, cashCost: metricValue(values.cash_cost), realConversion: metricValue(values.real_conversion),
    price: priceAbsent ? null : { versionKey: row.price_id, value: number(row.price), effectiveDate: row.effective_date },
  });
  if (!metrics.success || !assessment.success) return invalid();
  const taskId = text(row.task_id), bizName = text(row.biz_name);
  if (taskId === "" || bizName === "") return invalid();
  return { workspaceId: row.workspace_id, media: row.media, accountId: row.account_id, observed: row.observed,
    accountName: text(row.account_name), taskId, taskName: text(row.task_name), bizName,
    computedAt, metrics: metrics.data, assessment: assessment.data };
}
export type PlatformPivotMember = ReturnType<typeof decode>;

/** Personal canonical facts only; team uses its published snapshot reader, never grants/fallback.
 * Auth is already approved by the server session layer. This does not grant access or certify readiness.
 */
export class PlatformPivotRepository {
  constructor(private readonly pool: Pick<Pool, "connect">) {}
  async read(authInput: unknown, windowInput: unknown) {
    const auth = approvedWorkspaceAuthContextSchema.parse(authInput), window = queryWindowSchema.parse(windowInput);
    if (auth.workspaceKind !== "personal") throw new Error("Platform pivot requires personal explicit account scope");
    const accounts = auth.scope.accounts.map(({ media, accountId }) => ({ media, account_id: accountId }));
    const allowed = new Set(accounts.map(a => JSON.stringify([a.media, a.account_id])));
    const days = (Date.parse(`${window.to}T00:00:00Z`) - Date.parse(`${window.from}T00:00:00Z`)) / 86400000 + 1;
    if (allowed.size !== accounts.length || days > 31 || accounts.length * days > 10000) return invalid();
    return withSemanticReadSnapshot(this.pool, async connection => {
      const result = await connection.query(PLATFORM_PIVOT_SQL, [auth.workspaceId, window.from, window.to, JSON.stringify(accounts)]);
      if (!Array.isArray(result.rows) || result.rows.length > 10000) return invalid();
      try { if (Buffer.byteLength(JSON.stringify(result.rows)) >= 16 * 1024 * 1024) return invalid(); }
      catch { return invalid(); }
      const members = result.rows.map(decode), seen = new Set<string>(), observedAccounts = new Set<string>();
      let observedAccountDays = 0, missingComputedAt = 0, earliestComputedAt: string | null = null, latestComputedAt: string | null = null;
      for (const member of members) {
        const accountKey = JSON.stringify([member.media, member.accountId]), key = JSON.stringify([accountKey, member.assessment.ds]);
        if (member.workspaceId !== auth.workspaceId || !allowed.has(accountKey) || seen.has(key) ||
          member.assessment.ds < window.from || member.assessment.ds > window.to) return invalid();
        seen.add(key);
        if (member.observed) {
          observedAccountDays++; observedAccounts.add(accountKey);
          if (member.computedAt === null) missingComputedAt++;
          else {
            if (earliestComputedAt === null || member.computedAt < earliestComputedAt) earliestComputedAt = member.computedAt;
            if (latestComputedAt === null || member.computedAt > latestComputedAt) latestComputedAt = member.computedAt;
          }
        }
      }
      if (seen.size !== accounts.length * days) return invalid();
      return { window, members, observation: { expectedAccountDays: accounts.length * days, observedAccountDays,
        observedAccounts: observedAccounts.size, missingComputedAt, earliestComputedAt, latestComputedAt } };
    });
  }
}
