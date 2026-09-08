import "server-only"

import { forwardToBackend, type R014BffResult } from "./forwarder.ts"
import {
  accountPipelineSchema,
  meCountsSchema,
  meNotificationsReadSchema,
  meNotificationsSchema,
  mePreferencesSchema,
  meWorkloadSchema,
  searchResultSchema,
} from "./schemas.ts"

type Environment = Record<string, string | undefined>
type Deps = { environment: Environment; fetchImpl?: Parameters<typeof forwardToBackend>[1]["fetchImpl"]; requestId?: () => string }

const withDeps = (deps: Deps) => ({
  environment: deps.environment as Parameters<typeof forwardToBackend>[1]["environment"],
  ...(deps.fetchImpl === undefined ? {} : { fetchImpl: deps.fetchImpl }),
  ...(deps.requestId === undefined ? {} : { requestId: deps.requestId }),
})

export const handleMeCounts = (request: Request, deps: Deps): Promise<R014BffResult> =>
  forwardToBackend(request, { path: "/api/v1/me/counts", method: "GET", dataSchema: meCountsSchema, ...withDeps(deps) })

export const handleMePreferences = (request: Request, deps: Deps): Promise<R014BffResult> =>
  forwardToBackend(request, {
    path: "/api/v1/me/preferences",
    method: request.method === "PATCH" ? "PATCH" : "GET",
    dataSchema: mePreferencesSchema,
    ...withDeps(deps),
  })

export const handleMeWorkload = (request: Request, deps: Deps): Promise<R014BffResult> =>
  forwardToBackend(request, { path: "/api/v1/me/workload", method: "GET", dataSchema: meWorkloadSchema, ...withDeps(deps) })

export const handleMeNotifications = (request: Request, deps: Deps): Promise<R014BffResult> =>
  forwardToBackend(request, {
    path: "/api/v1/me/notifications",
    method: "GET",
    allowedQuery: ["cursor", "limit", "unread_only"],
    dataSchema: meNotificationsSchema,
    ...withDeps(deps),
  })

export const handleMeNotificationsRead = (request: Request, deps: Deps): Promise<R014BffResult> =>
  forwardToBackend(request, {
    path: "/api/v1/me/notifications/read",
    method: "POST",
    dataSchema: meNotificationsReadSchema,
    ...withDeps(deps),
  })

export const handleSearch = (request: Request, deps: Deps): Promise<R014BffResult> =>
  forwardToBackend(request, {
    path: "/api/v1/search",
    method: "GET",
    allowedQuery: ["q", "type"],
    dataSchema: searchResultSchema,
    ...withDeps(deps),
  })

export const handleAccountPipeline = (request: Request, deps: Deps): Promise<R014BffResult> =>
  forwardToBackend(request, {
    path: "/api/v1/accounts/pipeline",
    method: "GET",
    allowedQuery: ["media"],
    dataSchema: accountPipelineSchema,
    ...withDeps(deps),
  })
