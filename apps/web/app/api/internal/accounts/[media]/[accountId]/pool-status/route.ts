import { internalJsonResponse } from "@/lib/data/internal-api-bff"
import { handleAccountPoolStatus } from "@/lib/data/r014/routes-server"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

// 账户池状态人工改写 / 撤销人工态（v1.5.1 ①）
export async function PATCH(
  request: Request, { params }: { params: Promise<{ media: string; accountId: string }> },
) {
  const resolved = await params
  return internalJsonResponse(
    await handleAccountPoolStatus(request, resolved.media, resolved.accountId, { environment: process.env }),
  )
}

export async function DELETE(
  request: Request, { params }: { params: Promise<{ media: string; accountId: string }> },
) {
  const resolved = await params
  return internalJsonResponse(
    await handleAccountPoolStatus(request, resolved.media, resolved.accountId, { environment: process.env }),
  )
}
