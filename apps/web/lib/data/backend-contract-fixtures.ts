// Synthetic canonical v3 unknown-lineage fixture; direct backend parity is tested separately.
// Values are synthetic and safe for local regression tests.
export const backendUnknownLineageEnvelope = {
  ok: true,
  data: {
    mode: "ka_data",
    source: {
      queryId: "account.summary",
      rowSchemaVersion: "account.summary/v3",
      status: "ready",
      rows: [],
      returnedRowCount: 0,
      wholeResultTotal: {
        value: 0,
        availability: "available",
      },
      lineage: {
        workspaceKind: "team",
        window: { from: "2026-08-24", to: "2026-08-24", preset: "custom" },
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
          complete: true,
          requestedObjects: 0,
          returnedObjects: 0,
        },
        truncated: false,
        partial: false,
      },
      warnings: [],
    },
  },
} as const
