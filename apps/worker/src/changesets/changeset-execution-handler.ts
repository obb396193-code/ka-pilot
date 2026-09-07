import { executionDirective, verifyCurrentValues, parseDryRunItems, type ValueConflict } from "@ka/domain";

import type {
  ChangeExecutorResult,
  ChangeSetExecutionView,
  ChangeSetStore,
  CurrentValueProvider,
  ChangeExecutor,
  FollowUpScheduler,
} from "./types.js";

export type ChangeSetHandlerResult =
  | { outcome: "success" | "partial" | "failed"; successfulItemIds: number[] }
  | { outcome: "unknown" | "skipped" | "not_ready" }
  | { outcome: "conflict"; conflicts: ValueConflict[] };

export interface ChangeSetExecutionDependencies {
  store: ChangeSetStore;
  values: CurrentValueProvider;
  executor: ChangeExecutor;
  followUps: FollowUpScheduler;
  now?: () => Date;
  reconciliationLeaseMs?: number;
}

function successfulIds(result: ChangeExecutorResult): number[] {
  return result.items.filter((item) => item.status === "success").map((item) => item.itemId);
}

function assertScope(view: ChangeSetExecutionView, workspaceId: string, changeSetId: string): void {
  if (view.workspaceId !== workspaceId || view.id !== changeSetId) throw new Error("Changeset does not match requested scope");
}

export class ChangeSetExecutionHandler {
  private readonly now: () => Date;
  private readonly reconciliationLeaseMs: number;

  constructor(private readonly dependencies: ChangeSetExecutionDependencies) {
    this.now = dependencies.now ?? (() => new Date());
    this.reconciliationLeaseMs = dependencies.reconciliationLeaseMs ?? 60_000;
    if (!Number.isSafeInteger(this.reconciliationLeaseMs) || this.reconciliationLeaseMs < 1000 || this.reconciliationLeaseMs > 3_600_000) throw new Error("Invalid reconciliation lease");
  }

  async run(workspaceId: string, changeSetId: string, executionRunId?: string): Promise<ChangeSetHandlerResult> {
    const view = await this.dependencies.store.load(workspaceId, changeSetId);
    assertScope(view, workspaceId, changeSetId);
    if (executionRunId !== undefined) await this.dependencies.store.assertExecutionAuthorized(workspaceId, changeSetId, executionRunId);
    const directive = executionDirective(view.status);
    if (directive === "skip_terminal") return this.finishTerminal(view);
    if (directive === "not_ready") return { outcome: "not_ready" };
    if (executionRunId === undefined) await this.dependencies.store.assertExecutionAuthorized(workspaceId, changeSetId);
    if (directive === "reconcile_required") return this.reconcile(view, executionRunId);

    const current = await this.dependencies.values.readCurrentValues(view);
    const verification = verifyCurrentValues(view.items, current);
    if (!verification.ok) return { outcome: "conflict", conflicts: verification.conflicts };

    const startedAt = this.now();
    const begun = await this.dependencies.store.beginExecution({
      workspaceId,
      changeSetId,
      requestPayload: { idempotency_key: changeSetId },
      startedAt,
      ...(executionRunId === undefined ? {} : { executionRunId }),
    });
    if (begun.directive === "skip_terminal") {
      const latest = await this.dependencies.store.load(workspaceId, changeSetId);
      assertScope(latest, workspaceId, changeSetId);
      return this.finishTerminal(latest);
    }
    if (begun.directive === "not_ready") return { outcome: "not_ready" };
    if (begun.directive === "reconcile_required") {
      const latest = await this.dependencies.store.load(workspaceId, changeSetId);
      assertScope(latest, workspaceId, changeSetId);
      return this.reconcile(latest, executionRunId);
    }
    if (begun.directive !== "execute") {
      throw new Error(`Unexpected begin-execution directive: ${begun.directive}`);
    }
    assertScope(begun.changeset, workspaceId, changeSetId);
    if (executionRunId !== undefined && begun.executionRunId !== executionRunId) throw new Error("Changeset execution attempt mismatch");

    let result: ChangeExecutorResult;
    try {
      result = await this.dependencies.executor.execute({
        idempotencyKey: changeSetId,
        changeset: begun.changeset,
      });
    } catch {
      const completed = await this.dependencies.store.completeExecution({
        workspaceId,
        changeSetId,
        executionRunId: begun.executionRunId,
        finishedAt: this.now(),
        resultPayload: { error: "EXECUTION_RESULT_UNKNOWN", ambiguous: true },
        items: begun.changeset.items.map((item) => ({ itemId: item.id, status: "unknown" })),
      });
      assertScope(completed, workspaceId, changeSetId);
      return this.reconcile(completed, begun.executionRunId);
    }
    const completed = await this.dependencies.store.completeExecution({
      workspaceId,
      changeSetId,
      executionRunId: begun.executionRunId,
      finishedAt: this.now(),
      resultPayload: result.payload,
      items: result.items,
    });
    assertScope(completed, workspaceId, changeSetId);
    if (completed.status === "unknown") return this.reconcile(completed, begun.executionRunId);
    return this.finish(workspaceId, changeSetId, completed, result);
  }

  private async reconcile(view: ChangeSetExecutionView, executionRunId?: string): Promise<ChangeSetHandlerResult> {
    await this.dependencies.store.assertExecutionAuthorized(view.workspaceId, view.id, executionRunId);
    const claim = await this.dependencies.store.beginReconciliation({ workspaceId: view.workspaceId, changeSetId: view.id, now: this.now(), leaseMs: this.reconciliationLeaseMs,
      ...(executionRunId === undefined ? {} : { sourceExecutionRunId: executionRunId }) });
    if (claim.directive === "not_needed") {
      const latest = await this.dependencies.store.load(view.workspaceId, view.id);
      assertScope(latest, view.workspaceId, view.id);
      return this.finishTerminal(latest);
    }
    if (claim.directive !== "reconcile") return { outcome: "unknown" };
    let result: ChangeExecutorResult;
    try {
      result = await this.dependencies.executor.reconcileUnknown(view);
      result = { payload: result.payload, items: parseDryRunItems(result.items) };
      const expected = new Set(view.items.map((item) => item.id));
      if (result.items.length !== expected.size || new Set(result.items.map((item) => item.itemId)).size !== expected.size || result.items.some((item) => !expected.has(item.itemId))) throw new Error("Invalid reconciliation coverage");
    } catch {
      result = { payload: { error: "RECONCILIATION_UNAVAILABLE" }, items: view.items.map((item) => ({ itemId: item.id, status: "unknown" })) };
    }
    const completed = await this.dependencies.store.completeReconciliation({
      workspaceId: view.workspaceId,
      changeSetId: view.id,
      executionRunId: claim.executionRunId,
      finishedAt: this.now(),
      resultPayload: result.payload,
      items: result.items,
    });
    assertScope(completed, view.workspaceId, view.id);
    return this.finish(view.workspaceId, view.id, completed, result);
  }

  private async finish(
    workspaceId: string,
    changeSetId: string,
    completed: ChangeSetExecutionView,
    result: ChangeExecutorResult,
  ): Promise<ChangeSetHandlerResult> {
    if (completed.status === "unknown") return { outcome: "unknown" };
    const ids = successfulIds(result);
    if (ids.length > 0) {
      await this.dependencies.followUps.scheduleT1({
        workspaceId,
        changeSetId,
        successfulItemIds: ids,
      });
    }
    if (completed.status === "success" || completed.status === "partial" || completed.status === "failed") {
      return { outcome: completed.status, successfulItemIds: ids };
    }
    throw new Error(`Unexpected completed changeset status: ${completed.status}`);
  }

  private async finishTerminal(view: ChangeSetExecutionView): Promise<ChangeSetHandlerResult> {
    const ids = view.items
      .filter((item) => item.itemStatus === "success")
      .map((item) => item.id);
    if (ids.length > 0) {
      await this.dependencies.followUps.scheduleT1({
        workspaceId: view.workspaceId,
        changeSetId: view.id,
        successfulItemIds: ids,
      });
    }
    return { outcome: "skipped" };
  }
}
