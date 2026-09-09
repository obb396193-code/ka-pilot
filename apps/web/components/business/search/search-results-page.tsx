"use client"

import { useMemo } from "react"
import Link from "next/link"
import { useSearchParams } from "next/navigation"
import { IconSearch, IconSparkles } from "@tabler/icons-react"

import { openAgentDrawer } from "@/components/business/command/events"
import { TypeChip } from "@/components/business/data-grid/data-grid"
import { PageBody, PageHeader } from "@/components/business/page-header"
import { useSession } from "@/components/business/session/session-provider"
import { ExampleBlock } from "@/components/business/state/page-state"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { isOk } from "@/lib/fixtures/contract"
import { searchFixture, searchTypeLabel, type SearchItem, searchSubtitle } from "@/lib/fixtures/agent"

// 全部搜索结果：⌘K 是直达（前几条），这里是「没直接找到，想翻一翻」的落点。
// 五类对象按 v1.7.4 冻结的 type 分组；搜不到不留白，给「问 AI」的出口。
const order: SearchItem["type"][] = ["account", "task", "work_item", "material", "document"]

export function SearchResultsPage() {
  const params = useSearchParams()
  const query = (params.get("q") ?? "").trim()
  const { isMock } = useSession()
  const data = isOk(searchFixture) ? searchFixture.data : { items: [], recent: [] }

  const groups = useMemo(() => {
    const matched = query
      ? data.items.filter((item) => `${item.title} ${item.id}`.toLowerCase().includes(query.toLowerCase()))
      : data.items
    return order
      .map((type) => ({ type, items: matched.filter((item) => item.type === type) }))
      .filter((group) => group.items.length > 0)
  }, [data.items, query])

  const total = groups.reduce((sum, group) => sum + group.items.length, 0)

  return (
    <PageBody>
      <PageHeader
        title={query ? `搜索「${query}」` : "搜索"}
        description={query ? `${total} 个结果 · 只搜你有权限的对象` : "在上方按 ⌘K 输入关键词，或从这里翻结果"}
        isMock={isMock}
      />
      <div className="flex flex-col gap-4 px-4 lg:px-6">
        <ExampleBlock unlock="搜索接口接入后按关键词实时检索（当前为示例索引）">
          {total === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-center gap-2 py-16 text-center">
                <IconSearch className="size-7 text-muted-foreground" />
                <p className="font-medium">{query ? "没找到匹配的对象" : "还没输入关键词"}</p>
                <p className="max-w-md text-sm text-muted-foreground">可以试试账户名、任务名、素材编号；搜不到的多半是不在你的授权范围内，或者对象还没建。</p>
                {query ? <Button size="sm" variant="outline" className="mt-1" onClick={() => openAgentDrawer(query)}><IconSparkles className="size-4" />问 AI：{query}</Button> : null}
              </CardContent>
            </Card>
          ) : (
            <div className="flex flex-col gap-4">
              {groups.map((group) => (
                <Card key={group.type}>
                  <CardHeader><CardTitle className="text-base">{searchTypeLabel[group.type]}</CardTitle><CardDescription>{group.items.length} 个</CardDescription></CardHeader>
                  <CardContent className="grid gap-2 @3xl/main:grid-cols-2">
                    {group.items.map((item) => (
                      <Link key={item.id} href={item.href} className="flex items-center justify-between gap-3 rounded-lg border px-3 py-2.5 hover:bg-muted/60">
                        <div className="min-w-0"><p className="truncate text-sm">{item.title}</p>{searchSubtitle(item) ? <p className="truncate text-xs text-muted-foreground">{searchSubtitle(item)}</p> : null}</div>
                        <span className="flex shrink-0 items-center gap-2"><TypeChip>{searchTypeLabel[item.type]}</TypeChip><span className="font-mono text-[10px] text-muted-foreground">{item.id}</span></span>
                      </Link>
                    ))}
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </ExampleBlock>

        {data.recent.length ? (
          <Card>
            <CardHeader><CardTitle className="text-base">最近访问</CardTitle><CardDescription>按你自己的浏览记录，不参与搜索排序</CardDescription></CardHeader>
            <CardContent className="flex flex-wrap gap-2">
              {data.recent.map((item) => <Button key={item.id} asChild size="sm" variant="outline"><Link href={item.href}>{item.title}</Link></Button>)}
            </CardContent>
          </Card>
        ) : null}
      </div>
    </PageBody>
  )
}
