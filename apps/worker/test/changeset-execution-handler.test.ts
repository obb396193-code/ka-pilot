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
    { id: 1, targetType: "unit", targetId: "u1", field: "bid", fromValue: { type: "number" as const, value: 30 }, toValue: { type: "number" as const, value: 27 }, itemStatus: "pending", failReason: null },
    { id: 2, targetType: "unit", targetId: "u2", field: "budget", fromValue: { type: "number" as const, value: 1000 }, toValue: { type: "number" as const, value: 800 }, itemStatus: "pending", failReason: null },
  ],
};

class MemoryStore implements ChangeSetStore {
  view = structuredClone(base);
  completed?: Parameters<ChangeSetStore["completeExecution"]>[0];
  reconciled?: Parameters<ChangeSetStore["completeReconciliation"]>[0];
  completeCalls = 0;
  authError: Error | undefined;

  async assertExecutionAuthorized() { if (this.authError) throw this.authError; }

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
      value: this.changed && item.id === 1 ? { type: "number" as const, value: 31 } : item.fromValue,
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
  it("rejects duplicate provider observations before executing", async () => {
    const { handler, values, executor } = setup();
    const original = values.readCurrentValues.bind(values);
    values.readCurrentValues = async (view) => { const rows = await original(view); return [...rows, rows[0]!]; };
    await expect(handler.run("workspace-1", "changeset-1")).rejects.toThrow("Duplicate current-value");
    expect(executor.executeCalls).toBe(0);
  });
  it("does not treat string 30 as number 30 when verifying current state", async () => {
    const { store, executor, followUps } = setup();
    const handler = new ChangeSetExecutionHandler({ store, executor, followUps, values: {
      readCurrentValues: async (view) => view.items.map((item) => ({ targetType: item.targetType, targetId: item.targetId, field: item.field, value: { type: "string", value: "30" } })),
    } });
    await expect(handler.run("workspace-1", "changeset-1")).resolves.toMatchObject({ outcome: "conflict" });
    expect(executor.executeCalls).toBe(0);
  });
  it.each(["workspaceId", "id"] as const)("rejects a store returning the wrong %s before media access", async (field) => {
    const { handler, store, executor, values } = setup();
    store.view[field] = "wrong-scope";
    values.readCurrentValues = async () => { throw new Error("Should not query media"); };
    await expect(handler.run("workspace-1", "changeset-1")).rejects.toThrow("requested scope");
    expect(executor.executeCalls).toBe(0);
    expect(executor.reconcileCalls).toBe(0);
  });
  it.each(["confirmed", "unknown"] as const)("rejects revoked actors before any media read/write for %s", async (status) => {
    const { handler, store, executor, values } = setup();
    store.view.status = status;
    store.authError = new Error("FORBIDDEN");
    values.readCurrentValues = async () => { throw new Error("Should not query media"); };
    await expect(handler.run("workspace-1","changeset-1")).rejects.toThrow("FORBIDDEN");
    expect(executor.executeCalls).toBe(0);
    expect(executor.reconcileCalls).toBe(0);
  });
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
