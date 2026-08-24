// Contract fixture copied field-for-field from the de31f3a backend envelope.
// Values are synthetic and safe for local regression tests.
export const backendUnknownLineageEnvelope = {
  ok: true,
  data: {
    mode: "ka_data",
    source: {
      status: "unavailable",
      rows: [],
      returnedRowCount: 0,
      wholeResultTotal: {
        value: null,
        availability: "error",
        reason: "SOURCE_UNAVAILABLE",
      },
      lineage: {
        source: "ka_data",
        datasetVersion: null,
        queryTemplateVersion: "account-summary-v1",
        metricVersion: "ka-data-v1",
        dataAsOf: null,
        timezone: null,
        dayCut: null,
        metadataAvailability: "unknown",
        authority: {
          policyVersion: "2026-08-24",
          useCase: "cross_media_operations",
          role: "default_authoritative",
        },
        objectIdentity: {
          objectType: "account",
          joinKeys: ["workspace_id", "media", "account_id"],
        },
        coverage: {
          complete: false,
          reason: "Source unavailable",
        },
        truncated: false,
        partial: true,
      },
      warnings: ["Source unavailable"],
      error: {
        code: "SOURCE_UNAVAILABLE",
        message: "Source unavailable",
        retryable: true,
        requestId: "request-fixture",
      },
    },
  },
} as const
