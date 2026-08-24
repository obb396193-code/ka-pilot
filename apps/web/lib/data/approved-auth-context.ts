import type { ServerAuthContext } from "./auth-context.ts"

// Integration seam for the approved server-side login/session provider.
// It must validate the session and resolve account scope server-side; never copy
// x-ka-* or Authorization values from the incoming browser request.
export async function resolveApprovedDataQueryAuthContext(): Promise<ServerAuthContext | null> {
  return null
}
