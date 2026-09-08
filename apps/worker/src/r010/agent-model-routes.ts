import { AgentModelCatalogError } from "@ka/db";
import { agentModelCatalogSchema, approvedWorkspaceAuthContextSchema } from "@ka/domain";
import type { AgentModelCatalogService } from "../agent/model-catalog-service.js";
import { resolveRequestId } from "../data/request-id.js";
import { byteLimit, R010HttpError, sendData, sendFailure } from "./http.js";
import type { R010Route } from "./routes.js";

export function createAgentModelRoute(service: Pick<AgentModelCatalogService, "list"> | undefined): R010Route {
  return {
    matches: pathname => pathname === "/api/v1/agent/models",
    async handle({ request, response, url, auth, requestId: suppliedId, maxResponseBytes }) {
      const requestId = resolveRequestId(suppliedId);
      try {
        if (!approvedWorkspaceAuthContextSchema.safeParse(auth).success) throw new R010HttpError(403, "FORBIDDEN");
        if (request.method !== "GET") throw new R010HttpError(405, "INVALID_REQUEST");
        if ([...url.searchParams].length !== 0) throw new R010HttpError(400, "INVALID_REQUEST");
        if (!service) throw new R010HttpError(503, "SOURCE_UNAVAILABLE");
        const result = agentModelCatalogSchema.safeParse(await service.list(auth));
        if (!result.success) throw new R010HttpError(502, "UPSTREAM_INVALID_RESPONSE");
        sendData(response, result.data, requestId, byteLimit(maxResponseBytes, 16 * 1024 * 1024));
      } catch (error) {
        if (error instanceof R010HttpError) sendFailure(response, error.status, error.code, requestId, "GET");
        else if (error instanceof AgentModelCatalogError) {
          const status = { FORBIDDEN: 403, SOURCE_UNAVAILABLE: 503, SOURCE_TRUNCATED: 502, UPSTREAM_INVALID_RESPONSE: 502 }[error.code];
          sendFailure(response, status, error.code, requestId, "GET");
        } else sendFailure(response, 500, "INTERNAL_ERROR", requestId, "GET");
      }
    },
  };
}
