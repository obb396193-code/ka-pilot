import { redirect } from "next/navigation"

// PRD 2.2 的 /data/table = /data?tab=table（视图收敛）
export default function DataTableRedirect() {
  redirect("/data?tab=table")
}
