import { internalJsonResponse } from "@/lib/data/internal-api-bff"
import { handleTransferAll } from "@/lib/data/r014/routes-server"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

// Q-030：离职交接——把某人名下全部有效授权的账户打包转走（admin）
export async function POST(request: Request, { params }: { params: Promise<{ userId: string }> }) {
  const resolved = await params
  return internalJsonResponse(await handleTransferAll(request, resolved.userId, { environment: process.env }))
}
