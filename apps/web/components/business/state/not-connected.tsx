import { IconPlugConnectedX } from "@tabler/icons-react"

/**
 * 「接口未接入」空态（A35 / F8-25 ①）。
 *
 * 真实模式下还没接真接口的地方显它，**不显样例数据**。
 * 写出端点是有用的：看的人（老板 / OS / 后端）能立刻判断这是「后端还没有」
 * 还是「后端有了但前端没接」——只写一句「暂无数据」谁也不知道该找谁。
 */
export function NotConnected({ endpoint, hint }: { endpoint?: string; hint?: string }) {
  return (
    <div className="flex flex-col items-center gap-1.5 rounded-lg border border-dashed px-4 py-10 text-center">
      <IconPlugConnectedX className="size-5 text-muted-foreground" />
      <p className="text-sm text-muted-foreground">这一块还没接真接口</p>
      {endpoint ? <p className="font-mono text-xs text-muted-foreground/80">{endpoint}</p> : null}
      {hint ? <p className="max-w-md text-xs text-muted-foreground/80">{hint}</p> : null}
    </div>
  )
}
