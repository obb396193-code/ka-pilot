import { describe, expect, it, vi } from "vitest";
import { builtInRuleEvaluator, RuleScanHandler } from "../src/rules/rule-scan-handler.js";
import type { RuleCandidate, RuleEvaluator, WorkItemSink } from "../src/rules/types.js";
import type { RuleEvaluation } from "@ka/domain";

const input = { workspaceId: "workspace-1", now: new Date("2026-08-19T09:15Z") };
function candidate(): RuleCandidate {
  return { candidateId: "synthetic", workspaceId: input.workspaceId, media: "KUAISHOU", accountId: "account-1", ruleId: 1,
    title: "synthetic", evidenceSnapshot: { synthetic: true }, isQuietHours: false,
    readiness: { initialFullDone: true, source: { kind: "realtime", dataAsOf: new Date("2026-08-19T09:00Z") }, requiredMetrics: { cashCost: "available" } },
    ruleCode: "over_cost_ramp", facts: { assessmentPrice: 30, cashCost: 5000, lifecycleStage: "scaling", realConversion: 100 } };
}
function setup(evaluator: RuleEvaluator = builtInRuleEvaluator) {
  const source = [candidate()];
  const provider = { listCandidates: vi.fn(async () => source) };
  const workItems = { createOrMerge: vi.fn<WorkItemSink["createOrMerge"]>(async () => ({ disposition: "created", workItemId: "work-item-1" })) };
  const alerts = { enqueue: vi.fn(async () => "enqueued" as const) };
  return { source, provider, workItems, alerts, handler: new RuleScanHandler({ candidateProvider: provider, evaluator, workItems, alerts }) };
}
describe("rule scan plugin boundaries", () => {
  it("awaits an async evaluator before persistence and protects its private scope", async () => {
    let release!: () => void;
    let signalStarted!: () => void;
    const gate = new Promise<void>(resolve => { release = resolve; });
    const started = new Promise<void>(resolve => { signalStarted = resolve; });
    const s = setup({ async evaluate(value) {
      const result = builtInRuleEvaluator.evaluate(value);
      value.workspaceId = "foreign"; value.media = "TENCENT"; value.accountId = "other";
      signalStarted(); await gate; return result;
    } });
    // Attach both outcomes immediately so the pre-fix rejection is not unhandled.
    const running = s.handler.run(input).then(value => ({ value }), error => ({ error }));
    await started;
    expect(s.workItems.createOrMerge).not.toHaveBeenCalled(); expect(s.alerts.enqueue).not.toHaveBeenCalled();
    release(); const output = await running;
    expect(output).toHaveProperty("value.created", 1);
    expect(s.workItems.createOrMerge).toHaveBeenCalledWith(expect.objectContaining({ workspaceId: input.workspaceId, media: "KUAISHOU", accountId: "account-1" }));
  });
  it("async insufficient evidence does not create or clear work items", async () => {
    const s = setup({ async evaluate(value) { return { ...builtInRuleEvaluator.evaluate(value), outcome: "insufficient_data" }; } });
    expect(await s.handler.run(input)).toMatchObject({ insufficient: 1, created: 0, coverage: { checked: 0, pending: 0, undeterminable: 1 } });
    expect(s.workItems.createOrMerge).not.toHaveBeenCalled(); expect(s.alerts.enqueue).not.toHaveBeenCalled();
  });
  it("async invalid output is validated before sinks", async () => {
    const s = setup({ async evaluate(value) { return { ...builtInRuleEvaluator.evaluate(value), severity: "P9" } as unknown as RuleEvaluation; } });
    await expect(s.handler.run(input)).rejects.toThrow(/Rule candidate processing failed/);
    expect(s.workItems.createOrMerge).not.toHaveBeenCalled(); expect(s.alerts.enqueue).not.toHaveBeenCalled();
  });
  it("async rejection is sanitized while healthy candidates can still proceed", async () => {
    const s = setup({ async evaluate(value) {
      await Promise.resolve();
      if (value.candidateId === "synthetic") throw new Error("synthetic token and SQL body");
      return builtInRuleEvaluator.evaluate(value);
    } });
    s.source.push({ ...candidate(), candidateId: "healthy", accountId: "account-2" });
    expect(await s.handler.run(input)).toMatchObject({ created: 1, failures: [{ candidateId: "synthetic", message: "Rule candidate processing failed" }] });
  });
  it("pending readiness does not invoke an async evaluator", async () => {
    const evaluate = vi.fn(async (value: RuleCandidate) => builtInRuleEvaluator.evaluate(value));
    const s = setup({ evaluate }); s.source[0]!.readiness.initialFullDone = false;
    expect(await s.handler.run(input)).toMatchObject({ created: 0, coverage: { checked: 0, pending: 1, undeterminable: 0 } });
    expect(evaluate).not.toHaveBeenCalled();
  });
  it("sanitizes source error before it can become a job error", async () => {
    const s = setup(); s.provider.listCandidates.mockRejectedValueOnce(new Error("SELECT secret FROM synthetic upstream body"));
    await expect(s.handler.run(input)).rejects.toThrow(/^Rule candidate source unavailable$/);
    expect(s.workItems.createOrMerge).not.toHaveBeenCalled();
  });
  it("an evaluator cannot rewrite the private candidate used by work item and notification sinks", async () => {
    const s = setup({ evaluate(value) { const result = builtInRuleEvaluator.evaluate(value);
      value.workspaceId = "other"; value.media = "TENCENT"; value.accountId = "foreign"; value.title = "changed"; return result; } });
    const before = structuredClone(s.source);
    const result = await s.handler.run(input);
    expect(result.created).toBe(1); expect(s.source).toEqual(before);
    expect(s.workItems.createOrMerge).toHaveBeenCalledWith(expect.objectContaining({ workspaceId: input.workspaceId, media: "KUAISHOU", accountId: "account-1", title: "synthetic" }));
    expect(s.alerts.enqueue).toHaveBeenCalledWith(expect.objectContaining({ workspaceId: input.workspaceId, accountId: "account-1", title: "synthetic" }));
  });
  it.each([{ severity: "P9" }, { outcome: "invented" }, { ruleCode: "spend_cliff" }, { trace: "raw" }, { trace: [{ condition: "x", outcome: "matched", reason: "x", actual: Infinity }] }, { rawBody: "private" }])("rejects evaluator output %j before persistence", async patch => {
    const s = setup({ evaluate(value) { return { ...builtInRuleEvaluator.evaluate(value), ...patch } as RuleEvaluation; } });
    await expect(s.handler.run(input)).rejects.toThrow(/Rule candidate processing failed/);
    expect(s.workItems.createOrMerge).not.toHaveBeenCalled(); expect(s.alerts.enqueue).not.toHaveBeenCalled();
  });
  it.each([{ disposition: "invalid", workItemId: "id" }, { disposition: "created", workItemId: "" }, { disposition: "created", workItemId: undefined }, { disposition: "created", workItemId: "id", rawBody: "secret" }])("rejects sink result %j before notification", async result => {
    const s = setup(); s.workItems.createOrMerge.mockResolvedValueOnce(result as Awaited<ReturnType<WorkItemSink["createOrMerge"]>> & { disposition: "created" });
    await expect(s.handler.run(input)).rejects.toThrow(/Rule candidate processing failed/);
    expect(s.alerts.enqueue).not.toHaveBeenCalled();
  });
  it("all evaluation failures hide source message and partial failure still processes healthy candidates", async () => {
    const s = setup({ evaluate(value) { if (value.candidateId === "synthetic") throw new Error("raw SQL password trace"); return builtInRuleEvaluator.evaluate(value); } });
    s.source.push({ ...candidate(), candidateId: "healthy", accountId: "account-2" });
    const result = await s.handler.run(input);
    expect(result.failures).toEqual([{ candidateId: "synthetic", message: "Rule candidate processing failed" }]);
    expect(result.created).toBe(1);
  });
  it("rejects invalid source arrays and over-limit batches before processing", async () => {
    for (const value of [null, {}, [() => "not cloneable"], Array.from({ length: 10001 }, candidate)]) {
      const s = setup(); s.provider.listCandidates.mockResolvedValueOnce(value as RuleCandidate[]);
      await expect(s.handler.run(input)).rejects.toThrow(/^Invalid rule candidate batch$/);
      expect(s.workItems.createOrMerge).not.toHaveBeenCalled();
    }
  });
  it.each([null, {}, { ...candidate(), candidateId: "\nunsafe" }, { ...candidate(), accountId: "" }])("handles invalid candidate %j without leaking a parser error", async value => {
    const s = setup(); s.source.splice(0, 1, value as RuleCandidate, { ...candidate(), candidateId: "healthy" });
    const result = await s.handler.run(input);
    expect(result.created).toBe(1);
    expect(result.failures).toEqual([{ candidateId: value && "candidateId" in value && value.candidateId === "synthetic" ? "synthetic" : "invalid_candidate", message: "Rule candidate processing failed" }]);
  });
  it("checks notification sink response and retains committed work-item counts on delivery failure", async () => {
    const s = setup();
    s.alerts.enqueue.mockResolvedValueOnce("invalid" as "enqueued");
    s.source.push({ ...candidate(), candidateId: "healthy", accountId: "account-2" });
    const result = await s.handler.run(input);
    expect(result.created).toBe(2); expect(result.notificationsEnqueued).toBe(1);
    expect(result.failures).toEqual([{ candidateId: "synthetic", message: "Rule candidate processing failed" }]);
  });
  it("source mutation while the first sink is awaited cannot retarget later candidates", async () => {
    const s = setup(); s.source.push({ ...candidate(), candidateId: "healthy", accountId: "account-2" });
    s.workItems.createOrMerge.mockImplementationOnce(async () => {
      s.source[1]!.workspaceId = "foreign"; s.source[1]!.accountId = "other";
      return { disposition: "created", workItemId: "first" };
    });
    const result = await s.handler.run(input);
    expect(result.created).toBe(2);
    expect(s.workItems.createOrMerge.mock.calls[1]?.[0]).toMatchObject({ workspaceId: input.workspaceId, accountId: "account-2" });
  });
});
