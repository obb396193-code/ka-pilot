import { AccountTransferRepository } from "@ka/db";
import { TRANSFER_BLOCKED_BY_CHANGESET } from "@ka/domain";
import type { Pool } from "pg";

import { R014HttpError, guardedRoute, readJsonBody, requireMethod, sendData } from "./http.js";
import type { R014Route } from "./routes.js";

// v1.5 4.10 账户交接（A7）。
const TRANSFER_ALL = /^\/api\/v1\/users\/([0-9a-fA-F-]{36})\/transfer-all$/;

/** 请求体用 snake_case（契约原文），内部一律 camelCase。 */
function normalize(body: Record<string, unknown> | undefined): unknown {
  const include = (body?.include ?? {}) as Record<string, unknown>;
  return {
    items: Array.isArray(body?.items)
      ? (body.items as Record<string, unknown>[]).map((item) => ({
        media: item.media,
        accountId: item.accountId ?? item.account_id,
      }))
      : body?.items,
    toUserId: body?.toUserId ?? body?.to_user_id,
    include: {
      workItems: include.workItems ?? include.work_items ?? false,
      dispatches: include.dispatches ?? false,
      starred: include.starred ?? false,
    },
    note: body?.note ?? null,
  };
}

export function createTransferRoutes(pool: Pool): R014Route[] {
  const repository = new AccountTransferRepository(pool);

  return [
    guardedRoute((pathname) => pathname === "/api/v1/accounts/transfer", async (context) => {
      requireMethod(context.request, ["POST"]);
      const body = await readJsonBody(context.request, 262_144) as Record<string, unknown> | undefined;
      const result = await repository.transfer(context.auth, normalize(body) as never);
      // 有账户因未终态变更集被挡时，整体仍是 200——其余户确实交接了，
      // 被挡的在 skipped 里逐条列出来。全部被挡才回 409，避免「部分成功」被当成失败。
      if (result.moved.accounts === 0
        && result.skipped.some((entry) => entry.reason === "blocked_by_changeset")) {
        throw new R014HttpError(409, "CONFLICT", TRANSFER_BLOCKED_BY_CHANGESET);
      }
      sendData(context.response, result, context.requestId, context.maxResponseBytes);
    }),

    guardedRoute((pathname) => TRANSFER_ALL.test(pathname), async (context) => {
      requireMethod(context.request, ["POST"]);
      const fromUserId = TRANSFER_ALL.exec(context.url.pathname)![1]!;
      const body = await readJsonBody(context.request, 65_536) as Record<string, unknown> | undefined;
      const toUserId = String(body?.toUserId ?? body?.to_user_id ?? "");
      if (!/^[0-9a-fA-F-]{36}$/.test(toUserId)) {
        throw new R014HttpError(400, "INVALID_REQUEST", "to_user_id is required");
      }
      sendData(
        context.response,
        await repository.transferAll(context.auth, fromUserId, toUserId, (body?.note as string | null) ?? null),
        context.requestId, context.maxResponseBytes,
      );
    }),
  ];
}
