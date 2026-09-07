import {
  computeKaDailyWindowAssessment, sumMetricValues, summaryWindowRowSchema,
  compareWindowPoints, unavailableWindowComparison,
} from "@ka/domain";
import { canonicalSummaryBaseRow } from "./canonical-query-rows.js";
import type { KaWindowMember } from "./ka-window-members.js";

type Window = { from: string; to: string };
const tuple = (member: KaWindowMember) => JSON.stringify([member.media, member.accountId]);
function summarize(members: readonly KaWindowMember[], window: Window) {
  const rows = members.filter((member) => member.ds >= window.from && member.ds <= window.to);
  const observed = rows.filter((member) => member.observed);
  const sum = (key: "cost" | "cashCost" | "exposure" | "click" | "realConversion") => sumMetricValues(rows.map((row) => row[key])).value;
  const base = canonicalSummaryBaseRow({ row_count: observed.length, account_count: new Set(observed.map(tuple)).size,
    cost: sum("cost"), cash_cost: sum("cashCost"), exposure: sum("exposure"), click: sum("click"), real_conversion: sum("realConversion"),
  }, "ka_data");
  const assessmentRows = (items: readonly KaWindowMember[]) => items.map(({ ds, cashCost, realConversion, price }) => ({ ds, cashCost, realConversion, price }));
  const assessment = computeKaDailyWindowAssessment(assessmentRows(rows));
  const accounts = new Map<string, KaWindowMember[]>();
  for (const row of rows) {
    const key = tuple(row), items = accounts.get(key) ?? [];
    items.push(row); accounts.set(key, items);
  }
  let determinable = 0, onTarget = 0;
  for (const items of accounts.values()) {
    const result = computeKaDailyWindowAssessment(assessmentRows(items)).assessment.onTarget;
    if (result !== null) { determinable++; if (result) onTarget++; }
  }
  const onTargetRate = determinable === 0 ? { value: null, state: "undefined" as const }
    : { value: onTarget / determinable, state: "finite" as const };
  return {
    row: summaryWindowRowSchema.parse({ ...base, metrics: { ...base.metrics, costSpace: assessment.costSpace }, assessment: assessment.assessment }),
    point: { cost: base.metrics.cost, cashCost: base.metrics.cashCost, realConversion: base.metrics.realConversion,
      cashCpa: base.metrics.ratios.cashCpa, onTargetRate },
    warnings: assessment.warnings,
  };
}

/** Only call with the registered reader's validated complete member grid, never an arbitrary partial page. */
export function summarizeKaWindowMembers(members: readonly KaWindowMember[], window: Window, previousWindow: Window | null, compare?: "dod" | "wow") {
  const current = summarize(members, window);
  const comparison = compare === undefined ? undefined : previousWindow === null ? unavailableWindowComparison(compare)
    : compareWindowPoints(compare, current.point, summarize(members, previousWindow).point);
  return {
    row: summaryWindowRowSchema.parse({ ...current.row, ...(comparison === undefined ? {} : { compare: comparison }) }),
    warnings: [...current.warnings, "BUDGET_SOURCE_NOT_READY"],
  };
}

export function trendKaWindowMembers(members: readonly KaWindowMember[]) {
  return [...new Set(members.map((member) => member.ds))].sort().map((ds) => ({
    ds, metrics: summarize(members.filter((member) => member.ds === ds), { from: ds, to: ds }).row.metrics,
  }));
}
