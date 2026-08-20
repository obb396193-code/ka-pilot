import { describe, expect, it } from "vitest";

import { ChangeSetExecutionHandler } from "../src/changesets/changeset-execution-handler.js";
import type {
  ChangeExecutor,
  ChangeExecutorResult,
  ChangeSetExecutionView,
  ChangeSetStore,
  CurrentValueProvider,
  FollowUpScheduler,
} from "../src/changesets/types.js";

const base: ChangeSetExecutionView = {
  id: "changeset-1",
  workspaceId: "workspace-1",
  status: "confirmed",
  credentialOwnerUserId: "user-1",
  items: [
    { id: 1, targetType: "unit", targetId: "u1", field: "bid", fromValue: "30", toValue: "27", itemStatus: "pending" },
    { id: 2, targetType: "unit", targetId: "u2", field: "budget", fromValue: "1000", toValue: "800", itemStatus: "pending" },
  ],
};

class MemoryStore implements ChangeSetStore {
  view = structuredClone(base);
  completed?: Parameters<ChangeSetStore["completeExecution"]>[0];
  reconciled?: Parameters<ChangeSetStore["completeReconciliation"]>[0];
  completeCalls = 0;

  async load() { return structuredClone(this.view); }
  async beginExecution() {
    if (this.view.status === "unknown" || this.view.status === "executing") {
      return { directive: "reconcile_required" as const };
    }
    if (["success", "partial", "failed", "expired", "rolled_back"].includes(this.view.status)) {
      return { directive: "skip_terminal" as const };
    }
    this.view.status = "executing";
    return { directive: "execute" as const, executionRunId: "run-1", changeset: structuredClone(this.view) };
  }
  async completeExecution(input: Parameters<ChangeSetStore["completeExecution"]>[0]) {
    this.completeCalls += 1;
    this.completed = input;
    this.view.status = input.items.some((item) => item.status === "unknown") ? "unknown"
      : input.items.every((item) => item.status === "success") ? "success"
      : input.items.every((item) => item.status === "failed") ? "failed" : "partial";
    for (const result of input.items) {
      const item = this.view.items.find((candidate) => candidate.id === result.itemId);
      if (item && result.status !== "unknown") item.itemStatus = result.status;
    }
    return structuredClone(this.view);
  }
  async completeReconciliation(input: Parameters<ChangeSetStore["completeReconciliation"]>[0]) {
    this.reconciled = input;
    this.view.status = input.items.every((item) => item.status === "success") ? "success" : "partial";
    return structuredClone(this.view);
  }
}

class Values implements CurrentValueProvider {
  constructor(public changed = false) {}
  async readCurrentValues(view: ChangeSetExecutionView) {
    return view.items.map((item) => ({
      targetType: item.targetType,
      targetId: item.targetId,
      field: item.field,
      value: this.changed && item.id === 1 ? "31" : item.fromValue,
    }));
  }
}

class Executor implements ChangeExecutor {
  executeCalls = 0;
  reconcileCalls = 0;
  result: ChangeExecutorResult = {
    payload: { source: "fake" },
    items: [{ itemId: 1, status: "success" }, { itemId: 2, status: "success" }],
  };
  error: Error | undefined;
  async execute() {
    this.executeCalls += 1;
    if (this.error) throw this.error;
    return this.result;
  }
  async reconcileUnknown() {
    this.reconcileCalls += 1;
    return this.result;
  }
}

class FollowUps implements FollowUpScheduler {
  calls: number[][] = [];
  error: Error | undefined;
  async scheduleT1(input: { successfulItemIds: number[] }) {
    this.calls.push(input.successfulItemIds);
    if (this.error) throw this.error;
  }
}

function setup() {
  const store = new MemoryStore();
  const values = new Values();
  const executor = new Executor();
  const followUps = new FollowUps();
  const handler = new ChangeSetExecutionHandler({ store, values, executor, followUps, now: () => new Date("2026-08-19T10:00Z") });
  return { store, values, executor, followUps, handler };
}

describe("ChangeSetExecutionHandler", () => {
  it("executes with the changeset idempotency key and schedules successful items", async () => {
    const { handler, executor, followUps, store } = setup();
    const result = await handler.run("workspace-1", "changeset-1");
    expect(result).toEqual({ outcome: "success", successfulItemIds: [1, 2] });
    expect(executor.executeCalls).toBe(1);
    expect(store.completed?.resultPayload).toEqual({ source: "fake" });
    expect(followUps.calls).toEqual([[1, 2]]);
  });

  it("stops before execution when a from value changed", async () => {
    const { handler, values, executor } = setup();
    values.changed = true;
    const result = await handler.run("workspace-1", "changeset-1");
    expect(result.outcome).toBe("conflict");
    expect(executor.executeCalls).toBe(0);
  });

  it("preserves partial success and schedules only successful items", async () => {
    const { handler, executor, followUps } = setup();
    executor.result = { payload: {}, items: [
      { itemId: 1, status: "success" },
      { itemId: 2, status: "failed", failReason: "rejected" },
    ] };
    expect(await handler.run("workspace-1", "changeset-1")).toEqual({ outcome: "partial", successfulItemIds: [1] });
    expect(followUps.calls).toEqual([[1]]);
  });

  it("turns an ambiguous executor error into UNKNOWN without blind retry", async () => {
    const { handler, executor, store, followUps } = setup();
    executor.error = new Error("timeout after submit");
    expect(await handler.run("workspace-1", "changeset-1")).toEqual({ outcome: "unknown" });
    expect(store.completed?.items.every((item) => item.status === "unknown")).toBe(true);
    expect(followUps.calls).toEqual([]);
  });

  it("reconciles UNKNOWN and never calls execute", async () => {
    const { handler, executor, store, followUps } = setup();
    store.view.status = "unknown";
    const result = await handler.run("workspace-1", "changeset-1");
    expect(result).toEqual({ outcome: "success", successfulItemIds: [1, 2] });
    expect(executor.executeCalls).toBe(0);
    expect(executor.reconcileCalls).toBe(1);
    expect(store.reconciled).toBeDefined();
    expect(followUps.calls).toEqual([[1, 2]]);
  });

  it("skips a terminal changeset idempotently", async () => {
    const { handler, executor, store, followUps } = setup();
    store.view.status = "success";
    store.view.items.forEach((item) => { item.itemStatus = "success"; });
    expect(await handler.run("workspace-1", "changeset-1")).toEqual({ outcome: "skipped" });
    expect(executor.executeCalls).toBe(0);
    expect(followUps.calls).toEqual([[1, 2]]);
  });

  it("does not rewrite a completed media action as UNKNOWN when T1 scheduling fails", async () => {
    const { handler, store, followUps } = setup();
    followUps.error = new Error("queue unavailable");

    await expect(handler.run("workspace-1", "changeset-1")).rejects.toThrow("queue unavailable");
    expect(store.view.status).toBe("success");
    expect(store.completeCalls).toBe(1);
    expect(store.completed?.resultPayload).toEqual({ source: "fake" });

    followUps.error = undefined;
    expect(await handler.run("workspace-1", "changeset-1")).toEqual({ outcome: "skipped" });
    expect(followUps.calls).toEqual([[1, 2], [1, 2]]);
  });
});
