import { z } from "zod";
import { queryWindowSchema } from "./summary-window.js";
import { dimensionTypeSchema, dimensionWindowRowsSchema } from "./dimension-window-rows.js";
import { pivotWindowRowsSchema } from "./pivot-window.js";
import { accountHourlyRowsSchema, accountGapRowsSchema } from "./operational-query-rows.js";
import { calendarDateSchema } from "./data-query-base-rows.js";

import {
  canonicalQueryRowSchemaById,
  canonicalRowSchemaVersionByQueryId,
} from "./data-query-rows.js";

export const dataViewModeSchema = z.enum(["ka_data", "platform", "reconcile"]);
export type DataViewMode = z.infer<typeof dataViewModeSchema>;

export const dataQueryIdSchema = z.enum([
  "account.gap",
  "account.hourly",
  "account.pivot2",
  "account.dimension",
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
    workspaceKind: z.enum(["personal", "team"]),
    window: queryWindowSchema.optional(),
    warnings: z.array(z.string()).optional(),
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
  "DIMENSION_UNSUPPORTED",
  "SOURCE_UNAVAILABLE",
  "SOURCE_TRUNCATED",
  "UPSTREAM_INVALID_RESPONSE",
  "UPSTREAM_TIMEOUT",
  "INTERNAL_ERROR",
]);
export type StableDataQueryErrorCode = z.infer<typeof stableDataQueryErrorCodeSchema>;

export const requestIdSchema = z
  .string()
  .min(1)
  .max(128)
  .regex(/^[A-Za-z0-9][A-Za-z0-9._:-]*$/);
export type RequestId = z.infer<typeof requestIdSchema>;

export const stableDataQueryErrorSchema = z
  .object({
    code: stableDataQueryErrorCodeSchema,
    message: z.string().min(1),
    retryable: z.boolean(),
    requestId: requestIdSchema,
  })
  .strict();
export type StableDataQueryError = z.infer<typeof stableDataQueryErrorSchema>;

/** DATA-ROUTE-001: public source selection is never a request field. */
export const ordinaryDataQueryIdSchema = dataQueryIdSchema.exclude(["reconcile.account_daily"]);
export const ordinaryDataQueryRequestSchema = z.object({
  queryId: ordinaryDataQueryIdSchema,
  params: z.record(z.string(), z.unknown()),
}).strict();
export const adminReconcileRequestSchema = z.object({
  queryId: z.literal("reconcile.account_daily"),
  params: z.record(z.string(), z.unknown()),
}).strict();
export type OrdinaryDataQueryRequest = z.infer<typeof ordinaryDataQueryRequestSchema>;
export type AdminReconcileRequest = z.infer<typeof adminReconcileRequestSchema>;

export const dataQueryRequestSchema = ordinaryDataQueryRequestSchema;
export type DataQueryRequest = z.infer<typeof dataQueryRequestSchema>;

export const sourceQueryResultSchema = z
  .object({
    queryId: dataQueryIdSchema,
    groupBy: z.enum(["account", "task", "biz"]).optional(),
    dimension: dimensionTypeSchema.optional(),
    dimA: dimensionTypeSchema.optional(),
    dimB: dimensionTypeSchema.optional(),
    rowSchemaVersion: z.string().min(1),
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
    if (result.queryId === "account.gap") {
      if (result.groupBy === undefined || !result.lineage.window || !accountGapRowsSchema.safeParse(result.rows).success)
        context.addIssue({ code: "custom", message: "Gap requires its grouping, window and unique valid rows" });
    } else if (result.groupBy !== undefined) context.addIssue({ code: "custom", message: "Unexpected Gap grouping" });
    if (result.queryId === "account.hourly") {
      if (!accountHourlyRowsSchema.safeParse(result.rows).success || !result.lineage.window ||
        result.lineage.window.from !== result.lineage.window.to) {
        context.addIssue({ code: "custom", message: "Hourly rows require a unique account/hour set and one-day lineage window" });
      }
    }
    if ((result.queryId === "account.summary" || result.queryId === "account.trend" || result.queryId === "account.dimension" || result.queryId === "account.pivot2") && !result.lineage.window) {
      context.addIssue({ code: "custom", path: ["lineage", "window"], message: "Window queries require their resolved window" });
    }
    if (result.queryId === "account.dimension") {
      if (!dimensionWindowRowsSchema.safeParse({ dimension: result.dimension, rows: result.rows }).success) {
        context.addIssue({ code: "custom", path: ["dimension"], message: "Dimension and rows must match" });
      }
    } else if (result.dimension !== undefined) context.addIssue({ code: "custom", path: ["dimension"], message: "Unexpected dimension" });
    if (result.queryId === "account.pivot2") {
      if (!pivotWindowRowsSchema.safeParse({ queryId: result.queryId, rowSchemaVersion: result.rowSchemaVersion,
        dimA: result.dimA, dimB: result.dimB, rows: result.rows }).success) {
        context.addIssue({ code: "custom", path: ["rows"], message: "Invalid pivot dimensions or cells" });
      }
    } else if (result.dimA !== undefined || result.dimB !== undefined) {
      context.addIssue({ code: "custom", message: "Unexpected pivot dimensions" });
    }
    const expectedVersion = canonicalRowSchemaVersionByQueryId[result.queryId];
    if (result.rowSchemaVersion !== expectedVersion) {
      context.addIssue({
        code: "custom",
        path: ["rowSchemaVersion"],
        message: `rowSchemaVersion must be ${expectedVersion}`,
      });
    }
    const rowSchema = canonicalQueryRowSchemaById[result.queryId];
    result.rows.forEach((row, index) => {
      if (result.queryId === "account.summary" || result.queryId === "account.dimension" || result.queryId === "account.pivot2") {
        const assessment = row.assessment as { priceSource?: unknown } | undefined;
        const expectedSource = result.lineage.workspaceKind === "team" ? "ka_daily" : "history";
        if (assessment?.priceSource !== expectedSource) context.addIssue({ code: "custom", path: ["rows", index], message: "Assessment price source does not match workspace kind" });
      }
      if (result.queryId === "account.trend" && result.lineage.window &&
        (typeof row.ds !== "string" || row.ds < result.lineage.window.from || row.ds > result.lineage.window.to)) {
        context.addIssue({ code: "custom", path: ["rows", index], message: "Trend row is outside the requested window" });
      }
      const parsed = rowSchema.safeParse(row);
      if (!parsed.success) {
        context.addIssue({
          code: "custom",
          path: ["rows", index],
          message: `row does not match the canonical ${result.queryId} schema`,
        });
      }
    });
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

export const pivotCellCoverageSchema = z.object({ cells: z.number().int().min(0).max(10000),
  withData: z.number().int().min(0).max(10000), undeterminable: z.number().int().min(0).max(10000),
}).strict().refine(value => value.withData <= value.cells && value.undeterminable <= value.cells);

export const hourlyQueryMetaSchema = z.object({ requestId: requestIdSchema,
  dataAsOf: z.string().datetime({ offset: true }).nullable(), businessDate: calendarDateSchema,
  workspaceKind: z.literal("personal"), selectedSource: z.literal("platform"),
}).strict();
export const gapQueryMetaSchema = hourlyQueryMetaSchema.extend({ ruleSetVersion: z.string().min(1).max(256)
  .refine(value => value.trim() === value && [...value].every(c => c.charCodeAt(0) >= 32 && c.charCodeAt(0) !== 127), "Invalid rule version") }).strict();

export const dataQueryResponseSchema = z.discriminatedUnion("ok", [
  z.object({ ok: z.literal(true), data: dataQuerySuccessDataSchema,
    meta: z.union([z.object({ cellCoverage: pivotCellCoverageSchema }).strict(), hourlyQueryMetaSchema, gapQueryMetaSchema]).optional(),
  }).strict().superRefine((value, context) => {
    if (value.data.mode !== "reconcile" && value.data.source.queryId === "account.gap") {
      const parsed = gapQueryMetaSchema.safeParse(value.meta), source = value.data.source;
      if (!parsed.success || value.data.mode !== "platform" || source.lineage.workspaceKind !== "personal" ||
        source.lineage.source === "ka_data" || parsed.data.dataAsOf !== source.lineage.dataAsOf ||
        parsed.data.businessDate !== source.lineage.window?.to) context.addIssue({ code: "custom", message: "Gap metadata must match source and carry a rule version" });
      return;
    }
    if (value.data.mode !== "reconcile" && value.data.source.queryId === "account.hourly") {
      const parsed = hourlyQueryMetaSchema.safeParse(value.meta), source = value.data.source;
      if (!parsed.success || value.data.mode !== "platform" || source.lineage.workspaceKind !== "personal" ||
        source.lineage.source === "ka_data" || parsed.data.dataAsOf !== source.lineage.dataAsOf ||
        parsed.data.businessDate !== source.lineage.window?.from) context.addIssue({ code: "custom", message: "Hourly metadata must match its source" });
      return;
    }
    const pivot = value.data.mode !== "reconcile" && value.data.source.queryId === "account.pivot2" ? value.data.source : null;
    if (!pivot) {
      if (value.meta !== undefined) context.addIssue({ code: "custom", message: "Unexpected pivot metadata" });
      return;
    }
    const coverage = value.meta && "cellCoverage" in value.meta ? value.meta.cellCoverage : undefined;
    if (!coverage || coverage.cells !== pivot.rows.length || coverage.undeterminable !== pivot.rows.filter(row =>
      (row.assessment as { onTarget?: unknown } | undefined)?.onTarget === null).length) {
      context.addIssue({ code: "custom", message: "Pivot metadata must match cells" });
    }
  }),
  z.object({ ok: z.literal(false), error: stableDataQueryErrorSchema }).strict(),
]);
export type DataQueryResponse = z.infer<typeof dataQueryResponseSchema>;
