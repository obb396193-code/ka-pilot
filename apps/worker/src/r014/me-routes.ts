import {
  IdentityPreferencesRepository, MeWorkspaceRepository, SavedViewRepository, UserWatchlistRepository,
  resolveIdentityId,
} from "@ka/db";
import {
  countUnread, markRead, projectNotifications, sealMeCounts,
  type MeCountsParts, type MeWorkload, type NotificationCandidate, type NotificationReadState,
} from "@ka/domain";
import type { Pool } from "pg";

import { R014HttpError, readJsonBody, requireMethod, sendData, sendEmpty, sendFailure } from "./http.js";
import type { R014Route, R014RouteContext } from "./routes.js";

/**
 * `/api/v1/me/*` 一族。
 *
 * **关于「缺源」的落点（已回抛 arch，见 inbox-arch Q-005）**：
 * `approvals` / `dispatches` 表要等 migration 014（Codex R-012）。仓储如实回 null，
 * 但 HTTP 这一层把「表不存在」判成 **0** 而不是「未知」——表不存在意味着系统里
 * 根本没有审批单/派发单这种对象，计数确实是 0，不是「我们不知道」。
 * 一旦 014 落地，仓储自然返回真实计数，本层无需改动。
 */
const VIEW_ID = /^\/api\/v1\/me\/views\/([0-9a-fA-F-]{36})$/;

function coalesceAbsentSource(
  parts: MeCountsParts,
  candidates: readonly NotificationCandidate[],
  state: NotificationReadState,
): ReturnType<typeof sealMeCounts> {
  const sealed = sealMeCounts(parts);
  if (sealed.complete) return sealed;
  return sealMeCounts({
    workItems: parts.workItems,
    approvalsToApprove: parts.approvalsToApprove ?? 0,
    dispatchesReceived: parts.dispatchesReceived ?? 0,
    runsWaitingConfirmation: parts.runsWaitingConfirmation,
    // 仓储在投影源不齐时保守回 null；但缺的是「表不存在」的源，它们贡献 0 条通知，
    // 所以现有源算出来的未读数就是完整的。政策写在这一层，仓储保持只报事实。
    notificationsUnread: parts.notificationsUnread ?? countUnread(candidates, state),
    changesetsDraft: parts.changesetsDraft,
  });
}

export function createMeRoutes(pool: Pool): R014Route[] {
  const preferences = new IdentityPreferencesRepository(pool);
  const watchlists = new UserWatchlistRepository(pool);
  const views = new SavedViewRepository(pool);
  const me = new MeWorkspaceRepository(pool);

  const route = (
    matches: (pathname: string) => boolean,
    handle: (context: R014RouteContext) => Promise<void>,
  ): R014Route => ({
    matches,
    handle: async (context) => {
      try {
        await handle(context);
      } catch (error) {
        sendFailure(context.response, error, context.requestId);
      }
    },
  });

  return [
    route((pathname) => pathname === "/api/v1/me/preferences", async (context) => {
      const method = requireMethod(context.request, ["GET", "PATCH"]);
      const identityId = await resolveIdentityId(pool, context.auth);
      if (method === "GET") {
        sendData(context.response, await preferences.get(identityId), context.requestId, context.maxResponseBytes);
        return;
      }
      const body = await readJsonBody(context.request, 16_384);
      sendData(
        context.response,
        await preferences.patch(identityId, body as never),
        context.requestId, context.maxResponseBytes,
      );
    }),

    route((pathname) => pathname === "/api/v1/me/watchlist", async (context) => {
      const method = requireMethod(context.request, ["GET", "PUT"]);
      if (method === "GET") {
        sendData(context.response, await watchlists.get(context.auth), context.requestId, context.maxResponseBytes);
        return;
      }
      const body = await readJsonBody(context.request, 262_144);
      const items = (body as { items?: unknown })?.items;
      if (!Array.isArray(items)) throw new R014HttpError(400, "INVALID_REQUEST", "items must be an array");
      sendData(context.response, await watchlists.put(context.auth, items), context.requestId, context.maxResponseBytes);
    }),

    route((pathname) => pathname === "/api/v1/me/views", async (context) => {
      const method = requireMethod(context.request, ["GET", "POST"]);
      if (method === "GET") {
        const page = context.url.searchParams.get("page");
        sendData(
          context.response,
          { items: await views.list(context.auth, page ?? undefined) },
          context.requestId, context.maxResponseBytes,
        );
        return;
      }
      const body = await readJsonBody(context.request, 262_144);
      sendData(context.response, await views.create(context.auth, body as never), context.requestId, context.maxResponseBytes);
    }),

    route((pathname) => VIEW_ID.test(pathname), async (context) => {
      const method = requireMethod(context.request, ["PATCH", "DELETE"]);
      const id = VIEW_ID.exec(context.url.pathname)![1]!;
      if (method === "DELETE") {
        await views.remove(context.auth, id);
        sendEmpty(context.response, context.requestId);
        return;
      }
      const body = await readJsonBody(context.request, 262_144);
      sendData(context.response, await views.patch(context.auth, id, body as never), context.requestId, context.maxResponseBytes);
    }),

    route((pathname) => pathname === "/api/v1/me/counts", async (context) => {
      requireMethod(context.request, ["GET"]);
      const identityId = await resolveIdentityId(pool, context.auth);
      const state = await me.readState(identityId);
      const [parts, sources] = [await me.countsParts(context.auth, state), await me.notificationSources(context.auth)];
      const sealed = coalesceAbsentSource(parts, sources.candidates, state);
      if (!sealed.complete) {
        // 走到这里说明缺的不是「表不存在」而是真的算不出来，如实回 503，不编数字。
        throw new R014HttpError(503, "SOURCE_UNAVAILABLE", `Counts are unavailable: ${sealed.missing.join(", ")}`);
      }
      sendData(context.response, sealed.counts, context.requestId, context.maxResponseBytes);
    }),

    route((pathname) => pathname === "/api/v1/me/workload", async (context) => {
      requireMethod(context.request, ["GET"]);
      const parts = await me.workloadParts(context.auth);
      const workload: MeWorkload = {
        tasks: parts.tasks,
        accounts: parts.accounts,
        pending: {
          workItems: parts.pending.workItems,
          approvals: parts.pending.approvals ?? 0,
          dispatches: parts.pending.dispatches ?? 0,
          runsWaitingConfirmation: parts.pending.runsWaitingConfirmation,
        },
        // 没有值班表 = 系统里没有值班安排这种对象，如实说「今天不值班、没有下一班」。
        oncall: parts.oncall ?? { today: false, next: null },
        loadScore: { value: { value: null, state: "undefined" }, source: "not_configured", formula: null },
      };
      sendData(context.response, workload, context.requestId, context.maxResponseBytes);
    }),

    route((pathname) => pathname === "/api/v1/me/notifications", async (context) => {
      requireMethod(context.request, ["GET"]);
      const identityId = await resolveIdentityId(pool, context.auth);
      const [sources, state] = [await me.notificationSources(context.auth), await me.readState(identityId)];
      const limit = context.url.searchParams.get("limit");
      const cursor = context.url.searchParams.get("cursor");
      const page = projectNotifications(sources.candidates, state, {
        ...(limit === null ? {} : { limit: Number(limit) }),
        ...(cursor === null ? {} : { cursor }),
        unreadOnly: context.url.searchParams.get("unread_only") === "true",
      });
      sendData(context.response, page, context.requestId, context.maxResponseBytes);
    }),

    route((pathname) => pathname === "/api/v1/me/notifications/read", async (context) => {
      requireMethod(context.request, ["POST"]);
      const identityId = await resolveIdentityId(pool, context.auth);
      const body = await readJsonBody(context.request, 65_536);
      const ids = (body as { ids?: unknown } | undefined)?.ids;
      if (ids !== undefined && !Array.isArray(ids)) {
        throw new R014HttpError(400, "INVALID_REQUEST", "ids must be an array when present");
      }
      const sources = await me.notificationSources(context.auth);
      const next = markRead(
        sources.candidates,
        await me.readState(identityId),
        ids === undefined ? null : (ids as string[]),
        new Date().toISOString(),
      );
      await me.writeReadState(identityId, next);
      const page = projectNotifications(sources.candidates, next, { limit: 1 });
      sendData(context.response, { unread: page.unread }, context.requestId, context.maxResponseBytes);
    }),
  ];
}
