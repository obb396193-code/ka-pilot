import type {
  CapabilityDefinition,
  CapabilityMode,
  CompiledWorkflowPlan,
} from "@ka/domain";

export interface WorkflowAuthContext {
  workspaceId: string;
  userId: string;
  simulationId: string;
}

export interface WorkflowCapabilityInvoker {
  invoke(input: {
    auth: WorkflowAuthContext;
    capability: CapabilityDefinition;
    mode: Exclude<CapabilityMode, "execute">;
    values: Record<string, unknown>;
    idempotencyKey: string;
    signal: AbortSignal;
  }): Promise<unknown>;
}

export type WorkflowPermissionDecision =
  | { allowed: true }
  | { allowed: false; reason: "permission_denied" | "capability_unavailable" };

export interface WorkflowPermissionPort {
  authorize(input: {
    auth: WorkflowAuthContext;
    nodeId: string;
    capability: CapabilityDefinition;
  }): Promise<WorkflowPermissionDecision>;
}

export type WorkflowSimulationNodeStatus =
  | "ready"
  | "would_wait_confirmation"
  | "blocked"
  | "missing_data"
  | "permission_denied";

export interface WorkflowSimulationNodeResult {
  nodeId: string;
  status: WorkflowSimulationNodeStatus;
  errorCode?:
    | "missing_parameter"
    | "unknown_parameter"
    | "dependency_blocked"
    | "capability_unavailable"
    | "permission_denied"
    | "input_invalid"
    | "output_invalid"
    | "output_too_large"
    | "timeout"
    | "capability_error"
    | "simulation_not_supported";
  output?: unknown;
  idempotencyKey?: string;
}

export interface WorkflowSimulationResult {
  planFingerprint: string;
  status: "ready" | "would_wait_confirmation" | "blocked";
  nodes: readonly WorkflowSimulationNodeResult[];
}

export interface WorkflowSimulationInput {
  auth: WorkflowAuthContext;
  plan: CompiledWorkflowPlan;
  params: Record<string, unknown>;
}
