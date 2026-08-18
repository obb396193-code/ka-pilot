import type { JobRecord } from "@ka/db";

import type { TerminalFailure } from "../jobs/consumer.js";
import type { OutboundStore } from "./types.js";

export function createFailureNotifier(store: OutboundStore) {
  return async (job: JobRecord, failure: TerminalFailure): Promise<void> => {
    const blockedAuth = failure.kind === "blocked_auth";
    const target = blockedAuth
      ? job.credentialOwnerUserId
        ? `user:${job.credentialOwnerUserId}`
        : `workspace:${job.workspaceId ?? "unknown"}:admins`
      : `workspace:${job.workspaceId ?? "unknown"}:admins`;

    await store.enqueue({
      workspaceId: job.workspaceId,
      channel: "dingtalk",
      target,
      kind: blockedAuth ? "job_blocked_auth" : "job_failed",
      payload: {
        jobId: job.id,
        jobType: job.jobType,
        attempts: job.attempts,
        error: failure.message,
      },
    });
  };
}
