import { accountMuteDaysSchema, accountMuteRequestSchema, accountMuteResultSchema, approvedAccountAccessSchema,
  approvedWorkspaceAuthContextSchema } from "@ka/domain";
import { z } from "zod";
import { resolveRequestId } from "../data/request-id.js";
import { AccountMuteServiceError, type AccountMuteService } from "../work-items/account-mute-service.js";
import { byteLimit, readJson, R010HttpError, sendData, sendFailure } from "./http.js";
import type { R010Route } from "./routes.js";

const mutePath = /^\/api\/v1\/accounts\/([^/]+)\/([^/]+)\/mute$/;
const ignorePath = /^\/api\/v1\/work-items\/([^/]+)\/ignore$/;
const ignoreRequestSchema = z.object({ mute_days: accountMuteDaysSchema.optional(), reason_chip: z.string().max(4096).optional() }).strict();
const targetSchema = approvedAccountAccessSchema.pick({ media: true, accountId: true });
const statuses = { FORBIDDEN: 403, INVALID_REQUEST: 400, NOT_FOUND: 404, INVALID_STATE: 409, UPSTREAM_INVALID_RESPONSE: 502, INTERNAL_ERROR: 500 } as const;
function pathPart(value: string): string {
  let decoded: string;
  try { decoded = decodeURIComponent(value); } catch { throw new R010HttpError(400, "INVALID_REQUEST"); }
  if (decoded.includes("/") || decoded.includes("\\")) throw new R010HttpError(400, "INVALID_REQUEST");
  return decoded;
}

/** Injectable handlers only. arch must connect this factory behind existing
 * bearer+session auth. No socket, global route mutation, media call or Job queue.
 */
export function createAccountMuteRoutes(service: Pick<AccountMuteService, "mute" | "ignoreAndMute">): R010Route[] {
  return [{
    matches: pathname => mutePath.test(pathname) || ignorePath.test(pathname),
    async handle(context) {
      const requestId = resolveRequestId(context.requestId);
      try {
        const auth = approvedWorkspaceAuthContextSchema.safeParse(context.auth);
        if (!auth.success || auth.data.workspaceKind !== "personal" || auth.data.scope.accounts.length === 0)
          throw new R010HttpError(403, "FORBIDDEN");
        if (context.request.method !== "POST") throw new R010HttpError(405, "INVALID_REQUEST");
        if ([...context.url.searchParams].length !== 0) throw new R010HttpError(400, "INVALID_REQUEST");
        const maxRequest = byteLimit(context.maxRequestBytes, 1024 * 1024);
        const maxResponse = byteLimit(context.maxResponseBytes, 16 * 1024 * 1024);
        const mute = mutePath.exec(context.url.pathname), ignore = ignorePath.exec(context.url.pathname);
        let result: unknown;
        if (mute?.[1] !== undefined && mute[2] !== undefined) {
          const target = targetSchema.safeParse({ media: pathPart(mute[1]), accountId: pathPart(mute[2]) });
          if (!target.success) throw new R010HttpError(400, "INVALID_REQUEST");
          if (!auth.data.scope.accounts.some(a => a.media === target.data.media && a.accountId === target.data.accountId))
            throw new R010HttpError(403, "FORBIDDEN");
          const body = accountMuteRequestSchema.safeParse(await readJson(context.request, maxRequest));
          if (!body.success) throw new R010HttpError(400, "INVALID_REQUEST");
          result = await service.mute(auth.data, target.data, body.data);
        } else if (ignore?.[1] !== undefined) {
          const id = z.string().uuid().safeParse(pathPart(ignore[1]));
          if (!id.success) throw new R010HttpError(400, "INVALID_REQUEST");
          const body = ignoreRequestSchema.safeParse(await readJson(context.request, maxRequest));
          if (!body.success) throw new R010HttpError(400, "INVALID_REQUEST");
          // Plain ignore remains valid but unimplemented here; never silently
          // turn it into a mute or invent its public success DTO.
          if (body.data.mute_days === undefined) throw new R010HttpError(503, "SOURCE_UNAVAILABLE");
          result = await service.ignoreAndMute(auth.data, id.data, body.data);
        } else throw new R010HttpError(404, "NOT_FOUND");
        const parsed = accountMuteResultSchema.safeParse(result);
        if (!parsed.success) throw new R010HttpError(502, "UPSTREAM_INVALID_RESPONSE");
        sendData(context.response, parsed.data, requestId, maxResponse);
      } catch (error) {
        if (error instanceof R010HttpError) sendFailure(context.response, error.status, error.code, requestId);
        else if (error instanceof AccountMuteServiceError) sendFailure(context.response, statuses[error.code], error.code, requestId);
        else sendFailure(context.response, 500, "INTERNAL_ERROR", requestId);
      }
    },
  }];
}
