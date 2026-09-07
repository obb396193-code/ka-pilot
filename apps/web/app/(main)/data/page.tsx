import { Suspense } from "react"

import { DataPage } from "@/components/business/data/data-page"

export default function DataAnalysisPage() {
  return <Suspense fallback={null}><DataPage /></Suspense>
}
