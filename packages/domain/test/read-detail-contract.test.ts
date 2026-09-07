import { describe, expect, it } from "vitest";

import {
  changeSetDetailSchema,
  workItemDetailSchema,
} from "../src/read-detail-contract.js";

const WORKSPACE_ID = "00000000-0000-4000-8000-000000000001";
const WORK_ITEM_ID = "00000000-0000-4000-8000-000000000002";
const CHANGESET_ID = "00000000-0000-4000-8000-000000000003";
const USER_ID = "00000000-0000-4000-8000-000000000004";

function workItem() {
  return {
    id: WORK_ITEM_ID,
    workspaceId: WORKSPACE_ID,
    media: "KUAISHOU" as string | null,
    accountId: "account-1" as string | null,
    type: "self",
    taskId: null,
    ruleId: null,
    severity: null,
    title: "个人待处理事项",
    evidenceSnapshot: null,
    diagnosis: null,
    status: "open",
    ignoreReason: null,
    mutedUntil: null,
    assignee: USER_ID,
    creator: USER_ID,
    acceptanceCriteria: null,
    slaDue: null,
    rejectReason: null,
    t1Result: null,
    createdAt: "2026-08-28T01:00:00.000Z",
    resolvedAt: null,
  };
}

function changeSet() {
  return {
    id: CHANGESET_ID,
    workspaceId: WORKSPACE_ID,
    media: "KUAISHOU" as string | null,
    accountId: "account-1" as string | null,
    workItemId: WORK_ITEM_ID,
    title: null,
    status: "draft",
    initiatorUserId: USER_ID,
    executorIdentity: null,
    multicaIssueId: null,
    ttlExpireAt: null,
    reasonCode: null,
    simulation: null,
    createdAt: "2026-08-28T01:00:00.000Z",
    executedAt: null,
    items: [],
  };
}

describe("read detail contract", () => {
  it("accepts dispatched only as a work-item state, not a changeset state", () => {
    expect(workItemDetailSchema.safeParse({ ...workItem(), status: "dispatched" }).success).toBe(true);
    expect(changeSetDetailSchema.safeParse({ ...changeSet(), status: "dispatched" }).success).toBe(false);
    expect(workItemDetailSchema.safeParse({ ...workItem(), status: "dispatch" }).success).toBe(false);
  });

  it("accepts a work item with a full account tuple or with both account fields null", () => {
    expect(workItemDetailSchema.safeParse(workItem()).success).toBe(true);
    expect(workItemDetailSchema.safeParse({
      ...workItem(),
      media: null,
      accountId: null,
    }).success).toBe(true);
  });

  it("rejects half-scoped work items and unknown fields", () => {
    expect(workItemDetailSchema.safeParse({
      ...workItem(),
      media: null,
    }).success).toBe(false);
    expect(workItemDetailSchema.safeParse({
      ...workItem(),
      accountId: null,
    }).success).toBe(false);
    expect(workItemDetailSchema.safeParse({
      ...workItem(),
      leakedWorkspaceField: "forbidden",
    }).success).toBe(false);
  });

  it("keeps changesets bound to a complete account tuple", () => {
    expect(changeSetDetailSchema.safeParse(changeSet()).success).toBe(true);
    expect(changeSetDetailSchema.safeParse({ ...changeSet(), media: null }).success).toBe(false);
    expect(changeSetDetailSchema.safeParse({ ...changeSet(), accountId: null }).success).toBe(false);
  });
});
