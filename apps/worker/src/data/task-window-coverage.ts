import { calendarDateSchema } from "@ka/domain";
import { SemanticQueryContractError, type SemanticLineageResult, type SemanticQueryScope } from "@ka/db";

/** Internal proof only. A task's eligible calendar is not the complete date window or the grant list. */
export function taskWindowDates(scope: SemanticQueryScope, lineage: SemanticLineageResult): string[] {
  const dates = calendarDateSchema.array().max(366).safeParse(lineage.requestedDates);
  const accounts = scope.filters?.accountScopes;
  const expected = lineage.requestedAccountDays;
  if (!dates.success || accounts === undefined ||
    ![expected, lineage.canonicalRows, lineage.returnedAccounts, lineage.returnedAccountDays].every((n) => Number.isSafeInteger(n) && n >= 0) ||
    lineage.canonicalRows !== lineage.returnedAccountDays || lineage.returnedAccountDays > expected ||
    lineage.returnedAccounts > Math.min(accounts.length, lineage.returnedAccountDays) ||
    dates.data.length > expected || expected > dates.data.length * accounts.length ||
    dates.data.some((ds, i) => ds < scope.dateFrom || ds > scope.dateTo || (i > 0 && ds <= dates.data[i - 1]!))) {
    throw new SemanticQueryContractError("Invalid window source result");
  }
  return dates.data;
}

export function assertTaskWindowDates(scope: SemanticQueryScope, lineage: SemanticLineageResult, actual: string[]): void {
  const expected = taskWindowDates(scope, lineage);
  const dates = [...new Set(actual)].sort();
  if (dates.length !== expected.length || dates.some((ds, i) => ds !== expected[i])) {
    throw new SemanticQueryContractError("Invalid window source result");
  }
}
