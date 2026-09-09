import { approvedWorkspaceAuthContextSchema, preflightPresentationDataSchema, preflightPresentationResponseSchema,
  shanghaiTaskBusinessDate } from "@ka/domain";
import { z } from "zod";
import type { ChangeSetDryRunService } from "../changesets/dry-run-service.js";
import { DryRunServiceError } from "../changesets/dry-run-contract.js";
import { byteLimit, readJson, R010HttpError, sendFailure } from "./http.js";
import type { R010Route } from "./routes.js";

const path = /^\/api\/v1\/changesets\/([^/]+)\/dry-run$/;
const statuses = { INVALID_REQUEST: 400, FORBIDDEN: 403, NOT_FOUND: 404, INVALID_STATE: 409,
  FROM_VALUE_CHANGED: 409, SOURCE_UNAVAILABLE: 503, UPSTREAM_TIMEOUT: 504,
  UPSTREAM_INVALID_RESPONSE: 502, INTERNAL_ERROR: 500 } as const;

const previewSchema = z.object({ data: preflightPresentationDataSchema,
  dataAsOf: z.string().datetime({ offset: true }).nullable() }).strict();

/** Only trusted observed evidence can become a successful presentation. The
 * pilot composition still has no media provider and returns SOURCE_UNAVAILABLE. */
export function createChangeSetDryRunRoute(service: Pick<ChangeSetDryRunService, "preview"> | undefined): R010Route {
  return {
    matches: pathname => path.test(pathname),
    async handle(ctx) {
      try {
        const auth = approvedWorkspaceAuthContextSchema.safeParse(ctx.auth);
        if (!auth.success || auth.data.workspaceKind !== "personal" || !auth.data.scope.accounts.some(a => a.accessLevel !== "read"))
          throw new R010HttpError(403, "FORBIDDEN");
        if (ctx.request.method !== "POST") throw new R010HttpError(405, "INVALID_REQUEST");
        const rawId = path.exec(ctx.url.pathname)?.[1];
        let id: string;
        try { id = decodeURIComponent(rawId ?? ""); } catch { throw new R010HttpError(400, "INVALID_REQUEST"); }
        if (!z.string().uuid().safeParse(id).success || [...ctx.url.searchParams].length !== 0)
          throw new R010HttpError(400, "INVALID_REQUEST");
        if (!z.object({}).strict().safeParse(await readJson(ctx.request, byteLimit(ctx.maxRequestBytes, 1024 * 1024))).success)
          throw new R010HttpError(400, "INVALID_REQUEST");
        if (service === undefined) throw new DryRunServiceError("SOURCE_UNAVAILABLE");
        const preview = previewSchema.safeParse(await service.preview(id, auth.data));
        if (!preview.success || preview.data.data.changesetId !== id ||
          (preview.data.dataAsOf !== null && Date.parse(preview.data.dataAsOf) > Date.parse(preview.data.data.checkedAt)))
          throw new R010HttpError(502, "UPSTREAM_INVALID_RESPONSE");
        const payload = preflightPresentationResponseSchema.safeParse({ ok: true, data: preview.data.data, meta: {
          requestId: ctx.requestId, dataAsOf: preview.data.dataAsOf,
          businessDate: shanghaiTaskBusinessDate(new Date(preview.data.data.checkedAt)),
          workspaceKind: auth.data.workspaceKind, selectedSource: "platform",
        } });
        if (!payload.success) throw new R010HttpError(502, "UPSTREAM_INVALID_RESPONSE");
        const body = JSON.stringify(payload.data);
        if (Buffer.byteLength(body) >= byteLimit(ctx.maxResponseBytes, 16 * 1024 * 1024))
          throw new R010HttpError(502, "SOURCE_TRUNCATED");
        ctx.response.writeHead(200, { "content-type": "application/json; charset=utf-8",
          "content-length": Buffer.byteLength(body), "cache-control": "no-store", "x-content-type-options": "nosniff", "x-request-id": ctx.requestId });
        ctx.response.end(body);
      } catch (error) {
        if (error instanceof DryRunServiceError && Object.hasOwn(statuses, error.code)) {
          const unavailable = error.code === "SOURCE_UNAVAILABLE";
          const payload = { ok: false, error: { code: error.code,
            message: unavailable ? "媒体只读通道未接入，试运行无法读取现值" : new DryRunServiceError(error.code).message,
            retryable: unavailable || error.code === "UPSTREAM_TIMEOUT", requestId: ctx.requestId } };
          const body = JSON.stringify(payload);
          if (Buffer.byteLength(body) >= byteLimit(ctx.maxResponseBytes, 16 * 1024 * 1024)) {
            sendFailure(ctx.response, 502, "SOURCE_TRUNCATED", ctx.requestId); return;
          }
          ctx.response.writeHead(statuses[error.code], { "content-type": "application/json; charset=utf-8",
            "content-length": Buffer.byteLength(body), "cache-control": "no-store", "x-content-type-options": "nosniff", "x-request-id": ctx.requestId });
          ctx.response.end(body);
        } else if (error instanceof R010HttpError) sendFailure(ctx.response, error.status, error.code, ctx.requestId);
        else sendFailure(ctx.response, 500, "INTERNAL_ERROR", ctx.requestId);
      }
    },
  };
}
