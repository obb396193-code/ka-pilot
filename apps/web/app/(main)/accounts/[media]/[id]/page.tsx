import { Suspense } from "react"

import { AccountDetailPage } from "@/components/business/accounts/account-detail-page"

// 账户级端点统一 :media/:id 三键（契约 v1.5）
export default async function AccountDetail({ params }: { params: Promise<{ media: string; id: string }> }) {
  const { media, id } = await params
  return <Suspense fallback={null}><AccountDetailPage media={decodeURIComponent(media)} accountId={decodeURIComponent(id)} /></Suspense>
}
