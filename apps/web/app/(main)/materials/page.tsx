import { Suspense } from "react"

import { MaterialsPage } from "@/components/business/materials/materials-page"

export default function MaterialsRoute() {
  return <Suspense fallback={null}><MaterialsPage /></Suspense>
}
