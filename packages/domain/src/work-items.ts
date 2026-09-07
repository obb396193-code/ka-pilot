/** P083: shared read contract. This does not authorize new transitions. */
export const WORK_ITEM_STATUSES = [
  "open", "processing", "dispatched", "done", "ignored", "expired",
  "external_handled", "rejected", "escalated",
] as const;
export const ACTIVE_WORK_ITEM_STATUSES = ["open", "processing", "dispatched", "escalated"] as const;
export type WorkItemStatus = typeof WORK_ITEM_STATUSES[number];

export type WorkItemAction =
  | "start_processing"
  | "complete"
  | "ignore"
  | "reject"
  | "escalate"
  | "mark_external_handled"
  | "expire";

export type WorkItemSeverity = "P0" | "P1" | "P2" | "opportunity";

const transitions: Readonly<
  Partial<Record<WorkItemStatus, Partial<Record<WorkItemAction, WorkItemStatus>>>>
> = {
  open: {
    start_processing: "processing",
    ignore: "ignored",
    escalate: "escalated",
    mark_external_handled: "external_handled",
    expire: "expired",
  },
  processing: {
    complete: "done",
    ignore: "ignored",
    reject: "rejected",
    escalate: "escalated",
    mark_external_handled: "external_handled",
    expire: "expired",
  },
  escalated: {
    start_processing: "processing",
    complete: "done",
    ignore: "ignored",
    mark_external_handled: "external_handled",
    expire: "expired",
  },
};

export function assertWorkItemTransition(
  current: WorkItemStatus,
  action: WorkItemAction,
): WorkItemStatus {
  const next = transitions[current]?.[action];
  if (next === undefined) {
    throw new Error(`invalid work item transition: ${current} -> ${action}`);
  }
  return next;
}

export function workItemDedupeKey(input: {
  workspaceId: string;
  media: string;
  ruleId: string | number;
  accountId: string;
}): string {
  if (
    input.workspaceId.length === 0 ||
    input.media.length === 0 ||
    String(input.ruleId).length === 0 ||
    input.accountId.length === 0
  ) {
    throw new Error("work item dedupe key parts must be non-empty");
  }
  return JSON.stringify([input.workspaceId, input.media, String(input.ruleId), input.accountId]);
}

export function severityRank(severity: WorkItemSeverity): number {
  switch (severity) {
    case "opportunity":
      return 0;
    case "P2":
      return 1;
    case "P1":
      return 2;
    case "P0":
      return 3;
  }
}

export function decideDuplicate(
  existing: WorkItemSeverity,
  incoming: WorkItemSeverity,
): "merge" | "upgrade" {
  return severityRank(incoming) > severityRank(existing) ? "upgrade" : "merge";
}
