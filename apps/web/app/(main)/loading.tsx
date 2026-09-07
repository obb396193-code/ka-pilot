import { Skeleton } from "@/components/ui/skeleton"

// 路由切换加载态（Next loading.tsx）：切页时立刻给反馈，别让人以为点击没反应；骨架按「页头 + 六卡 + 一张表」的通用形状
export default function MainLoading() {
  return (
    <div className="flex flex-col gap-4 px-4 py-4 lg:px-6" aria-busy="true" aria-label="页面加载中">
      <div className="flex flex-col gap-2"><Skeleton className="h-7 w-40" /><Skeleton className="h-4 w-80" /></div>
      <div className="grid gap-4 @3xl/main:grid-cols-3 @6xl/main:grid-cols-6">{Array.from({ length: 6 }).map((_, index) => <Skeleton key={index} className="h-28 rounded-xl" />)}</div>
      <Skeleton className="h-9 w-72" />
      <Skeleton className="h-80 rounded-xl" />
    </div>
  )
}
