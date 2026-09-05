import { Suspense } from "react"

import { WorkbenchPage } from "@/components/business/workbench/workbench-page"

// 工作台（F-007 §3）：我的视图 ⇄ 负责人视图；今日｜协作 tab；数据源绑空间由服务端解析（DATA-ROUTE-001）
export default function Workbench() {
  return <Suspense fallback={null}><WorkbenchPage /></Suspense>
}
