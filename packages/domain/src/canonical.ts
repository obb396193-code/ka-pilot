export type RawMetricRow = Record<string, unknown>;

export type CanonicalFieldSource =
  | "offline"
  | "realtime"
  | "realtime_fill"
  | "gap_filled"
  | "unavailable";

export interface CanonicalAccountBase {
  accountId: string;
  ds: string;
  cost: number | null;
  exposure: number | null;
  click: number | null;
  conversion: number | null;
  realConversion: number | null;
  cash: number | null;
  compensation: number | null;
  wakeUv: number | null;
  potentialUv: number | null;
  budget: number | null;
  budgetUsageRate: number | null;
  deductionRate: number | null;
  mainAdCostProportion: number | null;
  assessmentPrice: number | null;
  gapFilledByRealtime: boolean;
  fieldSources: Record<string, CanonicalFieldSource>;
}

export interface CanonicalMergeInput {
  ds: string;
  reportDate: string;
  offline?: RawMetricRow;
  realtime?: RawMetricRow;
}

function numeric(row: RawMetricRow | undefined, field: string): number | null {
  const value = row?.[field];
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : null;
  }
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function accountId(row: RawMetricRow | undefined): string | null {
  const value = row?.account_id;
  return typeof value === "string" || typeof value === "number" ? String(value) : null;
}

function resolveCanonicalAccount(
  offline: RawMetricRow | undefined,
  realtime: RawMetricRow | undefined,
): string {
  const offlineAccount = accountId(offline);
  const realtimeAccount = accountId(realtime);
  if (offlineAccount && realtimeAccount && offlineAccount !== realtimeAccount) {
    throw new Error("Cannot merge rows from different accounts");
  }
  const resolved = offlineAccount ?? realtimeAccount;
  if (!resolved) {
    throw new Error("Cannot merge canonical row without account_id");
  }
  return resolved;
}

function put(
  target: CanonicalAccountBase,
  field: keyof Omit<CanonicalAccountBase, "accountId" | "ds" | "gapFilledByRealtime" | "fieldSources">,
  value: number | null,
  source: CanonicalFieldSource,
): void {
  target[field] = value;
  target.fieldSources[field] = source;
}

function blank(account: string, ds: string): CanonicalAccountBase {
  return {
    accountId: account,
    ds,
    cost: null,
    exposure: null,
    click: null,
    conversion: null,
    realConversion: null,
    cash: null,
    compensation: null,
    wakeUv: null,
    potentialUv: null,
    budget: null,
    budgetUsageRate: null,
    deductionRate: null,
    mainAdCostProportion: null,
    assessmentPrice: null,
    gapFilledByRealtime: false,
    fieldSources: {},
  };
}

function applyRealtime(
  target: CanonicalAccountBase,
  realtime: RawMetricRow | undefined,
  source: CanonicalFieldSource,
  includeDelivery: boolean,
): void {
  if (includeDelivery) {
    put(target, "cost", numeric(realtime, "account_cost"), source);
    put(target, "exposure", numeric(realtime, "account_exposure"), source);
    put(target, "click", numeric(realtime, "account_click"), source);
  }
  put(target, "conversion", numeric(realtime, "account_conversion"), source);
  put(target, "realConversion", numeric(realtime, "account_real_conversion"), source);
  put(target, "budget", numeric(realtime, "account_budget"), source);
  put(target, "budgetUsageRate", numeric(realtime, "account_budget_usage_rate"), source);
  put(target, "deductionRate", numeric(realtime, "account_deduction_rate"), source);
  put(
    target,
    "mainAdCostProportion",
    numeric(realtime, "account_main_ad_cost_proportion"),
    source,
  );
  put(target, "assessmentPrice", numeric(realtime, "assessment_cost"), source);
}

function applyOffline(target: CanonicalAccountBase, offline: RawMetricRow): void {
  put(target, "cost", numeric(offline, "cost_api"), "offline");
  put(target, "exposure", numeric(offline, "exp_pv_api"), "offline");
  put(target, "click", numeric(offline, "clk_api"), "offline");
  put(target, "cash", numeric(offline, "cash"), "offline");
  put(target, "compensation", numeric(offline, "income"), "offline");
  put(target, "wakeUv", numeric(offline, "wake_uv"), "offline");
  put(target, "potentialUv", numeric(offline, "aac_ptt_uv"), "offline");
  const realConversion = numeric(offline, "account_real_conversion");
  if (realConversion !== null) {
    put(target, "realConversion", realConversion, "offline");
  }
}

export function mergeAccountCanonical(input: CanonicalMergeInput): CanonicalAccountBase {
  const result = blank(resolveCanonicalAccount(input.offline, input.realtime), input.ds);
  const isToday = input.ds === input.reportDate;
  if (isToday) {
    if (!input.realtime) {
      throw new Error("Today canonical row requires realtime data");
    }
    applyRealtime(result, input.realtime, "realtime", true);
    return result;
  }

  if (!input.offline) {
    if (!input.realtime) {
      throw new Error("Historical canonical row requires an offline or realtime row");
    }
    result.gapFilledByRealtime = true;
    applyRealtime(result, input.realtime, "gap_filled", true);
    return result;
  }

  applyRealtime(result, input.realtime, input.realtime ? "realtime_fill" : "unavailable", false);
  applyOffline(result, input.offline);
  return result;
}
