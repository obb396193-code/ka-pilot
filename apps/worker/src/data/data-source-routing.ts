import {
  adminReconcileRequestSchema,
  approvedWorkspaceAuthContextSchema,
  ordinaryDataQueryIdSchema,
  ordinaryDataQueryRequestSchema,
  type AdminReconcileRequest,
  type DataViewMode,
  type OrdinaryDataQueryRequest,
  type StableDataQueryErrorCode,
} from "@ka/domain";

export interface ServerDataSourcePolicy {
  readonly kaDataEnabled: boolean;
  readonly diagnosticEnabled: boolean;
  readonly entitlements: readonly { readonly workspaceId: string; readonly userId: string }[];
}

export interface SelectedDataSourceRoute {
  request: OrdinaryDataQueryRequest | AdminReconcileRequest;
  selectedSource: DataViewMode;
  workspaceKind: "personal" | "team";
  reason: "personal_workspace" | "team_workspace" | "diagnostic_entitlement";
}

export class DataSourceRoutingError extends Error {
  readonly retryable = false;
  constructor(readonly code: StableDataQueryErrorCode, message: string) {
    super(message);
    this.name = "DataSourceRoutingError";
  }
}

const DISABLED_POLICY: ServerDataSourcePolicy = Object.freeze({
  kaDataEnabled: false,
  diagnosticEnabled: false,
  entitlements: Object.freeze([]),
});

/** Auth and policy come from Session resolution/deployment, never HTTP headers/body. */
export function selectDataSourceRoute(
  endpoint: "ordinary" | "admin_reconcile",
  input: unknown,
  authInput: unknown,
  policy: ServerDataSourcePolicy = DISABLED_POLICY,
): SelectedDataSourceRoute {
  if (authInput === null || authInput === undefined) {
    throw new DataSourceRoutingError("UNAUTHORIZED", "Authentication is required");
  }
  const auth = approvedWorkspaceAuthContextSchema.safeParse(authInput);
  if (!auth.success) throw new DataSourceRoutingError("FORBIDDEN", "Approved authentication context is required");
  // Unknown fields must remain INVALID_REQUEST, even for an entitled admin.
  if (typeof input !== "object" || input === null || Array.isArray(input) ||
    Object.keys(input).some((key) => key !== "queryId" && key !== "params")) {
    throw new DataSourceRoutingError("INVALID_REQUEST", "Invalid data query request");
  }
  const queryId = (input as Record<string, unknown>).queryId;
  const allowed = endpoint === "ordinary"
    ? ordinaryDataQueryIdSchema.safeParse(queryId).success
    : queryId === "reconcile.account_daily";
  if (typeof queryId === "string" && !allowed) {
    throw new DataSourceRoutingError("QUERY_NOT_ALLOWED", "The requested query is not available at this endpoint");
  }
  const request = (endpoint === "ordinary" ? ordinaryDataQueryRequestSchema : adminReconcileRequestSchema).safeParse(input);
  if (!request.success) throw new DataSourceRoutingError("INVALID_REQUEST", "Invalid data query request");
  const { workspaceKind, workspaceId, userId } = auth.data;
  if (endpoint === "admin_reconcile") {
    if (!policy.diagnosticEnabled || !policy.entitlements.some((entry) =>
      entry.workspaceId === workspaceId && entry.userId === userId)) {
      throw new DataSourceRoutingError("FORBIDDEN", "Diagnostic access is not authorized");
    }
    if (!policy.kaDataEnabled) {
      throw new DataSourceRoutingError("VIEW_UNSUPPORTED", "KA Data diagnostic views are disabled by server configuration");
    }
    return { request: request.data, selectedSource: "reconcile", workspaceKind, reason: "diagnostic_entitlement" };
  }
  if (workspaceKind === "team") {
    if (!policy.kaDataEnabled) {
      throw new DataSourceRoutingError("SOURCE_UNAVAILABLE", "Team data source is not configured");
    }
    return { request: request.data, selectedSource: "ka_data", workspaceKind, reason: "team_workspace" };
  }
  return { request: request.data, selectedSource: "platform", workspaceKind, reason: "personal_workspace" };
}
