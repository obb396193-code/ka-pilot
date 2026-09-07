import { Suspense } from "react"

import { SearchResultsPage } from "@/components/business/search/search-results-page"

// 全部搜索结果页：⌘K 直达之外的「翻一翻」落点；useSearchParams 需要 Suspense 边界。
export default function SearchPage() {
  return (
    <Suspense fallback={null}>
      <SearchResultsPage />
    </Suspense>
  )
}
