import { Suspense } from "react"

import { ReportsPage } from "@/components/business/reports/reports-page"

export default function ReportsRoute() {
  return <Suspense fallback={null}><ReportsPage /></Suspense>
}
