import { Suspense } from "react"

import { AdminPage } from "@/components/business/admin/admin-page"

export default function AdminRoute() {
  return <Suspense fallback={null}><AdminPage /></Suspense>
}
