import { Suspense } from "react"

import { IntegrationsPage } from "@/components/business/integrations/integrations-page"

export default function IntegrationsRoute() {
  return <Suspense fallback={null}><IntegrationsPage /></Suspense>
}
