import { internalJsonResponse } from "@/lib/data/internal-api-bff"
import { handleTaskBatchSave } from "@/lib/data/r014/routes-server"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

// F8-23：一个业务大类整体保存（契约 v1.9.28 `POST /api/v1/tasks/batch-save`）。
// 后端逐条校验、**全部成功才写**；任一失败 400 带 details.failed[]，此时一条也没落库。
export async function POST(request: Request) {
  return internalJsonResponse(await handleTaskBatchSave(request, { environment: process.env }))
}
