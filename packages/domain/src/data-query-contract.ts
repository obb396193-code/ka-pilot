import { z } from "zod";

export const dataViewModeSchema = z.enum(["ka_data", "platform", "reconcile"]);
export type DataViewMode = z.infer<typeof dataViewModeSchema>;

export const dataQueryIdSchema = z.enum([
  "account.summary",
  "account.trend",
  "account.table",
  "account.anomalies",
  "account.detail",
  "reconcile.account_daily",
]);
export type DataQueryId = z.infer<typeof dataQueryIdSchema>;

export const availabilitySchema = z.enum([
  "available",
  "missing",
  "denominator_zero",
  "partial",
  "stale",
  "error",
]);
export type Availability = z.infer<typeof availabilitySchema>;

export const metricValueSchema = z
  .object({
    value: z.number().finite().nullable(),
    availability: availabilitySchema,
    reason: z.string().min(1).optional(),
  })
  .strict()
  .superRefine((metric, context) => {
    const mayCarryValue = metric.availability === "available" || metric.availability === "stale";
    if (mayCarryValue && metric.value === null) {
      context.addIssue({
        code: "custom",
        path: ["value"],
        message: `${metric.availability} metrics must carry a finite value`,
      });
    }
    if (!mayCarryValue && metric.value !== null) {
      context.addIssue({
        code: "custom",
        path: ["value"],
        message: `${metric.availability} metrics cannot carry a numeric value`,
      });
    }
  });
export type MetricValue = z.infer<typeof metricValueSchema>;

export const authorityUseCaseSchema = z.enum([
  "cross_media_operations",
  "historical_analysis",
  "product_material_adgroup_bi",
  "realtime_delivery",
  "hourly_pacing",
  "diagnostics",
  "pre_execution_check",
  "effect_measurement",
  "source_versioned_financials",
]);
export type AuthorityUseCase = z.infer<typeof authorityUseCaseSchema>;

export const sourceAuthoritySchema = z
  .object({
    policyVersion: z.string().min(1),
    useCase: authorityUseCaseSchema,
    role: z.enum([
      "default_authoritative",
      "comparison_reference",
      "source_versioned",
    ]),
  })
  .strict();
export type SourceAuthority = z.infer<typeof sourceAuthoritySchema>;

export const sourceLineageSchema = z
  .object({
    source: z.enum([
      "ka_data",
      "qihang_realtime",
      "qihang_offline",
      "canonical",
    ]),
    datasetVersion: z.string().min(1).nullable(),
    queryTemplateVersion: z.string().min(1),
    metricVersion: z.string().min(1),
    dataAsOf: z.string().datetime({ offset: true }).nullable(),
    timezone: z.string().min(1).nullable(),
    dayCut: z.string().min(1).nullable(),
    metadataAvailability: z.enum(["known", "partial", "unknown"]),
    authority: sourceAuthoritySchema,
    objectIdentity: z
      .object({
        objectType: z.literal("account"),
        joinKeys: z.tuple([
          z.literal("workspace_id"),
          z.literal("media"),
          z.literal("account_id"),
        ]),
      })
      .strict(),
    coverage: z
      .object({
        complete: z.boolean(),
        reason: z.string().min(1).optional(),
        requestedObjects: z.number().int().nonnegative().optional(),
        returnedObjects: z.number().int().nonnegative().optional(),
      })
      .strict(),
    truncated: z.boolean(),
    partial: z.boolean(),
  })
  .strict()
  .superRefine((lineage, context) => {
    if (lineage.truncated && !lineage.partial) {
      context.addIssue({
        code: "custom",
        path: ["partial"],
        message: "truncated lineage must also be partial",
      });
    }
    const sourceMetadata = [
      lineage.datasetVersion,
      lineage.dataAsOf,
      lineage.timezone,
      lineage.dayCut,
    ];
    const known = sourceMetadata.filter((value) => value !== null).length;
    if (lineage.metadataAvailability === "known" && known !== sourceMetadata.length) {
      context.addIssue({
        code: "custom",
        path: ["metadataAvailability"],
        message: "known lineage requires all source metadata",
      });
    }
    if (lineage.metadataAvailability === "unknown" && known !== 0) {
      context.addIssue({
        code: "custom",
        path: ["metadataAvailability"],
        message: "unknown lineage cannot claim source metadata",
      });
    }
    if (
      lineage.metadataAvailability === "partial" &&
      (known === 0 || known === sourceMetadata.length)
    ) {
      context.addIssue({
        code: "custom",
        path: ["metadataAvailability"],
        message: "partial lineage requires some but not all source metadata",
      });
    }
  });
export type SourceLineage = z.infer<typeof sourceLineageSchema>;

export const stableDataQueryErrorCodeSchema = z.enum([
  "INVALID_REQUEST",
  "UNAUTHORIZED",
  "FORBIDDEN",
  "QUERY_NOT_ALLOWED",
  "VIEW_UNSUPPORTED",
  "SOURCE_UNAVAILABLE",
  "SOURCE_TRUNCATED",
  "UPSTREAM_INVALID_RESPONSE",
  "UPSTREAM_TIMEOUT",
  "INTERNAL_ERROR",
]);
export type StableDataQueryErrorCode = z.infer<typeof stableDataQueryErrorCodeSchema>;

export const stableDataQueryErrorSchema = z
  .object({
    code: stableDataQueryErrorCodeSchema,
    message: z.string().min(1),
    retryable: z.boolean(),
    requestId: z.string().min(1),
  })
  .strict();
export type StableDataQueryError = z.infer<typeof stableDataQueryErrorSchema>;

export const dataQueryRequestSchema = z
  .object({
    queryId: dataQueryIdSchema,
    params: z.record(z.string(), z.unknown()),
    dataView: dataViewModeSchema,
  })
  .strict();
export type DataQueryRequest = z.infer<typeof dataQueryRequestSchema>;

export const sourceQueryResultSchema = z
  .object({
    status: z.enum(["ready", "unavailable"]),
    rows: z.array(z.record(z.string(), z.unknown())),
    returnedRowCount: z.number().int().nonnegative(),
    wholeResultTotal: metricValueSchema,
    lineage: sourceLineageSchema,
    warnings: z.array(z.string()),
    error: stableDataQueryErrorSchema.optional(),
  })
  .strict()
  .superRefine((result, context) => {
    if (result.rows.length !== result.returnedRowCount) {
      context.addIssue({
        code: "custom",
        path: ["returnedRowCount"],
        message: "returnedRowCount must equal the number of returned rows",
      });
    }
    if (
      (result.lineage.partial || result.lineage.truncated || !result.lineage.coverage.complete) &&
      result.wholeResultTotal.availability === "available"
    ) {
      context.addIssue({
        code: "custom",
        path: ["wholeResultTotal"],
        message: "wholeResultTotal cannot be available for partial or truncated data",
      });
    }
    if (result.status === "unavailable" && result.error === undefined) {
      context.addIssue({
        code: "custom",
        path: ["error"],
        message: "unavailable sources require a stable error",
      });
    }
    if (result.status === "unavailable" && result.rows.length > 0) {
      context.addIssue({
        code: "custom",
        path: ["rows"],
        message: "unavailable sources cannot carry rows",
      });
    }
    if (result.status === "ready" && result.error !== undefined) {
      context.addIssue({
        code: "custom",
        path: ["error"],
        message: "ready sources cannot carry an error",
      });
    }
  });
export type SourceQueryResult = z.infer<typeof sourceQueryResultSchema>;

export const reconcileMetricSchema = z
  .object({
    kaData: metricValueSchema,
    platform: metricValueSchema,
    delta: metricValueSchema,
    deltaRate: metricValueSchema,
    comparable: z.boolean(),
    reason: z.string().min(1).optional(),
  })
  .strict()
  .superRefine((comparison, context) => {
    if (
      comparison.comparable &&
      (comparison.kaData.availability !== "available" ||
        comparison.platform.availability !== "available")
    ) {
      context.addIssue({
        code: "custom",
        path: ["comparable"],
        message: "only two available source values can be comparable",
      });
    }
    if (!comparison.comparable) {
      for (const field of ["delta", "deltaRate"] as const) {
        if (comparison[field].availability === "available") {
          context.addIssue({
            code: "custom",
            path: [field],
            message: `${field} cannot be available when values are not comparable`,
          });
        }
      }
    }
  });

export const reconcileRowSchema = z
  .object({
    key: z.record(z.string(), z.union([z.string(), z.number(), z.boolean(), z.null()])),
    metrics: z.record(z.string(), reconcileMetricSchema),
  })
  .strict();

export const reconcileComparisonReasonSchema = z.enum([
  "source_missing",
  "source_unavailable",
  "partial_source",
  "metric_not_comparable",
  "reconciliation_engine_pending",
]);

const singleSourceDataSchema = z
  .object({
    mode: z.enum(["ka_data", "platform"]),
    source: sourceQueryResultSchema,
  })
  .strict();

const reconcileDataSchema = z
  .object({
    mode: z.literal("reconcile"),
    kaData: sourceQueryResultSchema,
    platform: sourceQueryResultSchema,
    comparison: z
      .object({
        status: z.enum(["ready", "unavailable"]),
        reason: reconcileComparisonReasonSchema.optional(),
        rows: z.array(reconcileRowSchema),
      })
      .strict(),
  })
  .strict();

export const dataQuerySuccessDataSchema = z.discriminatedUnion("mode", [
  singleSourceDataSchema,
  reconcileDataSchema,
]);
export type DataQuerySuccessData = z.infer<typeof dataQuerySuccessDataSchema>;

export const dataQueryResponseSchema = z.discriminatedUnion("ok", [
  z.object({ ok: z.literal(true), data: dataQuerySuccessDataSchema }).strict(),
  z.object({ ok: z.literal(false), error: stableDataQueryErrorSchema }).strict(),
]);
export type DataQueryResponse = z.infer<typeof dataQueryResponseSchema>;
