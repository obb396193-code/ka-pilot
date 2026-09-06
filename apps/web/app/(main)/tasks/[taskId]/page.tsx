import { Suspense } from "react"

import { TaskDetailPage } from "@/components/business/tasks/task-detail-page"

// 任务详情八页签（v1.5.1 ②），?tab= 收敛
export default async function TaskDetailRoute({ params }: { params: Promise<{ taskId: string }> }) {
  const { taskId } = await params
  return <Suspense fallback={null}><TaskDetailPage taskId={decodeURIComponent(taskId)} /></Suspense>
}
