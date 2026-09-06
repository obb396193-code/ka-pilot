import {
  decideAlertDelivery,
  evaluateOverCostRamp,
  evaluateSpendCliff,
  evaluateZeroDelivery,
  assessRuleReadiness,
  type RuleCoverageState,
} from "@ka/domain";

import type {
  AlertSink,
  RuleCandidate,
  RuleCandidateProvider,
  RuleEvaluator,
  RuleScanInput,
  RuleScanSummary,
  WorkItemSink,
} from "./types.js";

export const builtInRuleEvaluator: RuleEvaluator = {
  evaluate(candidate) {
    switch (candidate.ruleCode) {
      case "over_cost_ramp":
        return evaluateOverCostRamp(candidate.facts);
      case "zero_delivery":
        return evaluateZeroDelivery(candidate.facts);
      case "spend_cliff":
        return evaluateSpendCliff(candidate.facts);
    }
  },
};

export interface RuleScanDependencies {
  candidateProvider: RuleCandidateProvider;
  evaluator: RuleEvaluator;
  workItems: WorkItemSink;
  alerts: AlertSink;
}

function emptySummary(): RuleScanSummary {
  return {
    coverage: { checked: 0, pending: 0, undeterminable: 0 },
    skipped: [],
    evaluated: 0,
    matched: 0,
    notMatched: 0,
    insufficient: 0,
    created: 0,
    upgraded: 0,
    merged: 0,
    notificationsEnqueued: 0,
    failures: [],
  };
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function deliveryKey(workItemId: string, severity: string): string {
  return JSON.stringify(["work_item_alert", workItemId, severity]);
}

function recordCoverage(states: Map<string, RuleCoverageState>, candidate: RuleCandidate, state: RuleCoverageState): void {
  const key = JSON.stringify([candidate.workspaceId, candidate.media, candidate.accountId]);
  const rank = { checked: 0, undeterminable: 1, pending: 2 };
  const previous = states.get(key);
  if (previous === undefined || rank[state] > rank[previous]) states.set(key, state);
}

export class RuleScanHandler {
  constructor(private readonly dependencies: RuleScanDependencies) {}

  async run(input: RuleScanInput): Promise<RuleScanSummary> {
    if (typeof input.workspaceId !== "string" || !input.workspaceId.trim() || !(input.now instanceof Date) || !Number.isFinite(input.now.getTime())) throw new Error("Invalid rule scan scope or clock");
    const scope = { workspaceId: input.workspaceId, now: new Date(input.now) };
    const candidates = await this.dependencies.candidateProvider.listCandidates({ ...scope, now: new Date(scope.now) });
    const summary = emptySummary();
    const coverage = new Map<string, RuleCoverageState>();
    for (const candidate of candidates) {
      summary.evaluated += 1;
      try {
        await this.processCandidate(scope, candidate, summary, coverage);
      } catch (error) {
        summary.failures.push({
          candidateId: candidate.candidateId,
          message: errorMessage(error),
        });
      }
    }
    for (const state of coverage.values()) summary.coverage[state] += 1;
    if (candidates.length > 0 && summary.failures.length === candidates.length) {
      throw new Error(
        `Rule scan failed for every candidate: ${summary.failures[0]?.message ?? "unknown error"}`,
      );
    }
    return summary;
  }

  private async processCandidate(
    input: RuleScanInput,
    candidate: RuleCandidate,
    summary: RuleScanSummary,
    coverage: Map<string, RuleCoverageState>,
  ): Promise<void> {
    if (candidate.workspaceId !== input.workspaceId) {
      throw new Error(
        `Rule candidate workspace mismatch: expected ${input.workspaceId}, received ${candidate.workspaceId}`,
      );
    }
    let gate;
    try { gate = assessRuleReadiness(candidate.readiness, input.now); }
    catch (error) { recordCoverage(coverage, candidate, "undeterminable"); throw error; }
    if (gate.coverage !== "checked") {
      recordCoverage(coverage, candidate, gate.coverage);
      summary.skipped.push({ candidateId: candidate.candidateId, decision: gate });
      if (gate.coverage === "undeterminable") summary.insufficient += 1;
      return;
    }
    let evaluation;
    try { evaluation = this.dependencies.evaluator.evaluate(candidate); }
    catch (error) { recordCoverage(coverage, candidate, "undeterminable"); throw error; }
    recordCoverage(coverage, candidate, "checked");
    if (evaluation.outcome === "not_matched") {
      summary.notMatched += 1;
      return;
    }
    if (evaluation.outcome === "insufficient_data") {
      recordCoverage(coverage, candidate, "undeterminable");
      summary.insufficient += 1;
      return;
    }

    summary.matched += 1;
    const workItem = await this.dependencies.workItems.createOrMerge({
      workspaceId: candidate.workspaceId,
      type: "diagnosis",
      media: candidate.media,
      accountId: candidate.accountId,
      taskId: candidate.taskId,
      ruleId: candidate.ruleId,
      severity: evaluation.severity,
      title: candidate.title,
      evidenceSnapshot: {
        ...candidate.evidenceSnapshot,
        rule_code: evaluation.ruleCode,
        rule_trace: evaluation.trace,
      },
    });
    summary[workItem.disposition] += 1;

    const decision = decideAlertDelivery({
      severity: evaluation.severity,
      now: input.now,
      isQuietHours: candidate.isQuietHours,
      quietHoursEnd: candidate.quietHoursEnd,
    });
    if (decision.kind === "suppress") {
      return;
    }

    const enqueueResult = await this.dependencies.alerts.enqueue({
      deliveryKey: deliveryKey(workItem.workItemId, evaluation.severity),
      workspaceId: candidate.workspaceId,
      workItemId: workItem.workItemId,
      accountId: candidate.accountId,
      severity: evaluation.severity,
      title: candidate.title,
      decision,
    });
    if (enqueueResult === "enqueued") {
      summary.notificationsEnqueued += 1;
    }
  }
}
