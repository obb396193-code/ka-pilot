import { PageBody, PageHeader } from "@/components/business/page-header"
import { NoAccess } from "@/components/business/state/no-access"

// 后端返 403 FORBIDDEN 时的统一落点（BFF 可直接跳这里），也可手动访问。
export default function ForbiddenPage() {
  return (
    <PageBody>
      <PageHeader title="没有权限" description="账户与写操作都按空间隔离；看得到入口不等于有权限。" />
      <div className="px-4 lg:px-6"><NoAccess /></div>
    </PageBody>
  )
}
