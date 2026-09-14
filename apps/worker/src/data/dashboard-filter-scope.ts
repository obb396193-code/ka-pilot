import {
  DashboardAccountDaysRepository, AccountDimensionEvidenceError, type SemanticQueryScope, type SemanticReadConnection,
} from "@ka/db";
import {
  dashboardFiltersSchema, dashboardDayRequestSchema, dashboardAccountDaySchema, boundedAccountDaysSchema,
  compileDashboardFilters, capLabelBasisWarnings, labelBasisEarliestKnownWarning,
  type DashboardFilters, type LabelBasisEarliestKnownWarning, type LineageWarning,
} from "@ka/domain";
import { resolveAccountLabelsAsOf, type AccountLabelsAsOf } from "./account-labels.js";

export interface DashboardFilterReader {
  loadDays: DashboardAccountDaysRepository["load"];
  /** v1.9.49 ①：按窗口读归属历史；筛选按每个账户日自己的业务日选行。 */
  loadLabels(input: { workspaceId: string; accounts: readonly { media: string; accountId: string }[]; from: string; to: string }):
    Promise<AccountLabelsAsOf>;
}
export interface DashboardScopeSelection {
  scope: SemanticQueryScope;
  warnings: string[];
  /** 选中的账户日里借了「最早已知」归属行的，逐条点名（对象形，只进 `lineage.warnings`）。 */
  labelBasis: LineageWarning[];
}
export type DashboardScopeResolver = (scope: SemanticQueryScope, filters: DashboardFilters) => Promise<DashboardScopeSelection>;
const key = (row: { media: string; accountId: string }) => JSON.stringify([row.media, row.accountId]);
function fail(): never { throw new AccountDimensionEvidenceError("UPSTREAM_INVALID_RESPONSE"); }

/** Labels select account-days inside already approved tuples. The same RR/RO
 * connection must serve metadata, metrics, assessment and coverage. Never takes
 * workspace/media/account scope from a browser filter or naming payload.
 *
 * v1.9.49 ①（Q-044 ③）：标签按账户日取。账户 9-10 从张三改名李四，按「张三」筛 9 月上旬，
 * 那几天必须还在——原来只读最新一行，整户在整个窗口里都归李四，筛出来是空的，而且不报错。
 */
export function dashboardScopeResolver(reader: DashboardFilterReader): DashboardScopeResolver {
  return async (scope, rawFilters) => {
    const filters = dashboardFiltersSchema.parse(rawFilters);
    const input = dashboardDayRequestSchema.parse({ workspaceId: scope.workspaceId, accounts: scope.filters?.accountScopes,
      dateFrom: scope.dateFrom, dateTo: scope.dateTo });
    if (scope.filters?.accountDays !== undefined) return fail();
    if (Object.keys(filters).length === 0) return { scope, warnings: [], labelBasis: [] };
    if (input.accounts.length === 0) return { scope: { ...scope, filters: { ...scope.filters, accountDays: [] } }, warnings: [], labelBasis: [] };
    const allowed = new Set(input.accounts.map(key));
    const days = dashboardAccountDaySchema.array().max(10000).parse(await reader.loadDays(input));
    const span = (Date.parse(input.dateTo) - Date.parse(input.dateFrom)) / 86400000 + 1;
    if (days.length !== input.accounts.length * span || days.some(row => row.workspaceId !== input.workspaceId || !allowed.has(key(row)) ||
      row.ds < input.dateFrom || row.ds > input.dateTo)) return fail();
    boundedAccountDaysSchema.parse(days.map(({ media, accountId, ds }) => ({ media, accountId, ds })));
    const labels = filters.optimizer || filters.goal || filters.resource_position
      ? await reader.loadLabels({ workspaceId: input.workspaceId, accounts: input.accounts, from: input.dateFrom, to: input.dateTo })
      : null;
    const warnings = new Set<string>(), borrowed: LabelBasisEarliestKnownWarning[] = [];
    const matches = compileDashboardFilters(filters);
    const selected: { media: string; accountId: string; ds: string }[] = [];
    for (const row of days) {
      const basis = labels === null ? null : labels.on(row, row.ds);
      if (labels !== null) {
        if (basis === null) warnings.add("NAMING_PARSE_MISSING");
        else {
          // 解释不了的证据不当「未标注」放过去：那户会从筛选结果里悄悄消失，比报错更难发现。
          if (basis.dimensions === null || basis.namedDimensionsInvalid) return fail();
          if (!basis.nameMatches) warnings.add("NAMING_PARSE_STALE");
          if (basis.ruleMissing) warnings.add("NAMING_RULE_MISSING");
        }
      }
      const label = (dimension: string) => basis?.dimensions?.[dimension]?.value ?? null;
      if ((scope.filters?.taskId !== undefined && row.taskId !== scope.filters.taskId) || !matches({
        optimizer: label("optimizer"), goal: label("goal"), placement: label("placement"), biz: row.bizName, taskId: row.taskId,
      })) continue;
      selected.push({ media: row.media, accountId: row.accountId, ds: row.ds });
      if (basis?.earliestKnown) borrowed.push(labelBasisEarliestKnownWarning({ media: row.media, accountId: row.accountId, businessDate: row.ds }));
    }
    return { scope: { ...scope, filters: { ...scope.filters, accountDays: boundedAccountDaysSchema.parse(selected) } },
      warnings: [...warnings], labelBasis: capLabelBasisWarnings(borrowed) };
  };
}

export function createDashboardScopeResolver(connection: SemanticReadConnection): DashboardScopeResolver {
  const days = new DashboardAccountDaysRepository(connection);
  // 归属与账户日、指标、判定读同一个 RR/RO 快照：筛选依据和被筛的数不会分属两个时刻。
  return dashboardScopeResolver({ loadDays: days.load.bind(days), loadLabels: (input) => resolveAccountLabelsAsOf(connection, input) });
}
