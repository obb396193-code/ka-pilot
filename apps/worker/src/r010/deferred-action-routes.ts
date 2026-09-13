import { sendFailure } from "./http.js";
import type { R010Route } from "./routes.js";

// v1.9.44: authenticated transport only. No source/command/Agent is invoked.
// Review is already registered by R014. Subscription test-send/on-call are P199,
// not deferred placeholders, and must never be swallowed by this list.
const deferred = [
  { method: "POST", path: /^\/api\/v1\/accounts\/([^/]{1,128})\/([^/]{1,256})\/tests\/([^/]{1,128})\/stop$/ },
  { method: "POST", path: /^\/api\/v1\/rules\/([^/]{1,128})\/autonomy\/promote$/ },
  { method: "POST", path: /^\/api\/v1\/materials\/([^/]{1,128})\/replicate$/ },
  { method: "POST", path: /^\/api\/v1\/materials\/deliveries$/ },
  { method: "PUT", path: /^\/api\/v1\/reports\/ai-impact\/estimates$/ },
  { method: "POST", path: /^\/api\/v1\/reports\/monthly-exec\/decisions$/ },
  { method: "POST", path: /^\/api\/v1\/search\/actions$/ },
] as const;

export function createDeferredActionRoutes(): R010Route[] {
  return deferred.map(({ method, path }) => ({
    matches: pathname => path.test(pathname),
    async handle({ request, response, url, requestId }) {
      // Bodies cannot initiate work; drain without materializing untrusted JSON.
      request.resume();
      if (request.method !== method) { sendFailure(response, 405, "INVALID_REQUEST", requestId, method); return; }
      if (url.searchParams.size > 0) { sendFailure(response, 400, "INVALID_REQUEST", requestId); return; }
      sendFailure(response, 501, "NOT_IMPLEMENTED", requestId);
    },
  }));
}
