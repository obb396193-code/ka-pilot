"use client"

import { DiagnosticDetailView } from "@/components/business/diagnostic-detail-view"
import { adaptChangeSetPreview, adaptWorkItemDetail } from "@/lib/data/adapters"
import type { QueryRecord } from "@/lib/data/data-view"
import { getMockChangeSetDetail, getMockWorkItemDetail } from "@/lib/data/mock-data"
import { useReadModel } from "@/lib/data/use-read-model"

// 只剩工作项详情（/work-items/[id]）还走 lib/data 读模型；工作台 / 账户池 / 数据分析已改读契约 fixtures（F-007）
function MockDiagnosticDetailContainer({ findingId }: { findingId: string }) {
  const workItem = getMockWorkItemDetail(findingId)
  const changeSet = getMockChangeSetDetail()
  const response = adaptWorkItemDetail(workItem, findingId, false, true)
  const preview = adaptChangeSetPreview(changeSet)
  return <DiagnosticDetailView response={response} preview={preview} />
}

function InternalDiagnosticDetailContainer({ findingId }: { findingId: string }) {
  const workItem = useReadModel("work-items", findingId)
  const changeSetId = null
  const changeSet = useReadModel("changesets", changeSetId)
  const response = adaptWorkItemDetail(workItem.response, findingId, workItem.loading)
  const preview = adaptChangeSetPreview(changeSet.response)
  return <DiagnosticDetailView response={response} preview={preview} />
}

export function DiagnosticDetailContainer({ findingId }: { findingId: string; query: QueryRecord }) {
  const isMock = process.env.NEXT_PUBLIC_KA_DATA_PROVIDER === "mock"
  return isMock ? <MockDiagnosticDetailContainer findingId={findingId} /> : <InternalDiagnosticDetailContainer findingId={findingId} />
}
