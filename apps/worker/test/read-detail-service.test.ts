import { describe, expect, it } from "vitest";

import type { ChangeSetRecord, WorkItemRecord } from "@ka/db";

import { ReadDetailService } from "../src/data/read-detail-service.js";

const WORK_ITEM_ID = "00000000-0000-4000-8000-000000000101";
const CHANGESET_ID = "00000000-0000-4000-8000-000000000102";
const USER_ID = "00000000-0000-4000-8000-000000000103";
const auth = {
  workspaceId: "00000000-0000-4000-8000-000000000104",
  userId: USER_ID,
  allowedAccounts: [{ media: "KUAISHOU", accountId: "account-1" }],
};

function workItem(overrides: Partial<WorkItemRecord> = {}): WorkItemRecord {
  return {
    id: WORK_ITEM_ID,
    workspaceId: auth.workspaceId,
    type: "diagnosis",
    media: "KUAISHOU",
    accountId: "account-1",
    taskId: "task-1",
    ruleId: "11",
    severity: "P1",
    title: "成本异常",
    evidenceSnapshot: { snapshot_at: "2026-08-25T01:00:00Z" },
    diagnosis: { reason: "cost_ramp" },
    status: "open",
    ignoreReason: null,
    mutedUntil: null,
    assignee: null,
    creator: USER_ID,
    acceptanceCriteria: "CPA returns to target",
    slaDue: new Date("2026-08-25T03:00:00Z"),
    rejectReason: null,
    t1Result: { checked: true },
    createdAt: new Date("2026-08-25T01:01:00Z"),
    resolvedAt: null,
    ...overrides,
  };
}

function changeset(overrides: Partial<ChangeSetRecord> = {}): ChangeSetRecord {
  return {
    id: CHANGESET_ID,
    workspaceId: auth.workspaceId,
    media: "KUAISHOU",
    accountId: "account-1",
    workItemId: WORK_ITEM_ID,
    title: "降价预览",
    status: "draft",
    initiator: USER_ID,
    credentialOwnerUserId: USER_ID,
    executorIdentity: null,
    multicaIssueId: null,
    ttlExpireAt: new Date("2026-08-25T01:30:00Z"),
    reasonCode: "cost_control",
    simulation: { risk: "low", dryRun: { passed: true } },
    createdAt: new Date("2026-08-25T01:00:00Z"),
    executedAt: null,
    items: [{
      id: 1,
      targetType: "unit",
      targetId: "unit-1",
      field: "bid",
      fromValue: "30",
      toValue: "27",
      itemStatus: "pending",
      failReason: null,
    }],
    ...overrides,
  };
}

function service(input: {
  workItem?: WorkItemRecord | null;
  changeset?: ChangeSetRecord | null;
} = {}) {
  return new ReadDetailService({
    workItems: { find: async () => input.workItem ?? null },
    changeSets: { find: async () => input.changeset ?? null },
  });
}

describe("ReadDetailService", () => {
  it("returns evidence, diagnosis and T+1 for an exactly scoped work item", async () => {
    const result = await service({ workItem: workItem() }).getWorkItem(
      WORK_ITEM_ID,
      auth,
      "work-item-detail-001",
    );
    expect(result).toMatchObject({
      ok: true,
      data: {
        kind: "work_item",
        workItem: {
          media: "KUAISHOU",
          accountId: "account-1",
          evidenceSnapshot: { snapshot_at: "2026-08-25T01:00:00Z" },
          diagnosis: { reason: "cost_ramp" },
          t1Result: { checked: true },
        },
      },
    });
  });

  it("allows an unscoped personal work item for its assignee and preserves both actors", async () => {
    const result = await service({
      workItem: workItem({ media: null, accountId: null, assignee: USER_ID }),
    }).getWorkItem(WORK_ITEM_ID, auth, "personal-assignee-001");

    expect(result).toMatchObject({
      ok: true,
      data: {
        kind: "work_item",
        workItem: {
          media: null,
          accountId: null,
          assignee: USER_ID,
          creator: USER_ID,
        },
      },
    });
  });

  it("allows an unscoped personal work item for its creator", async () => {
    const result = await service({
      workItem: workItem({ media: null, accountId: null, assignee: null, creator: USER_ID }),
    }).getWorkItem(WORK_ITEM_ID, auth, "personal-creator-001");

    expect(result).toMatchObject({ ok: true, data: { kind: "work_item" } });
  });

  it("denies another user's unscoped work item and rejects a half-scoped row", async () => {
    const anotherUser = "00000000-0000-4000-8000-000000000199";
    const forbidden = await service({
      workItem: workItem({
        media: null,
        accountId: null,
        assignee: anotherUser,
        creator: anotherUser,
      }),
    }).getWorkItem(WORK_ITEM_ID, auth, "personal-other-001");
    expect(forbidden).toMatchObject({ ok: false, error: { code: "FORBIDDEN" } });

    const malformed = await service({
      workItem: workItem({ media: "KUAISHOU", accountId: null }),
    }).getWorkItem(WORK_ITEM_ID, auth, "personal-half-001");
    expect(malformed).toMatchObject({ ok: false, error: { code: "INTERNAL_ERROR" } });
  });

  it("returns changeset status, items, simulation and TTL without write actions", async () => {
    const result = await service({ changeset: changeset() }).getChangeSet(
      CHANGESET_ID,
      auth,
      "changeset-detail-001",
    );
    expect(result).toMatchObject({
      ok: true,
      data: {
        kind: "changeset",
        changeset: {
          status: "draft",
          ttlExpireAt: "2026-08-25T01:30:00.000Z",
          simulation: { risk: "low", dryRun: { passed: true } },
          items: [{ itemStatus: "pending", failReason: null }],
        },
      },
    });
  });

  it("fails closed for same account id in another media and for unscoped changesets", async () => {
    const wrongMedia = await service({
      workItem: workItem({ media: "TENCENT" }),
    }).getWorkItem(WORK_ITEM_ID, auth, "scope-001");
    expect(wrongMedia).toMatchObject({ ok: false, error: { code: "FORBIDDEN" } });

    const unscoped = await service({
      changeset: changeset({ media: null, accountId: null }),
    }).getChangeSet(CHANGESET_ID, auth, "scope-002");
    expect(unscoped).toMatchObject({ ok: false, error: { code: "FORBIDDEN" } });
  });

  it("returns stable invalid-id and not-found envelopes", async () => {
    await expect(service().getWorkItem("not-a-uuid", auth, "invalid-001")).resolves.toMatchObject({
      ok: false,
      error: { code: "INVALID_REQUEST", requestId: "invalid-001" },
    });
    await expect(service().getChangeSet(CHANGESET_ID, auth, "missing-001")).resolves.toMatchObject({
      ok: false,
      error: { code: "NOT_FOUND", requestId: "missing-001" },
    });
  });

  it("fails closed when a repository returns a different path id or workspace", async () => {
    const wrongId = await service({
      workItem: workItem({ id: "00000000-0000-4000-8000-000000000199" }),
    }).getWorkItem(WORK_ITEM_ID, auth, "identity-001");
    expect(wrongId).toMatchObject({ ok: false, error: { code: "INTERNAL_ERROR" } });

    const wrongWorkspace = await service({
      workItem: workItem({
        workspaceId: "00000000-0000-4000-8000-000000000999",
        media: null,
        accountId: null,
        title: "must not leak",
      }),
    }).getWorkItem(WORK_ITEM_ID, auth, "identity-003");
    expect(wrongWorkspace).toMatchObject({ ok: false, error: { code: "INTERNAL_ERROR" } });
    expect(JSON.stringify(wrongWorkspace)).not.toContain("must not leak");

    await expect(service({ changeset: changeset({ workspaceId: "00000000-0000-4000-8000-000000000999" }) }).getChangeSet(CHANGESET_ID, auth, "identity-002")).resolves.toMatchObject({ ok: false, error: { code: "INTERNAL_ERROR" } });
  });
});
