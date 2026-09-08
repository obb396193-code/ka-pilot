import { describe, expect, it, vi } from "vitest";

import { decideDuplicate, type RuleEvaluation, type WorkItemSeverity } from "@ka/domain";

import { builtInRuleEvaluator, RuleScanHandler } from "../src/rules/rule-scan-handler.js";
import type {
  AlertDelivery,
  AlertSink,
  RuleCandidate,
  RuleCandidateProvider,
  RuleEvaluator,
  WorkItemAlertInput,
  WorkItemSink,
} from "../src/rules/types.js";

class StaticProvider implements RuleCandidateProvider {
  constructor(public candidates: RuleCandidate[]) {}

  async listCandidates(): Promise<RuleCandidate[]> {
    return this.candidates;
  }
}

class MemoryWorkItems implements WorkItemSink {
  private readonly items = new Map<
    string,
    { id: string; severity: WorkItemSeverity; input: WorkItemAlertInput }
  >();

  async createOrMerge(input: WorkItemAlertInput) {
    const key = JSON.stringify([
      input.workspaceId,
      input.media,
      String(input.ruleId),
      input.accountId,
    ]);
    const existing = this.items.get(key);
    if (existing === undefined) {
      const id = `work-item-${this.items.size + 1}`;
      this.items.set(key, { id, severity: input.severity, input });
      return { disposition: "created" as const, workItemId: id };
    }
    const decision = decideDuplicate(existing.severity, input.severity);
    if (decision === "upgrade") {
      existing.severity = input.severity;
      existing.input = input;
      return { disposition: "upgraded" as const, workItemId: existing.id };
    }
    return { disposition: "merged" as const, workItemId: existing.id };
  }
}

class IdempotentAlerts implements AlertSink {
  readonly deliveries = new Map<string, AlertDelivery>();

  async enqueue(input: AlertDelivery): Promise<"enqueued" | "duplicate"> {
    if (this.deliveries.has(input.deliveryKey)) {
      return "duplicate";
    }
    this.deliveries.set(input.deliveryKey, input);
    return "enqueued";
  }
}

const base = {
  workspaceId: "workspace-1",
  media: "KUAISHOU",
  taskId: "task-1",
  evidenceSnapshot: { snapshot_at: "2026-08-19T09:15:00Z" },
  isQuietHours: false,
  readiness: { initialFullDone: true, source: { kind: "realtime" as const, dataAsOf: new Date("2026-08-19T09:00Z") }, requiredMetrics: { cost: "available" as const } },
};

function overCostCandidate(overrides: Partial<RuleCandidate> = {}): RuleCandidate {
  return {
    ...base,
    candidateId: "candidate-over-cost",
    accountId: "account-1",
    ruleId: 1,
    title: "超成本起量",
    ruleCode: "over_cost_ramp",
    readiness: { ...base.readiness, requiredMetrics: { cashCost: "available", realConversion: "available", assessmentPrice: "available" } },
    facts: {
      assessmentPrice: 30,
      cashCost: 5000,
      lifecycleStage: "scaling",
      realConversion: 100,
    },
    ...overrides,
  } as RuleCandidate;
}

describe("RuleScanHandler", () => {
  it("fails closed on missing readiness without treating another account as unchecked", async () => {
    const handler = new RuleScanHandler({ candidateProvider: new StaticProvider([
      overCostCandidate({ readiness: undefined } as unknown as Partial<RuleCandidate>),
      overCostCandidate({ candidateId: "healthy", accountId: "other" }),
    ]), evaluator: builtInRuleEvaluator, workItems: new MemoryWorkItems(), alerts: new IdempotentAlerts() });
    const result = await handler.run({ workspaceId: base.workspaceId, now: new Date("2026-08-19T09:15Z") });
    expect(result.coverage).toEqual({ checked: 1, pending: 0, undeterminable: 1 });
    expect(result.failures).toHaveLength(1); expect(result.created).toBe(1);
  });
  it("validates scope/clock even with no candidates and snapshots them before provider calls", async () => {
    const provider = new StaticProvider([]);
    const list = vi.spyOn(provider, "listCandidates");
    const handler = new RuleScanHandler({ candidateProvider: provider, evaluator: builtInRuleEvaluator, workItems: new MemoryWorkItems(), alerts: new IdempotentAlerts() });
    await expect(handler.run({ workspaceId: "", now: new Date() })).rejects.toThrow("scope or clock");
    await expect(handler.run({ workspaceId: base.workspaceId, now: new Date(NaN) })).rejects.toThrow("scope or clock");
    expect(list).not.toHaveBeenCalled();
    const input = { workspaceId: base.workspaceId, now: new Date("2026-08-19T09:15Z") };
    list.mockImplementation(async () => { input.workspaceId = "changed"; input.now.setFullYear(2000); return [overCostCandidate()]; });
    expect((await handler.run(input)).coverage.checked).toBe(1);
  });
  it.each([
    { readiness: { ...base.readiness, initialFullDone: false }, state: "pending", reason: "INITIAL_FULL_PENDING" },
    { readiness: { ...base.readiness, source: { kind: "realtime" as const, dataAsOf: null } }, state: "pending", reason: "SOURCE_STALE" },
    { readiness: { ...base.readiness, requiredMetrics: { cost: "missing" as const } }, state: "undeterminable", reason: "METRIC_MISSING" },
    { readiness: { ...base.readiness, requiredMetrics: { cost: "error" as const } }, state: "undeterminable", reason: "METRIC_MISSING" },
  ])("suppresses before threshold, occurrence and delivery: $reason", async ({ readiness, state, reason }) => {
    const workItems = new MemoryWorkItems(), alerts = new IdempotentAlerts();
    const merge = vi.spyOn(workItems, "createOrMerge"), notify = vi.spyOn(alerts, "enqueue");
    const evaluate = vi.fn(builtInRuleEvaluator.evaluate);
    const handler = new RuleScanHandler({ candidateProvider: new StaticProvider([overCostCandidate({ readiness })]), evaluator: { evaluate }, workItems, alerts });
    const result = await handler.run({ workspaceId: base.workspaceId, now: new Date("2026-08-19T09:15Z") });
    expect(result.coverage).toMatchObject({ [state]: 1 });
    expect(result.skipped).toEqual([{ candidateId: "candidate-over-cost", decision: expect.objectContaining({ reason }) }]);
    expect(evaluate).not.toHaveBeenCalled(); expect(merge).not.toHaveBeenCalled(); expect(notify).not.toHaveBeenCalled();
  });
  it("counts unique account tuples and uses the most conservative state across rules", async () => {
    const handler = new RuleScanHandler({ candidateProvider: new StaticProvider([
      overCostCandidate(), overCostCandidate({ ruleId: 2, candidateId: "missing", readiness: { ...base.readiness, requiredMetrics: { cost: "missing" } } }),
      overCostCandidate({ media: "TENCENT", candidateId: "other-media" }),
    ]), evaluator: builtInRuleEvaluator, workItems: new MemoryWorkItems(), alerts: new IdempotentAlerts() });
    const result = await handler.run({ workspaceId: base.workspaceId, now: new Date("2026-08-19T09:15Z") });
    expect(result.coverage).toEqual({ checked: 1, pending: 0, undeterminable: 1 });
  });
  it("only evaluates the new current window after evidence recovers", async () => {
    const provider = new StaticProvider([overCostCandidate({ readiness: { ...base.readiness, source: { kind: "realtime", dataAsOf: null } } })]);
    const evaluate = vi.fn(builtInRuleEvaluator.evaluate);
    const handler = new RuleScanHandler({ candidateProvider: provider, evaluator: { evaluate }, workItems: new MemoryWorkItems(), alerts: new IdempotentAlerts() });
    await handler.run({ workspaceId: base.workspaceId, now: new Date("2026-08-19T09:15Z") });
    provider.candidates = [overCostCandidate()];
    expect((await handler.run({ workspaceId: base.workspaceId, now: new Date("2026-08-19T09:20Z") })).coverage.checked).toBe(1);
    expect(evaluate).toHaveBeenCalledOnce();
  });
  it("creates and idempotently enqueues a matched alert across scan retries", async () => {
    const provider = new StaticProvider([overCostCandidate()]);
    const workItems = new MemoryWorkItems();
    const alerts = new IdempotentAlerts();
    const handler = new RuleScanHandler({
      candidateProvider: provider,
      evaluator: builtInRuleEvaluator,
      workItems,
      alerts,
    });

    const first = await handler.run({
      workspaceId: "workspace-1",
      now: new Date("2026-08-19T09:15:00Z"),
    });
    expect(first).toMatchObject({
      evaluated: 1,
      matched: 1,
      created: 1,
      merged: 0,
      notificationsEnqueued: 1,
      failures: [],
    });

    const retry = await handler.run({
      workspaceId: "workspace-1",
      now: new Date("2026-08-19T09:20:00Z"),
    });
    expect(retry).toMatchObject({
      matched: 1,
      created: 0,
      merged: 1,
      notificationsEnqueued: 0,
    });
    expect(alerts.deliveries).toHaveLength(1);
  });

  it("does not create work items for not-matched or insufficient candidates", async () => {
    const provider = new StaticProvider([
      {
        ...base,
        candidateId: "not-matched",
        accountId: "account-2",
        ruleId: 2,
        title: "0 曝光",
        ruleCode: "zero_delivery",
        facts: { entityAgeHours: 30, cost: 10 },
      },
      {
        ...base,
        candidateId: "insufficient",
        accountId: "account-3",
        ruleId: 3,
        title: "消耗断崖",
        ruleCode: "spend_cliff",
        facts: { spendChange: -0.4 },
      },
    ]);
    const handler = new RuleScanHandler({
      candidateProvider: provider,
      evaluator: builtInRuleEvaluator,
      workItems: new MemoryWorkItems(),
      alerts: new IdempotentAlerts(),
    });

    const summary = await handler.run({
      workspaceId: "workspace-1",
      now: new Date("2026-08-19T09:15:00Z"),
    });
    expect(summary).toMatchObject({
      evaluated: 2,
      matched: 0,
      notMatched: 1,
      insufficient: 1,
      created: 0,
    });
  });

  it("enqueues a new delivery when an existing alert crosses to a higher P level", async () => {
    const provider = new StaticProvider([
      {
        ...base,
        candidateId: "p1",
        accountId: "account-1",
        ruleId: 9,
        title: "消耗断崖",
        ruleCode: "spend_cliff",
        facts: { spendChange: -0.4, hadManualBudgetChange: false },
      },
    ]);
    const workItems = new MemoryWorkItems();
    const alerts = new IdempotentAlerts();
    const handler = new RuleScanHandler({
      candidateProvider: provider,
      evaluator: builtInRuleEvaluator,
      workItems,
      alerts,
    });
    await handler.run({ workspaceId: "workspace-1", now: new Date("2026-08-19T09:15Z") });

    provider.candidates = [overCostCandidate({ ruleId: 9 })];
    const upgraded = await handler.run({
      workspaceId: "workspace-1",
      now: new Date("2026-08-19T09:20Z"),
    });

    expect(upgraded.upgraded).toBe(1);
    expect(upgraded.notificationsEnqueued).toBe(1);
    expect(alerts.deliveries).toHaveLength(2);
  });

  it("isolates a candidate failure and continues scanning the remaining candidates", async () => {
    const provider = new StaticProvider([
      overCostCandidate({ candidateId: "boom", accountId: "account-boom" }),
      overCostCandidate({ candidateId: "healthy", accountId: "account-healthy" }),
    ]);
    const evaluator: RuleEvaluator = {
      evaluate(candidate): RuleEvaluation {
        if (candidate.candidateId === "boom") {
          throw new Error("bad candidate payload");
        }
        return builtInRuleEvaluator.evaluate(candidate);
      },
    };
    const handler = new RuleScanHandler({
      candidateProvider: provider,
      evaluator,
      workItems: new MemoryWorkItems(),
      alerts: new IdempotentAlerts(),
    });

    const summary = await handler.run({
      workspaceId: "workspace-1",
      now: new Date("2026-08-19T09:15Z"),
    });
    expect(summary.evaluated).toBe(2);
    expect(summary.created).toBe(1);
    expect(summary.coverage).toEqual({ checked: 1, pending: 0, undeterminable: 1 });
    expect(summary.failures).toEqual([
      { candidateId: "boom", message: "Rule candidate processing failed" },
    ]);
  });

  it("fails the job when every candidate hits an infrastructure-level failure", async () => {
    const handler = new RuleScanHandler({
      candidateProvider: new StaticProvider([
        overCostCandidate({ candidateId: "first" }),
        overCostCandidate({ candidateId: "second", accountId: "account-2" }),
      ]),
      evaluator: { evaluate: () => { throw new Error("metrics store unavailable"); } },
      workItems: new MemoryWorkItems(),
      alerts: new IdempotentAlerts(),
    });

    await expect(handler.run({
      workspaceId: "workspace-1",
      now: new Date("2026-08-19T09:15Z"),
    })).rejects.toThrow("Rule candidate processing failed");
  });

  it("rejects a candidate leaked from another workspace", async () => {
    const handler = new RuleScanHandler({
      candidateProvider: new StaticProvider([
        overCostCandidate({ workspaceId: "workspace-other" }),
      ]),
      evaluator: builtInRuleEvaluator,
      workItems: new MemoryWorkItems(),
      alerts: new IdempotentAlerts(),
    });

    await expect(handler.run({
      workspaceId: "workspace-1",
      now: new Date("2026-08-19T09:15Z"),
    })).rejects.toThrow(/workspace mismatch/);
  });
});
