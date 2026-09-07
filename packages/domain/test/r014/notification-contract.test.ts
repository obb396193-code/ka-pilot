import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import {
  EMPTY_READ_STATE, countUnread, markRead, notificationPageSchema, projectNotifications,
  type NotificationCandidate,
} from "../../src/r014/notification-contract.js";

const fixture = (name: string): { data: unknown } =>
  JSON.parse(readFileSync(new URL(`../../../contract/fixtures/${name}`, import.meta.url), "utf8"));

const CANDIDATES: NotificationCandidate[] = [
  { id: "n1", kind: "alert", severity: "p1", title: "成本超考核", body: "", at: "2026-09-05T09:10:00.000+08:00", ref: { type: "work_item", id: "w1" }, href: "/work-items/w1" },
  { id: "n2", kind: "approval", severity: "info", title: "待审批", body: "", at: "2026-09-05T08:00:00.000+08:00", ref: null, href: "/approvals" },
  { id: "n3", kind: "run", severity: "warning", title: "运行等确认", body: "", at: "2026-09-04T20:00:00.000+08:00", ref: null, href: "/workflows" },
];

describe("v1.7.8 G10 notification stream", () => {
  it("parses both frozen fixtures", () => {
    expect(() => notificationPageSchema.parse(fixture("me/notifications.json").data)).not.toThrow();
    const empty = notificationPageSchema.parse(fixture("me/notifications-empty.json").data);
    expect(empty.items).toEqual([]);
    expect(empty.unread).toBe(0);
  });

  it("sorts newest first with a stable tiebreak so the cursor cannot oscillate", () => {
    const sameSecond: NotificationCandidate[] = [
      { ...CANDIDATES[0]!, id: "a" }, { ...CANDIDATES[0]!, id: "b" },
    ];
    expect(projectNotifications(sameSecond, EMPTY_READ_STATE).items.map((i) => i.id)).toEqual(["b", "a"]);
    expect(projectNotifications(CANDIDATES, EMPTY_READ_STATE).items.map((i) => i.id)).toEqual(["n1", "n2", "n3"]);
  });

  it("reports total unread, not page unread — the bell must not shrink when you page", () => {
    const page = projectNotifications(CANDIDATES, EMPTY_READ_STATE, { limit: 1 });
    expect(page.items).toHaveLength(1);
    expect(page.unread).toBe(3);
    expect(page.nextCursor).toBe("n1");
    const second = projectNotifications(CANDIDATES, EMPTY_READ_STATE, { limit: 1, cursor: "n1" });
    expect(second.items.map((i) => i.id)).toEqual(["n2"]);
    expect(second.unread).toBe(3);
  });

  it("treats everything at or before the watermark as read", () => {
    const state = { notificationsReadAt: "2026-09-05T08:00:00.000+08:00", notificationsReadIds: [] };
    const page = projectNotifications(CANDIDATES, state);
    expect(page.items.map((i) => [i.id, i.read])).toEqual([["n1", false], ["n2", true], ["n3", true]]);
    expect(page.unread).toBe(1);
    expect(countUnread(CANDIDATES, state)).toBe(1);
  });

  it("keeps me/counts and the stream on the same number", () => {
    for (const state of [EMPTY_READ_STATE, { notificationsReadAt: null, notificationsReadIds: ["n1"] }]) {
      expect(countUnread(CANDIDATES, state)).toBe(projectNotifications(CANDIDATES, state).unread);
    }
  });

  it("marks all read by moving the watermark and dropping the now-redundant id set", () => {
    const withIds = { notificationsReadAt: null, notificationsReadIds: ["n1"] };
    const all = markRead(CANDIDATES, withIds, null, "2026-09-05T10:00:00.000+08:00");
    expect(all).toEqual({ notificationsReadAt: "2026-09-05T10:00:00.000+08:00", notificationsReadIds: [] });
    expect(countUnread(CANDIDATES, all)).toBe(0);
  });

  it("marks single items read and prunes ids that the watermark already covers", () => {
    const state = { notificationsReadAt: "2026-09-05T08:00:00.000+08:00", notificationsReadIds: ["n3"] };
    const next = markRead(CANDIDATES, state, ["n1"], "2026-09-05T10:00:00.000+08:00");
    // n3 早于水位，留在集合里没意义；n1 晚于水位，必须留。
    expect(next.notificationsReadIds).toEqual(["n1"]);
    expect(countUnread(CANDIDATES, next)).toBe(0);
  });

  it("refuses an unknown id or cursor instead of silently doing nothing", () => {
    expect(() => markRead(CANDIDATES, EMPTY_READ_STATE, ["nope"], "2026-09-05T10:00:00.000+08:00"))
      .toThrow(/unknown notification id/);
    expect(() => projectNotifications(CANDIDATES, EMPTY_READ_STATE, { cursor: "nope" }))
      .toThrow(/unknown notification cursor/);
  });

  it("filters to unread only without changing the reported total", () => {
    const state = { notificationsReadAt: "2026-09-05T08:00:00.000+08:00", notificationsReadIds: [] };
    const page = projectNotifications(CANDIDATES, state, { unreadOnly: true });
    expect(page.items.map((i) => i.id)).toEqual(["n1"]);
    expect(page.unread).toBe(1);
  });
});
