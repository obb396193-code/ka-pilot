import { Suspense } from "react"

import { AccountsPage } from "@/components/business/accounts/accounts-page"

export default function AccountsRoute() {
  return <Suspense fallback={null}><AccountsPage /></Suspense>
}
