export * from "./data-query-base-rows.js";
import { z } from "zod";
import { accountDailyRowSchema, accountAnomalyRowSchema } from "./data-query-base-rows.js";
import { summaryWindowRowSchema, trendWindowRowSchema } from "./summary-window.js";
import { dimensionWindowRowSchema } from "./dimension-window-rows.js";
import { pivotWindowRowSchema } from "./pivot-window.js";
import { accountHourlyRowSchema, accountGapRowSchema } from "./operational-query-rows.js";
export { trendWindowRowSchema as accountTrendRowSchema } from "./summary-window.js";
export type AccountTrendRow = z.infer<typeof trendWindowRowSchema>;

export const canonicalQueryRowSchemaById = {
  "account.gap": accountGapRowSchema,
  "account.hourly": accountHourlyRowSchema,
  "account.pivot2": pivotWindowRowSchema,
  "account.dimension": dimensionWindowRowSchema,
  "account.summary": summaryWindowRowSchema,
  "account.trend": trendWindowRowSchema,
  "account.table": accountDailyRowSchema,
  "account.anomalies": accountAnomalyRowSchema,
  "account.detail": accountDailyRowSchema,
  "reconcile.account_daily": accountDailyRowSchema,
} as const;
export const canonicalRowSchemaVersionByQueryId = {
  "account.gap": "account.gap/v1",
  "account.hourly": "account.hourly/v1",
  "account.pivot2": "account.pivot2/v1",
  "account.dimension": "account.dimension/v3",
  "account.summary": "account.summary/v3",
  "account.trend": "account.trend/v3",
  "account.table": "account.table/v2",
  "account.anomalies": "account.anomalies/v2",
  "account.detail": "account.detail/v2",
  "reconcile.account_daily": "reconcile.account_daily/v2",
} as const;
