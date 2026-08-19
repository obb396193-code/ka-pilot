import type { WorkItemSeverity } from "./work-items.js";

export type NotificationDecision =
  | { kind: "send_now"; reason: string }
  | { kind: "schedule"; at: Date; reason: string }
  | { kind: "suppress"; reason: string };

export interface AlertDeliveryInput {
  severity: WorkItemSeverity;
  now: Date;
  isQuietHours: boolean;
  quietHoursEnd?: Date;
}

function requireQuietHoursEnd(input: AlertDeliveryInput): Date {
  const end = input.quietHoursEnd;
  if (!(end instanceof Date) || !Number.isFinite(end.getTime()) || end <= input.now) {
    throw new Error("quietHoursEnd must be a valid future date during quiet hours");
  }
  return end;
}

function nextFullHour(now: Date): Date {
  const next = new Date(now);
  next.setUTCMinutes(0, 0, 0);
  next.setUTCHours(next.getUTCHours() + 1);
  return next;
}

export function decideAlertDelivery(input: AlertDeliveryInput): NotificationDecision {
  if (!Number.isFinite(input.now.getTime())) {
    throw new Error("now must be a valid date");
  }
  if (input.severity === "P0") {
    return { kind: "send_now", reason: "P0 突破静默并立即发送" };
  }
  if (input.severity === "opportunity") {
    return { kind: "suppress", reason: "机会项只进入工作台，不触发告警推送" };
  }
  if (input.severity === "P1") {
    if (!input.isQuietHours) {
      return { kind: "send_now", reason: "P1 非静默时段立即发送" };
    }
    return {
      kind: "schedule",
      at: requireQuietHoursEnd(input),
      reason: "P1 静默结束后发送",
    };
  }

  const fullHour = nextFullHour(input.now);
  if (!input.isQuietHours) {
    return { kind: "schedule", at: fullHour, reason: "P2 攒批到下一整点" };
  }
  const quietHoursEnd = requireQuietHoursEnd(input);
  return {
    kind: "schedule",
    at: quietHoursEnd > fullHour ? quietHoursEnd : fullHour,
    reason: "P2 静默结束后按攒批发送",
  };
}
