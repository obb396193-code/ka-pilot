import { WorkbenchContainer } from "@/components/business/data-containers"
import type { QueryRecord } from "@/lib/data/data-view"

// v1.2 DATA-ROUTE-001：数据源绑定空间（personal→platform / team→ka_data）由服务端解析；
// 页面不再读 data_view，也不再提供三态切换器。
export default async function WorkbenchPage({ searchParams }: { searchParams: Promise<QueryRecord> }) {
  const query = await searchParams
  return <WorkbenchContainer query={query} />
}
