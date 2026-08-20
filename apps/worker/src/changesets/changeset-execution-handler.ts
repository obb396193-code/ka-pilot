import { executionDirective, verifyCurrentValues, type ValueConflict } from "@ka/domain";

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
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function successfulIds(result: ChangeExecutorResult): number[] {
  return result.items.filter((item) => item.status === "success").map((item) => item.itemId);
}

export class ChangeSetExecutionHandler {
  private readonly now: () => Date;

  constructor(private readonly dependencies: ChangeSetExecutionDependencies) {
    this.now = dependencies.now ?? (() => new Date());
  }

  async run(workspaceId: string, changeSetId: string): Promise<ChangeSetHandlerResult> {
    const view = await this.dependencies.store.load(workspaceId, changeSetId);
    const directive = executionDirective(view.status);
    if (directive === "skip_terminal") return this.finishTerminal(view);
    if (directive === "not_ready") return { outcome: "not_ready" };
    if (directive === "reconcile_required") return this.reconcile(view);

    const current = await this.dependencies.values.readCurrentValues(view);
    const verification = verifyCurrentValues(view.items, current);
    if (!verification.ok) return { outcome: "conflict", conflicts: verification.conflicts };

    const startedAt = this.now();
    const begun = await this.dependencies.store.beginExecution({
      workspaceId,
      changeSetId,
      requestPayload: { idempotency_key: changeSetId },
      startedAt,
    });
    if (begun.directive === "skip_terminal") {
      return this.finishTerminal(await this.dependencies.store.load(workspaceId, changeSetId));
    }
    if (begun.directive === "not_ready") return { outcome: "not_ready" };
    if (begun.directive === "reconcile_required") {
      return this.reconcile(await this.dependencies.store.load(workspaceId, changeSetId));
    }
    if (begun.directive !== "execute") {
      throw new Error(`Unexpected begin-execution directive: ${begun.directive}`);
    }

    let result: ChangeExecutorResult;
    try {
      result = await this.dependencies.executor.execute({
        idempotencyKey: changeSetId,
        changeset: begun.changeset,
      });
    } catch (error) {
      await this.dependencies.store.completeExecution({
        workspaceId,
        changeSetId,
        executionRunId: begun.executionRunId,
        finishedAt: this.now(),
        resultPayload: { error: errorMessage(error), ambiguous: true },
        items: begun.changeset.items.map((item) => ({ itemId: item.id, status: "unknown" })),
      });
      return { outcome: "unknown" };
    }
    const completed = await this.dependencies.store.completeExecution({
      workspaceId,
      changeSetId,
      executionRunId: begun.executionRunId,
      finishedAt: this.now(),
      resultPayload: result.payload,
      items: result.items,
    });
    return this.finish(workspaceId, changeSetId, completed, result);
  }

  private async reconcile(view: ChangeSetExecutionView): Promise<ChangeSetHandlerResult> {
    const result = await this.dependencies.executor.reconcileUnknown(view);
    const completed = await this.dependencies.store.completeReconciliation({
      workspaceId: view.workspaceId,
      changeSetId: view.id,
      finishedAt: this.now(),
      resultPayload: result.payload,
      items: result.items,
    });
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
