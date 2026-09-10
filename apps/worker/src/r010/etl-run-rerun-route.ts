import { EtlRunRerunError } from "@ka/db";
import { approvedWorkspaceAuthContextSchema, etlRunIdSchema, etlRunRerunRequestSchema,
  etlRunRerunResponseSchema, ETL_RERUN_CONFLICT_MESSAGE } from "@ka/domain";
import type { EtlRunRerunService } from "../admin/etl-run-rerun-service.js";
import { resolveRequestId } from "../data/request-id.js";
import { byteLimit, readJson, R010HttpError } from "./http.js";
import type { R010Route } from "./routes.js";

const path = /^\/api\/v1\/system\/etl-runs\/([^/]+)\/rerun$/;
export function createEtlRunRerunRoute(service: Pick<EtlRunRerunService, "rerun"> | undefined): R010Route {
  return { matches: pathname => path.test(pathname),
    async handle({ request, response, url, auth: rawAuth, requestId: suppliedId, maxResponseBytes, maxRequestBytes }) {
      const requestId = resolveRequestId(suppliedId);
      let status = 202, body: unknown;
      try {
        const auth = approvedWorkspaceAuthContextSchema.safeParse(rawAuth);
        if (!auth.success || auth.data.role !== "admin") throw new R010HttpError(403, "FORBIDDEN");
        if (request.method !== "POST") throw new R010HttpError(405, "INVALID_REQUEST");
        const id = etlRunIdSchema.safeParse(path.exec(url.pathname)?.[1]);
        if (!id.success || url.search !== "") throw new R010HttpError(400, "INVALID_REQUEST");
        const empty = !request.headers["transfer-encoding"] && (!request.headers["content-length"] || request.headers["content-length"] === "0");
        const command = empty ? {} : await readJson(request, byteLimit(maxRequestBytes, 64 * 1024));
        if (!etlRunRerunRequestSchema.safeParse(command).success) throw new R010HttpError(400, "INVALID_REQUEST");
        if (!service) throw new R010HttpError(503, "SOURCE_UNAVAILABLE");
        const max = byteLimit(maxResponseBytes, 16 * 1024 * 1024);
        // A UUID has fixed serialized length. Reject a too-small transport cap
        // BEFORE enqueue, so success cannot commit then turn into a size error.
        const planned = { ok: true, data: { jobId: "00000000-0000-4000-8000-000000000000", sourceRunId: id.data }, meta: { requestId } };
        if (Buffer.byteLength(JSON.stringify(planned)) >= max) throw new R010HttpError(502, "SOURCE_TRUNCATED");
        const result = etlRunRerunResponseSchema.safeParse(await service.rerun(auth.data, id.data, requestId));
        if (!result.success || !result.data.ok || result.data.data.sourceRunId !== id.data || result.data.meta.requestId !== requestId)
          throw new R010HttpError(502, "UPSTREAM_INVALID_RESPONSE");
        body = result.data;
        if (Buffer.byteLength(JSON.stringify(body)) >= max) throw new R010HttpError(502, "SOURCE_TRUNCATED");
      } catch (error) {
        let code = "INTERNAL_ERROR", message = "ETL rerun request could not be completed", details: { jobId: string } | undefined;
        status = 500;
        if (error instanceof R010HttpError) { code = error.code; status = error.status; }
        else if (error instanceof EtlRunRerunError) {
          code = error.code;
          status = { FORBIDDEN:403, INVALID_REQUEST:400, NOT_FOUND:404, INVALID_STATE:409, CONFLICT:409,
            UPSTREAM_INVALID_RESPONSE:502, SOURCE_TRUNCATED:502, SOURCE_UNAVAILABLE:503, UPSTREAM_TIMEOUT:504 }[error.code];
          if (code === "CONFLICT") {
            const candidate = { ok: false, error: { code, message: ETL_RERUN_CONFLICT_MESSAGE, retryable: false, requestId, details: { jobId: error.jobId } } };
            if (etlRunRerunResponseSchema.safeParse(candidate).success) { details = { jobId: error.jobId! }; message = ETL_RERUN_CONFLICT_MESSAGE; }
            else { status = 502; code = "UPSTREAM_INVALID_RESPONSE"; }
          }
        }
        body = { ok: false, error: { code, message, retryable: false, requestId, ...(details ? { details } : {}) } };
        request.resume();
      }
      const json = JSON.stringify(body);
      response.writeHead(status, { "content-type":"application/json; charset=utf-8", "content-length":Buffer.byteLength(json),
        "cache-control":"no-store", "x-content-type-options":"nosniff", "x-request-id":requestId,
        ...(status === 405 ? { allow:"POST" } : {}), ...(status === 413 ? { connection:"close" } : {}) });
      response.end(json);
    },
  };
}
