import { safeDivide } from "./metrics.js";
import type { RatioValue } from "./types.js";

export const MIN_STRATEGY_ACCOUNTS = 3;
export const MIN_STRATEGY_COST = 100;

export interface StrategyObservation {
  rowKey: string;
  rowLabel: string | null;
  columnKey: string;
  columnLabel: string | null;
  accountId: string;
  cost: number;
  realConversion: number;
}

export type StrategyExclusionReason =
  | "insufficient_accounts"
  | "insufficient_cost"
  | "non_finite_cpa";

export interface StrategyCell {
  rowKey: string;
  rowLabel: string | null;
  columnKey: string;
  columnLabel: string | null;
  accountCount: number;
  cost: number;
  realConversion: number;
  realCpa: RatioValue;
  eligible: boolean;
  exclusionReasons: StrategyExclusionReason[];
}

export interface StrategyMatrixResult {
  cells: StrategyCell[];
  winner: StrategyCell | null;
}

interface MutableCell {
  rowKey: string;
  rowLabel: string | null;
  columnKey: string;
  columnLabel: string | null;
  accounts: Set<string>;
  cost: number;
  realConversion: number;
}

function safeIdentity(value: string, field: string): string {
  const normalized = value.trim();
  if (normalized === "" || normalized.length > 128) {
    throw new Error(`${field} must contain 1 to 128 characters`);
  }
  return normalized;
}

function safeLabel(value: string | null, field: string): string | null {
  if (value === null) return null;
  return safeIdentity(value, field);
}

function safeMetric(value: number, field: string): number {
  if (!Number.isFinite(value) || value < 0) {
    throw new Error(`${field} must be a finite nonnegative number`);
  }
  return value;
}

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function compareCellIdentity(left: StrategyCell, right: StrategyCell): number {
  return compareText(left.rowKey, right.rowKey) || compareText(left.columnKey, right.columnKey);
}

function assertLabelStable(
  current: string | null,
  incoming: string | null,
  field: string,
): string | null {
  if (current !== null && incoming !== null && current !== incoming) {
    throw new Error(`${field} must be stable for the same strategy key`);
  }
  return current ?? incoming;
}

function addObservation(groups: Map<string, MutableCell>, raw: StrategyObservation): void {
  const rowKey = safeIdentity(raw.rowKey, "rowKey");
  const columnKey = safeIdentity(raw.columnKey, "columnKey");
  const rowLabel = safeLabel(raw.rowLabel, "rowLabel");
  const columnLabel = safeLabel(raw.columnLabel, "columnLabel");
  const accountId = safeIdentity(raw.accountId, "accountId");
  const cost = safeMetric(raw.cost, "cost");
  const realConversion = safeMetric(raw.realConversion, "realConversion");
  const groupKey = JSON.stringify([rowKey, columnKey]);
  const existing = groups.get(groupKey);
  if (existing === undefined) {
    groups.set(groupKey, {
      rowKey,
      rowLabel,
      columnKey,
      columnLabel,
      accounts: new Set([accountId]),
      cost,
      realConversion,
    });
    return;
  }
  existing.rowLabel = assertLabelStable(existing.rowLabel, rowLabel, "rowLabel");
  existing.columnLabel = assertLabelStable(existing.columnLabel, columnLabel, "columnLabel");
  existing.accounts.add(accountId);
  existing.cost += cost;
  existing.realConversion += realConversion;
}

function finalizeCell(group: MutableCell): StrategyCell {
  const accountCount = group.accounts.size;
  const realCpa = safeDivide(group.cost, group.realConversion, {
    infiniteWhenPositiveNumerator: true,
  });
  const exclusionReasons: StrategyExclusionReason[] = [];
  if (accountCount < MIN_STRATEGY_ACCOUNTS) exclusionReasons.push("insufficient_accounts");
  if (group.cost < MIN_STRATEGY_COST) exclusionReasons.push("insufficient_cost");
  if (realCpa.state !== "finite") exclusionReasons.push("non_finite_cpa");
  return {
    rowKey: group.rowKey,
    rowLabel: group.rowLabel,
    columnKey: group.columnKey,
    columnLabel: group.columnLabel,
    accountCount,
    cost: group.cost,
    realConversion: group.realConversion,
    realCpa,
    eligible: exclusionReasons.length === 0,
    exclusionReasons,
  };
}

function compareWinner(left: StrategyCell, right: StrategyCell): number {
  const leftCpa = left.realCpa.value as number;
  const rightCpa = right.realCpa.value as number;
  return leftCpa - rightCpa || compareCellIdentity(left, right);
}

export function analyzeStrategyMatrix(
  observations: readonly StrategyObservation[],
): StrategyMatrixResult {
  const groups = new Map<string, MutableCell>();
  observations.forEach((observation) => addObservation(groups, observation));
  const cells = [...groups.values()].map(finalizeCell).sort(compareCellIdentity);
  const candidates = cells.filter((cell) => cell.eligible).sort(compareWinner);
  return { cells, winner: candidates[0] ?? null };
}
