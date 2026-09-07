import Link from "next/link"

import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"

// 站内 404：地址打错 / 对象被删 / 收藏的旧链接。给出口，不给英文默认页。
export default function MainNotFound() {
  return (
    <div className="flex flex-col gap-4 px-4 py-4 lg:px-6">
      <Card>
        <CardContent className="flex flex-col items-center gap-3 py-16 text-center">
          <p className="text-4xl font-semibold tabular-nums text-muted-foreground">404</p>
          <p className="font-medium">这个页面不存在</p>
          <p className="max-w-md text-sm text-muted-foreground">地址可能打错了，或者这个任务 / 账户 / 文档已被删除、不在你当前空间的授权范围内。</p>
          <div className="mt-2 flex gap-2">
            <Button asChild size="sm"><Link href="/">回工作台</Link></Button>
            <Button asChild size="sm" variant="outline"><Link href="/tasks">去投放任务</Link></Button>
          </div>
          <p className="text-xs text-muted-foreground">找具体对象可以按 ⌘K 直接搜。</p>
        </CardContent>
      </Card>
    </div>
  )
}
