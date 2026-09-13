import { z } from "zod";
import { calendarDateSchema } from "./data-query-base-rows.js";
import { canonicalMetricValueSchema, divideMetricValues, metricValue, type CanonicalMetricValue } from "./metric-value.js";
import { accountHourlyRowSchema, accountHourlyRowsSchema, type AccountHourlyRow } from "./operational-query-rows.js";

const tupleSchema = accountHourlyRowSchema.pick({ media: true, accountId: true });
const hourSchema = z.number().int().min(0).max(24);
const observationSchema = z.object({
  workspaceId: z.string().uuid(), date: calendarDateSchema, ...tupleSchema.shape, hh: hourSchema,
  cumulative: accountHourlyRowSchema.shape.cumulative, budget: canonicalMetricValueSchema,
  lastSyncAt: accountHourlyRowSchema.shape.lastSyncAt,
  // These are facts supplied by the trusted reader, never browser parameters.
  // hh by itself does not establish a complete one-hour interval or data freshness.
  completeHour: z.boolean(), elapsedDayFraction: z.number().finite().positive().max(1).nullable(),
}).strict();
const inputSchema = z.object({
  workspaceId: z.string().uuid(), date: calendarDateSchema, accounts: z.array(tupleSchema).max(1000),
  hhFrom: hourSchema, hhTo: hourSchema, observations: z.array(observationSchema).max(10000),
  /**
   * v1.9.39：**这一整天**采过样的账户（由仓储按整日单独问出来，不是从 `observations` 反推）。
   * 不给就退回旧行为（全部当已采过），老调用方不受影响。
   */
  sampledAccounts: z.array(tupleSchema).max(1000).optional(),
}).strict();
type Observation = z.infer<typeof observationSchema>;
const fields = ["cost", "cashCost", "conversion", "realConversion"] as const;
function key(tuple: { media: string; accountId: string }, hh?: number): string {
  return JSON.stringify([tuple.media, tuple.accountId, ...(hh === undefined ? [] : [hh])]);
}
function invalid(): never { throw new Error("Invalid account hourly evidence"); }
function difference(current: CanonicalMetricValue, previous: CanonicalMetricValue): CanonicalMetricValue {
  if (current.availability === "error" || previous.availability === "error") return { value: null, availability: "error" };
  if (current.availability !== "available" || previous.availability !== "available") return metricValue(null);
  const value = current.value - previous.value;
  // A correction is not zero spend/conversions. Preserve the observed cumulative
  // value and make the affected interval explicitly uncomputable.
  return value < 0 ? { value: null, availability: "error" } : metricValue(value);
}
function emptyVolume(): AccountHourlyRow["cumulative"] {
  return { cost: metricValue(null), cashCost: metricValue(null), conversion: metricValue(null), realConversion: metricValue(null) };
}
/**
 * v1.9.39：整天一行没采到的账户，空值是 `pending`（还没采）而不是 `missing`（采过了就是没有）。
 *
 * 两者在页面上都是「−」，但一个该等下一轮、一个该去查为什么没数。整日 25 行全 `missing`
 * 会让人以为这个账户当天真的没花钱，实际只是小时级采集还没跑到它。
 */
function pendingVolume(): AccountHourlyRow["cumulative"] {
  const pending = { value: null, availability: "pending" } as const;
  return { cost: pending, cashCost: pending, conversion: pending, realConversion: pending };
}

/** Pure arithmetic projection; not an authorization service or source completeness
 * claim. Caller supplies DB-approved tuples and normalized, same-day observations.
 * No ad-delta aggregation, default cash coefficient, assumed zero missing rows, or
 * synthesized freshness. Public query admission/lineage are separate boundaries.
 */
export function projectAccountHourly(raw: unknown): AccountHourlyRow[] {
  // Bound before recursive schema parsing. Missing/illegal structures fail closed.
  if (!raw || typeof raw !== "object" || !("observations" in raw) || !Array.isArray(raw.observations) || raw.observations.length > 10000) invalid();
  const input = inputSchema.parse(raw);
  const count = input.hhTo - input.hhFrom + 1;
  if (count < 1 || count * input.accounts.length > 10000) invalid();
  const allowed = new Set<string>(), observations = new Map<string, Observation>();
  for (const account of input.accounts) {
    const id = key(account); if (allowed.has(id)) invalid(); allowed.add(id);
  }
  const earliest = Math.max(0, input.hhFrom - 1);
  for (const observation of input.observations) {
    const id = key(observation, observation.hh);
    if (observation.workspaceId !== input.workspaceId || observation.date !== input.date ||
      !allowed.has(key(observation)) || observation.hh < earliest || observation.hh > input.hhTo || observations.has(id)) invalid();
    observations.set(id, observation);
  }
  const rows: AccountHourlyRow[] = [];
  const ordered = [...input.accounts].sort((a, b) => key(a) < key(b) ? -1 : key(a) > key(b) ? 1 : 0);
  // 名单缺席 = 老调用方，一切照旧；给了名单，名单外的账户就是「今天一行都没采到」。
  // 名单里出现授权范围外的账户属于证据自相矛盾，不能默默忽略。
  const sampled = input.sampledAccounts === undefined ? null : new Set(input.sampledAccounts.map(account => key(account)));
  if (sampled !== null) {
    for (const account of input.sampledAccounts!) if (!allowed.has(key(account))) invalid();
  }
  for (const account of ordered) {
    const unsampled = sampled !== null && !sampled.has(key(account));
    // 「整天没采到」却又交上来一条这一天的观测，是证据自相矛盾——两句话来自同一张表。
    // 容忍它就等于让两份互相打架的事实各显各的，而页面上看不出哪份是对的。
    if (unsampled && input.observations.some(observation => key(observation) === key(account))) invalid();
    for (let hh = input.hhFrom; hh <= input.hhTo; hh++) {
      const current = observations.get(key(account, hh)), previous = observations.get(key(account, hh - 1));
      const cumulative = current?.cumulative ?? (unsampled ? pendingVolume() : emptyVolume()), delta = emptyVolume();
      if (current && hh < 24) {
        for (const field of fields) delta[field] = difference(cumulative[field], hh === 0 ? metricValue(0) : previous?.cumulative[field] ?? metricValue(null));
      }
      const projectedDayCost = cumulative.cost.availability === "error" ? cumulative.cost :
        current?.elapsedDayFraction !== null && current?.elapsedDayFraction !== undefined && cumulative.cost.availability === "available"
          ? metricValue(cumulative.cost.value / current.elapsedDayFraction) : metricValue(null);
      rows.push({ ...account, hh, cumulative, delta,
        ratios: { cashCpa: divideMetricValues(cumulative.cashCost, cumulative.realConversion, { infiniteWhenPositiveNumerator: true }),
          realCpa: divideMetricValues(cumulative.cost, cumulative.realConversion, { infiniteWhenPositiveNumerator: true }) },
        velocity: { costPerHour: hh < 24 && current?.completeHour === true ? delta.cost : metricValue(null) },
        projectedDayCost, budgetUsage: divideMetricValues(cumulative.cost, current?.budget ?? metricValue(null)),
        lastSyncAt: current?.lastSyncAt ?? null });
    }
  }
  return accountHourlyRowsSchema.parse(rows);
}
