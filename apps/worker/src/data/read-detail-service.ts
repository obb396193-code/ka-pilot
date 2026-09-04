import type { ChangeSetRecord, WorkItemRecord } from "@ka/db";
import {
  readDetailResponseSchema,
  type ChangeSetDetail,
  type ReadDetailResponse,
  type WorkItemDetail,
} from "@ka/domain";
import { z } from "zod";

import {
  tupleAllowed,
  validBusinessReadAuth,
  type BusinessReadAuth,
} from "../auth/business-read-auth.js";
import { resolveRequestId } from "./request-id.js";

const idSchema = z.string().uuid();

export interface WorkItemDetailPort {
  find(workspaceId: string, workItemId: string): Promise<WorkItemRecord | null>;
}

export interface ChangeSetDetailPort {
  find(workspaceId: string, changeSetId: string): Promise<ChangeSetRecord | null>;
}

export interface ReadDetailServiceDependencies {
  workItems: WorkItemDetailPort;
  changeSets: ChangeSetDetailPort;
}

function iso(value: Date | null): string | null {
  return value === null ? null : value.toISOString();
}

function authorized(
  media: string | null,
  accountId: string | null,
  auth: BusinessReadAuth,
): media is string {
  if (media === null || accountId === null) return false;
  return tupleAllowed(auth, media, accountId);
}

type WorkItemScope = "account" | "personal" | "invalid";

function workItemScope(record: WorkItemRecord): WorkItemScope {
  if (record.media === null && record.accountId === null) return "personal";
  if (record.media === null || record.accountId === null) return "invalid";
  return "account";
}

function personalWorkItemAuthorized(
  record: WorkItemRecord,
  auth: BusinessReadAuth,
): boolean {
  return auth.workspaceKind === "personal" &&
    (record.assignee === auth.userId || record.creator === auth.userId);
}

function error(
  code: "INVALID_REQUEST" | "FORBIDDEN" | "NOT_FOUND" | "INTERNAL_ERROR",
  message: string,
  requestId: string,
): ReadDetailResponse {
  return readDetailResponseSchema.parse({
    ok: false,
    error: { code, message, retryable: false, requestId },
  });
}

function workItemDetail(record: WorkItemRecord): WorkItemDetail {
  return {
    ...record,
    slaDue: iso(record.slaDue),
    createdAt: record.createdAt.toISOString(),
    resolvedAt: iso(record.resolvedAt),
  };
}

function changeSetDetail(record: ChangeSetRecord): ChangeSetDetail {
  if (record.media === null || record.accountId === null) throw new Error("unscoped changeset");
  return {
    id: record.id,
    workspaceId: record.workspaceId,
    media: record.media,
    accountId: record.accountId,
    workItemId: record.workItemId,
    title: record.title,
    status: record.status,
    initiatorUserId: record.initiator,
    executorIdentity: record.executorIdentity,
    multicaIssueId: record.multicaIssueId,
    ttlExpireAt: iso(record.ttlExpireAt),
    reasonCode: record.reasonCode,
    simulation: record.simulation,
    createdAt: record.createdAt.toISOString(),
    executedAt: iso(record.executedAt),
    items: record.items,
  };
}

export class ReadDetailService {
  constructor(private readonly dependencies: ReadDetailServiceDependencies) {}

  async getWorkItem(
    id: string,
    auth: unknown,
    correlationId?: string,
  ): Promise<ReadDetailResponse> {
    const requestId = resolveRequestId(correlationId ?? null);
    if (!idSchema.safeParse(id).success) return error("INVALID_REQUEST", "Invalid work item id", requestId);
    if (!validBusinessReadAuth(auth)) {
      return error("FORBIDDEN", "Approved authentication context is invalid", requestId);
    }
    try {
      const record = await this.dependencies.workItems.find(auth.workspaceId, id);
      if (record === null) return error("NOT_FOUND", "Work item was not found", requestId);
      if (record.id !== id || record.workspaceId !== auth.workspaceId) {
        return error("INTERNAL_ERROR", "Work item detail identity could not be verified", requestId);
      }
      const scope = workItemScope(record);
      if (scope === "invalid") {
        return error("INTERNAL_ERROR", "Work item detail scope could not be verified", requestId);
      }
      if (
        (scope === "account" && !authorized(record.media, record.accountId, auth)) ||
        (scope === "personal" && !personalWorkItemAuthorized(record, auth))
      ) {
        return error("FORBIDDEN", "Work item is outside the approved scope", requestId);
      }
      return readDetailResponseSchema.parse({
        ok: true,
        data: { kind: "work_item", workItem: workItemDetail(record) },
      });
    } catch {
      return error("INTERNAL_ERROR", "Work item detail could not be loaded", requestId);
    }
  }

  async getChangeSet(
    id: string,
    auth: unknown,
    correlationId?: string,
  ): Promise<ReadDetailResponse> {
    const requestId = resolveRequestId(correlationId ?? null);
    if (!idSchema.safeParse(id).success) return error("INVALID_REQUEST", "Invalid changeset id", requestId);
    if (!validBusinessReadAuth(auth)) {
      return error("FORBIDDEN", "Approved authentication context is invalid", requestId);
    }
    if (auth.workspaceKind === "team") {
      return error("FORBIDDEN", "Changesets are not available in a read-only team workspace", requestId);
    }
    try {
      const record = await this.dependencies.changeSets.find(auth.workspaceId, id);
      if (record === null) return error("NOT_FOUND", "Changeset was not found", requestId);
      if (record.id !== id || record.workspaceId !== auth.workspaceId) {
        return error("INTERNAL_ERROR", "Changeset detail identity could not be verified", requestId);
      }
      if (!authorized(record.media, record.accountId, auth)) {
        return error("FORBIDDEN", "Changeset is outside the approved account scope", requestId);
      }
      return readDetailResponseSchema.parse({
        ok: true,
        data: { kind: "changeset", changeset: changeSetDetail(record) },
      });
    } catch {
      return error("INTERNAL_ERROR", "Changeset detail could not be loaded", requestId);
    }
  }
}
