import { describe, expect, it } from "vitest";

import { decideAlertDelivery } from "../src/notification-policy.js";

const now = new Date("2026-08-19T09:15:00.000Z");

describe("decideAlertDelivery", () => {
  it("sends P0 immediately even during quiet hours", () => {
    expect(
      decideAlertDelivery({
        severity: "P0",
        now,
        isQuietHours: true,
        quietHoursEnd: new Date("2026-08-19T10:00:00.000Z"),
      }),
    ).toEqual({ kind: "send_now", reason: "P0 突破静默并立即发送" });
  });

  it("sends P1 immediately outside quiet hours", () => {
    expect(
      decideAlertDelivery({ severity: "P1", now, isQuietHours: false }),
    ).toEqual({ kind: "send_now", reason: "P1 非静默时段立即发送" });
  });

  it("delays P1 until quiet hours end", () => {
    const quietHoursEnd = new Date("2026-08-19T10:30:00.000Z");
    expect(
      decideAlertDelivery({ severity: "P1", now, isQuietHours: true, quietHoursEnd }),
    ).toEqual({ kind: "schedule", at: quietHoursEnd, reason: "P1 静默结束后发送" });
  });

  it("batches P2 at the next full hour", () => {
    expect(
      decideAlertDelivery({ severity: "P2", now, isQuietHours: false }),
    ).toEqual({
      kind: "schedule",
      at: new Date("2026-08-19T10:00:00.000Z"),
      reason: "P2 攒批到下一整点",
    });
  });

  it("uses the later of next full hour and quiet-hours end for P2", () => {
    expect(
      decideAlertDelivery({
        severity: "P2",
        now,
        isQuietHours: true,
        quietHoursEnd: new Date("2026-08-19T11:00:00.000Z"),
      }),
    ).toEqual({
      kind: "schedule",
      at: new Date("2026-08-19T11:00:00.000Z"),
      reason: "P2 静默结束后按攒批发送",
    });
  });

  it("does not push opportunity items as alerts", () => {
    expect(
      decideAlertDelivery({ severity: "opportunity", now, isQuietHours: false }),
    ).toEqual({ kind: "suppress", reason: "机会项只进入工作台，不触发告警推送" });
  });

  it("rejects incomplete quiet-hours configuration instead of silently dropping an alert", () => {
    expect(() =>
      decideAlertDelivery({ severity: "P1", now, isQuietHours: true }),
    ).toThrow(/quietHoursEnd/);
  });
});
