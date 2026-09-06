import { Suspense } from "react"

import { SettingsPage } from "@/components/business/settings/settings-page"

export default function SettingsRoute() {
  return <Suspense fallback={null}><SettingsPage /></Suspense>
}
