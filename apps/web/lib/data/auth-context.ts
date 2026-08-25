import { z } from "zod"

const scopedAccountSchema = z.object({
  media: z.string().min(1).max(32).regex(/^[A-Z0-9_]+$/),
  accountId: z.string().min(1).max(128).regex(/^[A-Za-z0-9_-]+$/),
}).strict()

export const serverAuthContextSchema = z.object({
  workspaceId: z.string().uuid(),
  userId: z.string().trim().min(1),
  allowedAccounts: z.array(scopedAccountSchema).max(1_000),
}).strict()
export const internalServiceTokenSchema = z.string().min(32)

export type ServerAuthContext = z.infer<typeof serverAuthContextSchema>
export type ApprovedAuthContextResolver = () => Promise<unknown>

export type ServerAuthResolution =
  | { status: "approved"; context: ServerAuthContext }
  | { status: "rejected"; httpStatus: 401 | 403 }

export type DataQueryServerEnvironment = {
  NODE_ENV?: string
  KA_DATA_BACKEND_ORIGIN?: string
  KA_DATA_SERVICE_TOKEN?: string
  KA_DATA_DEV_AUTH_CONTEXT_ENABLED?: string
  KA_DATA_DEV_WORKSPACE_ID?: string
  KA_DATA_DEV_USER_ID?: string
  KA_DATA_DEV_ACCOUNT_SCOPE_JSON?: string
}

type ResolveOptions = {
  environment: DataQueryServerEnvironment
  approvedAuthContextResolver: ApprovedAuthContextResolver
}

function parseDevelopmentContext(environment: DataQueryServerEnvironment): ServerAuthContext | null {
  if (environment.KA_DATA_DEV_AUTH_CONTEXT_ENABLED !== "true") return null
  try {
    return serverAuthContextSchema.parse({
      workspaceId: environment.KA_DATA_DEV_WORKSPACE_ID,
      userId: environment.KA_DATA_DEV_USER_ID,
      allowedAccounts: JSON.parse(environment.KA_DATA_DEV_ACCOUNT_SCOPE_JSON ?? ""),
    })
  } catch {
    return null
  }
}

const rejectedAuthResolutionSchema = z.object({
  status: z.literal("rejected"),
  httpStatus: z.union([z.literal(401), z.literal(403)]),
}).passthrough()

export async function resolveServerAuthResolution(options: ResolveOptions): Promise<ServerAuthResolution> {
  const candidate = await options.approvedAuthContextResolver()
  const approved = serverAuthContextSchema.safeParse(candidate)
  if (approved.success) return { status: "approved", context: approved.data }

  const rejected = rejectedAuthResolutionSchema.safeParse(candidate)
  if (rejected.success) {
    return { status: "rejected", httpStatus: rejected.data.httpStatus }
  }

  if (options.environment.NODE_ENV === "development") {
    const developmentContext = parseDevelopmentContext(options.environment)
    if (developmentContext !== null) {
      return { status: "approved", context: developmentContext }
    }
  }

  return {
    status: "rejected",
    httpStatus: candidate === null || candidate === undefined ? 401 : 403,
  }
}

export async function resolveServerAuthContext(options: ResolveOptions): Promise<ServerAuthContext | null> {
  const resolution = await resolveServerAuthResolution(options)
  return resolution.status === "approved" ? resolution.context : null
}
