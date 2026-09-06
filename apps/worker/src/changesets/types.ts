import type {
  ChangeSetItemSnapshot,
  ChangeSetStatus,
  CurrentValueSnapshot,
  ItemExecutionResult,
} from "@ka/domain";

export interface ChangeSetExecutionView {
  id: string;
  workspaceId: string;
  status: ChangeSetStatus;
  credentialOwnerUserId: string;
  items: ChangeSetItemSnapshot[];
}

export interface CurrentValueProvider {
  readCurrentValues(changeset: ChangeSetExecutionView): Promise<CurrentValueSnapshot[]>;
}

export interface ChangeExecutorResult {
  payload: Record<string, unknown>;
  items: ItemExecutionResult[];
}

export interface ChangeExecutor {
  execute(input: {
    idempotencyKey: string;
    changeset: ChangeSetExecutionView;
  }): Promise<ChangeExecutorResult>;
  reconcileUnknown(changeset: ChangeSetExecutionView): Promise<ChangeExecutorResult>;
}

export interface ChangeSetStore {
  load(workspaceId: string, changeSetId: string): Promise<ChangeSetExecutionView>;
  assertExecutionAuthorized(workspaceId: string, changeSetId: string): Promise<void>;
  beginExecution(input: {
    workspaceId: string;
    changeSetId: string;
    requestPayload: Record<string, unknown>;
    startedAt: Date;
  }): Promise<
    | { directive: "execute"; executionRunId: string; changeset: ChangeSetExecutionView }
    | { directive: "reconcile_required" | "skip_terminal" | "not_ready" }
  >;
  completeExecution(input: {
    workspaceId: string;
    changeSetId: string;
    executionRunId: string;
    finishedAt: Date;
    resultPayload: Record<string, unknown>;
    items: ItemExecutionResult[];
  }): Promise<ChangeSetExecutionView>;
  completeReconciliation(input: {
    workspaceId: string;
    changeSetId: string;
    executionRunId: string;
    finishedAt: Date;
    resultPayload: Record<string, unknown>;
    items: ItemExecutionResult[];
  }): Promise<ChangeSetExecutionView>;
  beginReconciliation(input: { workspaceId: string; changeSetId: string; now: Date; leaseMs: number }): Promise<
    { directive: "reconcile"; executionRunId: string } | { directive: "waiting" | "not_needed" } | { directive: "manual_required"; workItemId: string }
  >;
}

export interface FollowUpScheduler {
  scheduleT1(input: {
    workspaceId: string;
    changeSetId: string;
    successfulItemIds: number[];
  }): Promise<void>;
}
