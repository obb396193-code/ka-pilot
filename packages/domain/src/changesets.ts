export type ChangeSetStatus =
  | "draft"
  | "confirmed"
  | "sent"
  | "executing"
  | "success"
  | "partial"
  | "failed"
  | "unknown"
  | "expired"
  | "rolled_back";

export type ChangeSetAction =
  | "confirm"
  | "send"
  | "start_execution"
  | "complete_success"
  | "complete_partial"
  | "complete_failed"
  | "mark_unknown"
  | "expire"
  | "reconcile_success"
  | "reconcile_partial"
  | "reconcile_failed"
  | "mark_rolled_back";

export type ChangeTargetType = "account" | "campaign" | "unit" | "creative";
export type ChangeSetItemStatus = "pending" | "success" | "failed";

export interface ChangeSetItemSnapshot {
  id: number;
  targetType: ChangeTargetType;
  targetId: string;
  field: string;
  fromValue: string | null;
  toValue: string | null;
  itemStatus: ChangeSetItemStatus;
  failReason: string | null;
}

export interface CurrentValueSnapshot {
  targetType: ChangeTargetType;
  targetId: string;
  field: string;
  value: string | null;
}

export interface ValueConflict {
  itemId: number;
  targetType: ChangeTargetType;
  targetId: string;
  field: string;
  expected: string | null;
  actual: string | null;
  kind: "changed" | "missing";
}

export interface ItemExecutionResult {
  itemId: number;
  status: "success" | "failed" | "unknown";
  failReason?: string | undefined;
}

const transitions: Partial<
  Record<ChangeSetStatus, Partial<Record<ChangeSetAction, ChangeSetStatus>>>
> = {
  draft: { confirm: "confirmed", expire: "expired" },
  confirmed: { send: "sent", expire: "expired" },
  sent: { start_execution: "executing", mark_unknown: "unknown", expire: "expired" },
  executing: {
    complete_success: "success",
    complete_partial: "partial",
    complete_failed: "failed",
    mark_unknown: "unknown",
  },
  unknown: {
    reconcile_success: "success",
    reconcile_partial: "partial",
    reconcile_failed: "failed",
  },
  success: { mark_rolled_back: "rolled_back" },
  partial: { mark_rolled_back: "rolled_back" },
};

export function transitionChangeSet(
  current: ChangeSetStatus,
  action: ChangeSetAction,
): ChangeSetStatus {
  const next = transitions[current]?.[action];
  if (next === undefined) {
    throw new Error(`invalid changeset transition: ${current} -> ${action}`);
  }
  return next;
}

export function assertChangeSetConfirmable(input: {
  status: ChangeSetStatus;
  ttlExpireAt: Date;
  now: Date;
}): void {
  if (input.status !== "draft") {
    throw new Error(`changeset must be draft to confirm, received ${input.status}`);
  }
  if (!Number.isFinite(input.ttlExpireAt.getTime()) || !Number.isFinite(input.now.getTime())) {
    throw new Error("changeset confirmation requires valid dates");
  }
  if (input.now >= input.ttlExpireAt) {
    throw new Error("changeset expired before confirmation");
  }
}

function valueKey(value: {
  targetType: ChangeTargetType;
  targetId: string;
  field: string;
}): string {
  return JSON.stringify([value.targetType, value.targetId, value.field]);
}

export function verifyCurrentValues(
  items: readonly ChangeSetItemSnapshot[],
  currentValues: readonly CurrentValueSnapshot[],
): { ok: boolean; conflicts: ValueConflict[] } {
  const current = new Map(currentValues.map((value) => [valueKey(value), value.value]));
  const conflicts: ValueConflict[] = [];
  for (const item of items) {
    const key = valueKey(item);
    if (!current.has(key)) {
      conflicts.push({
        itemId: item.id,
        targetType: item.targetType,
        targetId: item.targetId,
        field: item.field,
        expected: item.fromValue,
        actual: null,
        kind: "missing",
      });
      continue;
    }
    const actual = current.get(key) ?? null;
    if (actual !== item.fromValue) {
      conflicts.push({
        itemId: item.id,
        targetType: item.targetType,
        targetId: item.targetId,
        field: item.field,
        expected: item.fromValue,
        actual,
        kind: "changed",
      });
    }
  }
  return { ok: conflicts.length === 0, conflicts };
}

export function aggregateExecutionResult(
  results: readonly ItemExecutionResult[],
): "success" | "partial" | "failed" | "unknown" {
  if (results.length === 0) {
    throw new Error("cannot aggregate an empty changeset result");
  }
  if (results.some((item) => item.status === "unknown")) {
    return "unknown";
  }
  const successes = results.filter((item) => item.status === "success").length;
  if (successes === results.length) {
    return "success";
  }
  return successes === 0 ? "failed" : "partial";
}

export function executionDirective(
  status: ChangeSetStatus,
): "execute" | "reconcile_required" | "skip_terminal" | "not_ready" {
  if (status === "confirmed" || status === "sent") {
    return "execute";
  }
  if (status === "unknown" || status === "executing") {
    return "reconcile_required";
  }
  if (["success", "partial", "failed", "expired", "rolled_back"].includes(status)) {
    return "skip_terminal";
  }
  return "not_ready";
}

export function buildReverseItems(
  items: readonly ChangeSetItemSnapshot[],
): Array<Omit<ChangeSetItemSnapshot, "id" | "itemStatus" | "failReason">> {
  return items
    .filter((item) => item.itemStatus === "success")
    .map((item) => ({
      targetType: item.targetType,
      targetId: item.targetId,
      field: item.field,
      fromValue: item.toValue,
      toValue: item.fromValue,
    }));
}
