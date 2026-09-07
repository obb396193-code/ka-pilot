import { z } from "zod";
import { calendarDateSchema, metricValue } from "@ka/domain";
import type { KaDataWindowQueryPlan, ResolvedDataQuery } from "./query-registry.js";

const metric = z.number().finite().nullable();
const rowSchema = z.object({
  ds: calendarDateSchema, media: z.string().regex(/^[A-Z0-9_]{1,32}$/),
  account_id: z.union([z.string().regex(/^[A-Za-z0-9_-]{1,128}$/), z.number().int().nonnegative().safe()]).transform(String),
  observed: z.union([z.literal(0), z.literal(1)]),
  cost_yuan: metric, cash_yuan: metric, show: metric, click: metric, conv: metric, cash_assessment: metric,
}).strict().refine((row) => row.observed === 1 ||
  [row.cost_yuan, row.cash_yuan, row.show, row.click, row.conv, row.cash_assessment].every((value) => value === null),
"missing member cannot carry metric values");

/** Only the registered SQL's full expected grid is accepted. No caller/source workspace is trusted. */
export function decodeKaWindowMembers(input: unknown, plan: KaDataWindowQueryPlan, resolved: ResolvedDataQuery, workspaceId: string) {
  const rows = z.array(rowSchema).max(10000).parse(input);
  const windows = plan.previousWindow ? [plan.previousWindow, plan.window] : [plan.window];
  const dates = new Set<string>();
  for (const window of windows) {
    for (let timestamp = Date.parse(window.from); timestamp <= Date.parse(window.to); timestamp += 86400000) {
      dates.add(new Date(timestamp).toISOString().slice(0, 10));
    }
  }
  const requested = resolved.params.accountId === undefined ? resolved.params.accountIds : [resolved.params.accountId];
  const keys = new Set<string>(), accounts = new Set<string>(), observedAccounts = new Set<string>();
  for (const row of rows) {
    const key = JSON.stringify([row.media, row.account_id, row.ds]);
    if (!dates.has(row.ds) || keys.has(key) ||
      (resolved.params.media !== undefined && row.media !== resolved.params.media) ||
      (requested !== undefined && !requested.includes(row.account_id))) throw new Error("Invalid window member scope");
    keys.add(key); accounts.add(JSON.stringify([row.media, row.account_id]));
    if (row.observed === 1) observedAccounts.add(JSON.stringify([row.media, row.account_id]));
  }
  if (rows.length !== accounts.size * dates.size || observedAccounts.size !== accounts.size) {
    throw new Error("Incomplete expected window member grid");
  }
  return rows.map((row) => ({
    workspaceId, media: row.media, accountId: row.account_id, ds: row.ds, observed: row.observed === 1,
    cost: metricValue(row.cost_yuan), cashCost: metricValue(row.cash_yuan),
    exposure: metricValue(row.show), click: metricValue(row.click), realConversion: metricValue(row.conv),
    price: row.cash_assessment,
  }));
}
export type KaWindowMember = ReturnType<typeof decodeKaWindowMembers>[number];
