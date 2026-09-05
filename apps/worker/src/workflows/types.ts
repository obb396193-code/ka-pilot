import type {
  CapabilityDefinition,
  CapabilityMode,
  CompiledWorkflowPlan,
  WorkflowBlockReason,
  WorkflowRunEvent,
  WorkflowRunEventDraft,
  WorkflowRunStatus,
} from "@ka/domain";
import type { WorkflowExecutionRepository } from "@ka/db";

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

export interface DurableWorkflowRunSnapshot {
  executorToken?: string;
  runId: string;
  workspaceId: string;
  initiatorUserId: string;
  credentialOwnerUserId: string;
  status: WorkflowRunStatus;
  params: Record<string, unknown>;
  plan: CompiledWorkflowPlan;
}

export interface WorkflowRunRepositoryPort extends Pick<WorkflowExecutionRepository,
  "claimExecutor" | "renewExecutor" | "releaseExecutor" | "reserveEffect" | "finishEffect"> {
  loadRun(workspaceId: string, runId: string): Promise<DurableWorkflowRunSnapshot | null>;
  listEvents(workspaceId: string, runId: string): Promise<readonly WorkflowRunEvent[]>;
  appendEvent(input: {
    executorToken: string;
    workspaceId: string;
    runId: string;
    dedupeKey: string;
    event: WorkflowRunEventDraft;
  }): Promise<WorkflowRunEvent>;
  compareAndSetStatus(input: {
    executorToken: string;
    workspaceId: string;
    runId: string;
    expected: WorkflowRunStatus;
    next: WorkflowRunStatus;
  }): Promise<boolean>;
}

export interface WorkflowRunAuthContext {
  workspaceId: string;
  runId: string;
  userId: string;
  credentialOwnerUserId: string;
}

export type WorkflowRunPermissionDecision =
  | { allowed: true }
  | { allowed: false; reason: "permission_denied" | "capability_unavailable" };

export interface WorkflowRunPermissionPort {
  authorize(input: {
    auth: WorkflowRunAuthContext;
    nodeId: string;
    capability: CapabilityDefinition;
  }): Promise<WorkflowRunPermissionDecision>;
}

export type WorkflowInvocationResult =
  | { kind: "succeeded"; output: unknown }
  | { kind: "retryable_failure"; errorCode: string; retryAfterMs?: number }
  | { kind: "permanent_failure"; errorCode: string };

export interface DurableWorkflowCapabilityInvoker {
  invoke(input: {
    auth: WorkflowRunAuthContext;
    capability: CapabilityDefinition;
    mode: Exclude<CapabilityMode, "execute">;
    values: Record<string, unknown>;
    idempotencyKey: string;
    signal: AbortSignal;
  }): Promise<WorkflowInvocationResult>;
}

export type WorkflowActionPreviewResult =
  | {
      kind: "ready";
      changesetId: string;
      previewHash: string;
      expiresAt?: string;
    }
  | { kind: "retryable_failure"; errorCode: string; retryAfterMs?: number }
  | { kind: "permanent_failure"; errorCode: string };

export type WorkflowActionExecutionResult =
  | { kind: "succeeded"; output: unknown }
  | { kind: "unknown"; reconciliationRef?: string }
  | { kind: "permanent_failure"; errorCode: string };

export interface ChangesetActionPort {
  preview(input: {
    auth: WorkflowRunAuthContext;
    capability: CapabilityDefinition;
    values: Record<string, unknown>;
    idempotencyKey: string;
    signal: AbortSignal;
  }): Promise<WorkflowActionPreviewResult>;
  executeConfirmed(input: {
    auth: WorkflowRunAuthContext;
    capability: CapabilityDefinition;
    values: Record<string, unknown>;
    idempotencyKey: string;
    changesetId: string;
    previewHash: string;
    confirmedBy: string;
    signal: AbortSignal;
  }): Promise<WorkflowActionExecutionResult>;
}

export interface WorkflowOutputStore {
  putOnce(input: {
    workspaceId: string;
    runId: string;
    nodeId: string;
    attempt: number;
    idempotencyKey: string;
    value: unknown;
  }): Promise<{ ref: string }>;
  get(input: { workspaceId: string; ref: string }): Promise<unknown>;
}

export type WorkflowAdvanceResult =
  | { kind: "waiting_confirmation"; runStatus: "waiting_confirmation"; nodeId: string }
  | { kind: "retry_wait"; runStatus: "running"; retryAt: string }
  | { kind: "paused"; runStatus: "paused"; reasonCode: WorkflowBlockReason }
  | { kind: "yielded"; runStatus: "running"; reason: "step_limit" | "time_limit" }
  | {
      kind: "terminal";
      runStatus: "succeeded" | "failed" | "unknown" | "cancelled";
    }
  | { kind: "blocked"; runStatus: WorkflowRunStatus; reasonCode: WorkflowBlockReason };
