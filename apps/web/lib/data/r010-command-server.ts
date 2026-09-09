import "server-only"

import { handleR010CommandRequest } from "./r010-command-bff.ts"
import { internalJsonResponse } from "./internal-api-bff.ts"

export async function handleR010CommandRoute(request: Request): Promise<Response> {
  const result = await handleR010CommandRequest(request, { environment: process.env })
  const response = internalJsonResponse(result)
  if (result.status === 405) response.headers.set("allow", "POST")
  return response
}
