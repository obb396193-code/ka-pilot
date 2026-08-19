import type {
  NotificationDecision,
  OverCostRampInput,
  RuleEvaluation,
  SpendCliffInput,
  WorkItemSeverity,
  ZeroDeliveryInput,
} from "@ka/domain";

interface RuleCandidateBase {
  candidateId: string;
  workspaceId: string;
  accountId: string;
  taskId?: string | null | undefined;
  ruleId: string | number;
  title: string;
  evidenceSnapshot: Record<string, unknown>;
  isQuietHours: boolean;
  quietHoursEnd?: Date | undefined;
}

export type RuleCandidate =
  | (RuleCandidateBase & { ruleCode: "over_cost_ramp"; facts: OverCostRampInput })
  | (RuleCandidateBase & { ruleCode: "zero_delivery"; facts: ZeroDeliveryInput })
  | (RuleCandidateBase & { ruleCode: "spend_cliff"; facts: SpendCliffInput });

export interface RuleScanInput {
  workspaceId: string;
  now: Date;
}

export interface RuleCandidateProvider {
  listCandidates(input: RuleScanInput): Promise<RuleCandidate[]>;
}

export interface RuleEvaluator {
  evaluate(candidate: RuleCandidate): RuleEvaluation;
}

export interface WorkItemAlertInput {
  workspaceId: string;
  type: "diagnosis";
  accountId: string;
  taskId?: string | null | undefined;
  ruleId: string | number;
  severity: WorkItemSeverity;
  title: string;
  evidenceSnapshot: Record<string, unknown>;
}

export interface WorkItemSink {
  createOrMerge(input: WorkItemAlertInput): Promise<{
    disposition: "created" | "upgraded" | "merged";
    workItemId: string;
  }>;
}

export type SchedulableNotificationDecision = Exclude<
  NotificationDecision,
  { kind: "suppress" }
>;

export interface AlertDelivery {
  deliveryKey: string;
  workspaceId: string;
  workItemId: string;
  accountId: string;
  severity: WorkItemSeverity;
  title: string;
  decision: SchedulableNotificationDecision;
}

export interface AlertSink {
  enqueue(input: AlertDelivery): Promise<"enqueued" | "duplicate">;
}

export interface RuleScanFailure {
  candidateId: string;
  message: string;
}

export interface RuleScanSummary {
  evaluated: number;
  matched: number;
  notMatched: number;
  insufficient: number;
  created: number;
  upgraded: number;
  merged: number;
  notificationsEnqueued: number;
  failures: RuleScanFailure[];
}
