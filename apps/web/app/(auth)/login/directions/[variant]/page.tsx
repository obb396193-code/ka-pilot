import { notFound } from "next/navigation"

import { LoginDirection, loginVariants, splitPanels, type LoginVariant, type SplitPanel } from "@/components/business/auth/login-directions"

export default async function LoginDirectionPage({ params, searchParams }: { params: Promise<{ variant: string }>; searchParams: Promise<{ panel?: string }> }) {
  const { variant } = await params
  const { panel } = await searchParams
  if (!loginVariants.some((item) => item.value === variant)) notFound()
  const resolvedPanel = splitPanels.some((item) => item.value === panel) ? (panel as SplitPanel) : "image"
  return <LoginDirection variant={variant as LoginVariant} panel={resolvedPanel} />
}
