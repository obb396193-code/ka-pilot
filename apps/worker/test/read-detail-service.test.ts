import { describe, expect, it, vi } from "vitest";

import type { ChangeSetRecord, WorkItemRecord, WorkItemReadResult } from "@ka/db";
import { ChangeSetAuthorizationError, WorkItemAuthorizationError } from "@ka/db";
import type { ApprovedWorkspaceAuthContext } from "@ka/domain";

import { ReadDetailService } from "../src/data/read-detail-service.js";

const WORK_ITEM_ID = "00000000-0000-4000-8000-000000000101";
const CHANGESET_ID = "00000000-0000-4000-8000-000000000102";
const USER_ID = "00000000-0000-4000-8000-000000000103";
const auth = {
  workspaceId: "00000000-0000-4000-8000-000000000104",
  userId: USER_ID,
  role: "admin",
  workspaceKind: "personal",
  scope: {
    kind: "explicit_accounts",
    accounts: [{ media: "KUAISHOU", accountId: "account-1", accessLevel: "read" }],
  },
} satisfies ApprovedWorkspaceAuthContext;

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
      fromValue: { type: "number" as const, value: 30 },
      toValue: { type: "number" as const, value: 27 },
      itemStatus: "pending",
      failReason: null,
    }],
    ...overrides,
  };
}

function service(input: {
  workItem?: WorkItemRecord | null;
  taskScopeAccount?: WorkItemReadResult["taskScopeAccount"];
  changeset?: ChangeSetRecord | null;
} = {}) {
  return new ReadDetailService({
    workItems: { findForRead: async () => input.workItem ? { record: input.workItem, taskScopeAccount: input.taskScopeAccount ?? null } : null },
    changeSets: { find: async () => input.changeset ?? null },
  });
}

describe("ReadDetailService", () => {
  it("uses the mandatory read port with approved auth and preserves typed work-item denial", async () => {
    const findForRead = vi.fn().mockRejectedValue(new WorkItemAuthorizationError());
    const target = new ReadDetailService({ workItems: { findForRead }, changeSets: { find: async () => null } });
    expect(await target.getWorkItem(WORK_ITEM_ID, auth, "work-item-read-denied")).toEqual({ ok: false,
      error: { code: "FORBIDDEN", message: "Work item is outside the approved scope", retryable: false, requestId: "work-item-read-denied" } });
    expect(findForRead).toHaveBeenCalledWith(auth.workspaceId, WORK_ITEM_ID, auth);
  });

  it("permits a task through real authorized-link evidence without leaking its internal envelope", async () => {
    const result = await service({
      workItem: workItem({ media: null, accountId: null, taskId: "linked", assignee: null, creator: null }),
      taskScopeAccount: { media: "KUAISHOU", accountId: "account-1" },
    }).getWorkItem(WORK_ITEM_ID, auth);
    expect(result).toMatchObject({ ok: true, data: { workItem: { taskId: "linked" } } });
    expect(JSON.stringify(result)).not.toContain("taskScopeAccount");
  });

  it.each([null, { media: "TENCENT", accountId: "account-1" }, { media: "KUAISHOU", accountId: "other" }])(
    "denies non-self tasks with missing/unauthorized link %j", async taskScopeAccount => {
      expect(await service({ workItem: workItem({ media: null, accountId: null, creator: null }), taskScopeAccount })
        .getWorkItem(WORK_ITEM_ID, auth)).toMatchObject({ ok: false, error: { code: "FORBIDDEN" } });
    },
  );

  it.each([undefined, {}, { media: "KUAISHOU", accountId: null }, { media: "KUAISHOU", accountId: "account-1", extra: true }])(
    "rejects malformed internal evidence without exposing content: %j", async taskScopeAccount => {
      const target = new ReadDetailService({ workItems: { findForRead: async () => ({ record: workItem(), taskScopeAccount } as WorkItemReadResult) },
        changeSets: { find: async () => null } });
      const result = await target.getWorkItem(WORK_ITEM_ID, auth);
      expect(result).toMatchObject({ ok: false, error: { code: "INTERNAL_ERROR" } });
      expect(JSON.stringify(result)).not.toContain("snapshot_at");
    },
  );
  it("passes approved context to repository and masks its authorization error as stable403", async () => {
    const find = vi.fn().mockRejectedValue(new ChangeSetAuthorizationError());
    const target = new ReadDetailService({ workItems: { findForRead: async () => null }, changeSets: { find } });
    expect(await target.getChangeSet(CHANGESET_ID, auth, "changeset-auth")).toMatchObject({ ok: false,
      error: { code: "FORBIDDEN", requestId: "changeset-auth", message: "Changeset is outside the approved account scope" } });
    expect(find).toHaveBeenCalledWith(auth.workspaceId, CHANGESET_ID, auth);
  });
  it("preserves dispatched for an authorized account detail", async () => {
    const result = await service({ workItem: workItem({ status: "dispatched" }) })
      .getWorkItem(WORK_ITEM_ID, auth, "dispatched-detail");
    expect(result).toMatchObject({ ok: true, data: { kind: "work_item", workItem: { status: "dispatched" } } });
  });

  const teamAuth: ApprovedWorkspaceAuthContext = {
    workspaceId: auth.workspaceId,
    userId: USER_ID,
    role: "optimizer",
    workspaceKind: "team",
    scope: { kind: "team_workspace_readonly" },
  };

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
      workItem: workItem({ media: null, accountId: null, taskId: null, assignee: USER_ID }),
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
      workItem: workItem({ media: null, accountId: null, taskId: null, assignee: null, creator: USER_ID }),
    }).getWorkItem(WORK_ITEM_ID, auth, "personal-creator-001");

    expect(result).toMatchObject({ ok: true, data: { kind: "work_item" } });
  });

  it("allows team account work items but blocks team personal items and all changesets", async () => {
    await expect(service({ workItem: workItem() }).getWorkItem(
      WORK_ITEM_ID,
      teamAuth,
      "team-account-detail",
    )).resolves.toMatchObject({ ok: true, data: { kind: "work_item" } });

    await expect(service({
      workItem: workItem({ media: null, accountId: null, taskId: null }),
    }).getWorkItem(WORK_ITEM_ID, teamAuth, "team-personal-detail")).resolves.toMatchObject({
      ok: false,
      error: { code: "FORBIDDEN" },
    });

    const find = vi.fn(async () => changeset());
    const teamService = new ReadDetailService({
      workItems: { findForRead: async () => null },
      changeSets: { find },
    });
    await expect(teamService.getChangeSet(
      CHANGESET_ID,
      teamAuth,
      "team-changeset-detail",
    )).resolves.toMatchObject({ ok: false, error: { code: "FORBIDDEN" } });
    expect(find).not.toHaveBeenCalled();
  });

  it("permits team task-only detail without grants, not private detail", async () => {
    expect(await service({ workItem: workItem({ media: null, accountId: null, taskId: "task-1", creator: null }) })
      .getWorkItem(WORK_ITEM_ID, teamAuth)).toMatchObject({ ok: true });
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
  it.each(["legacy-sensitive-value", null, { type: "number", value: "private-invalid" }])("does not expose an untyped or malformed item from the repository", async (fromValue) => {
    const record = changeset();
    record.items[0]!.fromValue = fromValue as unknown as ChangeSetRecord["items"][number]["fromValue"];
    const result = await service({ changeset: record }).getChangeSet(CHANGESET_ID, auth, "typed-detail-invalid");
    expect(result).toEqual({ ok: false, error: { code: "INTERNAL_ERROR", message: "Changeset detail could not be loaded", retryable: false, requestId: "typed-detail-invalid" } });
    expect(JSON.stringify(result)).not.toContain("private-invalid");
    expect(JSON.stringify(result)).not.toContain("legacy-sensitive-value");
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
