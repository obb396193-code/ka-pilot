import { redirect } from "next/navigation"

export default function DataPivotRedirect() {
  redirect("/data?tab=pivot")
}
