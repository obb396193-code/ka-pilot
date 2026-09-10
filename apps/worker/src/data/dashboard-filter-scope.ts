import {
  AccountDimensionEvidenceRepository, AccountDimensionRuleRepository, DashboardAccountDaysRepository,
  AccountDimensionEvidenceError, type SemanticQueryScope, type SemanticReadConnection,
} from "@ka/db";
import {
  dashboardFiltersSchema, dashboardDayRequestSchema, dashboardAccountDaySchema, boundedAccountDaysSchema,
  accountDimensionRuleSchema, resolveNamedDimensions, compileDashboardFilters, type DashboardFilters,
} from "@ka/domain";

export interface DashboardFilterReader {
  loadDays: DashboardAccountDaysRepository["load"];
  loadEvidence: AccountDimensionEvidenceRepository["load"];
  loadRules: AccountDimensionRuleRepository["load"];
}
export type DashboardScopeResolver = (scope: SemanticQueryScope, filters: DashboardFilters) => Promise<{ scope: SemanticQueryScope; warnings: string[] }>;
const key = (row: { media: string; accountId: string }) => JSON.stringify([row.media, row.accountId]);
function fail(): never { throw new AccountDimensionEvidenceError("UPSTREAM_INVALID_RESPONSE"); }

/** Labels select account-days inside already approved tuples. The same RR/RO
 * connection must serve metadata, metrics, assessment and coverage. Never takes
 * workspace/media/account scope from a browser filter or naming payload.
 */
export function dashboardScopeResolver(reader: DashboardFilterReader): DashboardScopeResolver {
  return async (scope, rawFilters) => {
    const filters = dashboardFiltersSchema.parse(rawFilters);
    const input = dashboardDayRequestSchema.parse({ workspaceId: scope.workspaceId, accounts: scope.filters?.accountScopes,
      dateFrom: scope.dateFrom, dateTo: scope.dateTo });
    if (scope.filters?.accountDays !== undefined) return fail();
    if (Object.keys(filters).length === 0) return { scope, warnings: [] };
    if (input.accounts.length === 0) return { scope: { ...scope, filters: { ...scope.filters, accountDays: [] } }, warnings: [] };
    const allowed = new Set(input.accounts.map(key));
    const days = dashboardAccountDaySchema.array().max(10000).parse(await reader.loadDays(input));
    const span = (Date.parse(input.dateTo) - Date.parse(input.dateFrom)) / 86400000 + 1;
    if (days.length !== input.accounts.length * span || days.some(row => row.workspaceId !== input.workspaceId || !allowed.has(key(row)) ||
      row.ds < input.dateFrom || row.ds > input.dateTo)) return fail();
    boundedAccountDaysSchema.parse(days.map(({ media, accountId, ds }) => ({ media, accountId, ds })));
    const warnings = new Set<string>(), named = new Map<string, ReturnType<typeof resolveNamedDimensions>>();
    if (filters.optimizer || filters.goal || filters.resource_position) {
      const evidenceScope = { workspaceId: input.workspaceId, accounts: input.accounts };
      const evidence = await reader.loadEvidence(evidenceScope), rules = await reader.loadRules(evidenceScope);
      for (const rows of [evidence, rules]) {
        if (!Array.isArray(rows) || rows.length !== input.accounts.length || Buffer.byteLength(JSON.stringify(rows)) >= 16 * 1024 * 1024 ||
          rows.some(row => !row || row.workspaceId !== input.workspaceId || !allowed.has(key(row))) || new Set(rows.map(key)).size !== rows.length) return fail();
      }
      const rulesByKey = new Map(rules.map(row => [key(row), accountDimensionRuleSchema.parse(row)]));
      for (const row of evidence) {
        const rule = rulesByKey.get(key(row));
        if (!rule || rule.ruleVersion !== (row.parse?.ruleVersion ?? null)) return fail();
        if (row.parse === null) { warnings.add("NAMING_PARSE_MISSING"); continue; }
        if (!row.parse.nameMatches) warnings.add("NAMING_PARSE_STALE");
        if (rule.mappings === null) warnings.add("NAMING_RULE_MISSING");
        try { named.set(key(row), resolveNamedDimensions({ segments: row.parse.segments, override: row.parse.override ?? {},
          nameMatches: row.parse.nameMatches, ruleMappings: rule.mappings })); } catch { return fail(); }
      }
    }
    const matches = compileDashboardFilters(filters);
    const selected = days.filter(row => {
      const labels = named.get(key(row));
      return (scope.filters?.taskId === undefined || row.taskId === scope.filters.taskId) && matches({
        optimizer: labels?.optimizer.value ?? null, goal: labels?.goal.value ?? null, placement: labels?.placement.value ?? null,
        biz: row.bizName, taskId: row.taskId,
      });
    }).map(({ media, accountId, ds }) => ({ media, accountId, ds }));
    return { scope: { ...scope, filters: { ...scope.filters, accountDays: boundedAccountDaysSchema.parse(selected) } }, warnings: [...warnings] };
  };
}

export function createDashboardScopeResolver(connection: SemanticReadConnection): DashboardScopeResolver {
  const days = new DashboardAccountDaysRepository(connection), evidence = new AccountDimensionEvidenceRepository(connection), rules = new AccountDimensionRuleRepository(connection);
  return dashboardScopeResolver({ loadDays: days.load.bind(days), loadEvidence: evidence.load.bind(evidence), loadRules: rules.load.bind(rules) });
}
