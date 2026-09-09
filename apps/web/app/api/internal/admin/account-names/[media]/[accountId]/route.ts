import { internalJsonResponse } from "@/lib/data/internal-api-bff"
import { handleAdminAccountNamePatch } from "@/lib/data/r014/routes-server"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

// F8-9 归属清洗：人工改 / 确认单条（契约 v1.8 PATCH /api/v1/admin/account-names/:media/:accountId）
export async function PATCH(request: Request, { params }: { params: Promise<{ media: string; accountId: string }> }) {
  const resolved = await params
  return internalJsonResponse(await handleAdminAccountNamePatch(request, resolved.media, resolved.accountId, { environment: process.env }))
}
