import { TaskDetail } from "@/components/business/tasks/task-detail"
import type { QueryRecord } from "@/lib/data/data-view"

export default async function TaskDetailPage({ params, searchParams }: { params: Promise<{ taskId: string }>; searchParams: Promise<QueryRecord> }) {
  const [{ taskId }, query] = await Promise.all([params, searchParams])
  return <TaskDetail taskId={decodeURIComponent(taskId)} query={query} />
}
