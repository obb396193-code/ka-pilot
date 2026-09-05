import { TasksContainer } from "@/components/business/tasks/tasks-container"
import type { QueryRecord } from "@/lib/data/data-view"

export default async function TasksPage({ searchParams }: { searchParams: Promise<QueryRecord> }) {
  const query = await searchParams
  return <TasksContainer query={query} />
}
