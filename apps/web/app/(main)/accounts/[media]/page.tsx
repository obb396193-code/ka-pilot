import { redirect } from "next/navigation"

// 旧 /accounts/:id 形态作废（契约 v1.5 三键）：把单段当账户 ID，媒体默认快手
export default async function LegacyAccountRedirect({ params }: { params: Promise<{ media: string }> }) {
  const { media } = await params
  redirect(`/accounts/KUAISHOU/${media}`)
}
