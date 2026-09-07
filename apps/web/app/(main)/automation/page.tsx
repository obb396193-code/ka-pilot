import { Suspense } from "react"

import { AutomationPage } from "@/components/business/automation/automation-page"

export default function AutomationRoute() {
  return <Suspense fallback={null}><AutomationPage /></Suspense>
}
