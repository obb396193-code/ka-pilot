import { z } from "zod";
import { calendarDateSchema } from "./data-query-base-rows.js";

export const etlBatchAccountIdsSchema = z.array(z.string().min(1).max(256)
  .refine(value => value === value.trim() && !/\p{Cc}/u.test(value)))
  .min(1).max(1000).refine(ids => new Set(ids).size === ids.length);
export const etlBatchMediaSchema = z.string().min(1).max(32).regex(/^[A-Z0-9_]+$/)
  .refine(value => !/\s/.test(value));
/** Frozen v1.9.8 public warning. Error body and credential identity never belong here. */
export const etlBatchFailureWarningSchema = z.object({
  code: z.literal("BATCH_FAILED"), resource: z.enum(["account_offline", "account_realtime", "ad_realtime"]),
  ds: calendarDateSchema, accountIds: etlBatchAccountIdsSchema,
  fingerprint: z.string().length(64).regex(/^[0-9a-f]+$/),
}).strict();
export type EtlBatchFailureWarning = z.infer<typeof etlBatchFailureWarningSchema>;
/** Private immutable run snapshot; derived from the authorized ETL request, not source rows. */
export const etlBatchScopeSchema = z.object({
  workspaceId: z.string().uuid(), media: etlBatchMediaSchema,
  accountIds: etlBatchAccountIdsSchema, dateFrom: calendarDateSchema, dateTo: calendarDateSchema,
}).strict().refine(scope => scope.dateFrom <= scope.dateTo &&
  Date.parse(scope.dateTo) - Date.parse(scope.dateFrom) <= 30 * 86_400_000);
export type EtlBatchScope = z.infer<typeof etlBatchScopeSchema>;
/** Private request coverage, never appended to the public warning. Missing means full-day/all ads. */
export const etlBatchAdFiltersSchema = z.object({
  hh: z.number().int().min(0).max(24).optional(),
  adIds: etlBatchAccountIdsSchema.optional(),
}).strict();
export const etlBatchFailureEvidenceSchema = etlBatchFailureWarningSchema.extend({
  media: etlBatchMediaSchema, failedAt: z.iso.datetime({ offset: true }),
  filters: etlBatchAdFiltersSchema.optional(),
}).refine(value => value.filters === undefined || value.resource === "ad_realtime");
export type EtlBatchFailureEvidence = z.infer<typeof etlBatchFailureEvidenceSchema>;
export const recordEtlBatchFailureSchema = z.object({
  workspaceId: z.string().uuid(), jobId: z.string().uuid(), leaseToken: z.string().uuid(),
  runId: z.string().regex(/^[1-9][0-9]{0,18}$/).refine(id => id.length < 19 || id <= "9223372036854775807"),
  warning: etlBatchFailureWarningSchema,
  filters: etlBatchAdFiltersSchema.optional(),
}).strict().refine(value => value.filters === undefined || value.warning.resource === "ad_realtime");
export type RecordEtlBatchFailure = z.infer<typeof recordEtlBatchFailureSchema>;
