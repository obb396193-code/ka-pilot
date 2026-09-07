"use client"

import { useMemo, useState } from "react"
import { IconExternalLink, IconPhoto, IconPlayerPlay, IconPlus, IconSend, IconSparkles, IconVideo } from "@tabler/icons-react"
import { createColumnHelper } from "@tanstack/react-table"
import { toast } from "sonner"

import { actionsColumn, DataGrid, dragColumn, MissingValue, selectionColumn, StatusChip, TypeChip, useGridTable, type GridFeatures } from "@/components/business/data-grid/data-grid"
import { PageBody, PageHeader } from "@/components/business/page-header"
import { useSession } from "@/components/business/session/session-provider"
import { ExampleBlock, StateFrame, StateSwitch, usePageState } from "@/components/business/state/page-state"
import { PageTabs, usePageTab } from "@/components/business/tabs/page-tabs"
import { KpiCards } from "@/components/business/workbench/kpi-cards"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { DropdownMenuItem } from "@/components/ui/dropdown-menu"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import type { DisplayMetric } from "@/lib/data/contracts"
import { fmtTime, isOk, mv, rv } from "@/lib/fixtures/contract"
import { analysisStatusMeta, backtestFixture, backtestStatusLabel, briefFixture, briefStatusMeta, conclusionLabel, dimensionLabel, exclusionLabel, experimentsFixture, fmtDuration, lineageFixture, materialsFixture, methodLabel, productsFixture, productStatusMeta, sourceLabel, sourceStatusMeta, type LineageMethod, type MaterialItem, type ProductItem } from "@/lib/fixtures/materials"
import { cn } from "@/lib/utils"
import { MaterialAnalysisPanel } from "./material-analysis"

// 商品素材（F-007 §9）：tabs 商品池｜素材池｜拆片分析｜复刻任务｜测品复盘｜AIGC 下单；整页示例态（解锁 = 视频源探针通过 + R-015）
const tabs = [
  { value: "products", label: "商品池" },
  { value: "materials", label: "素材池" },
  { value: "analysis", label: "拆片分析" },
  { value: "replication", label: "复刻任务" },
  { value: "experiments", label: "测品复盘" },
  { value: "aigc", label: "AIGC 下单" },
] as const
type Tab = (typeof tabs)[number]["value"]
const UNLOCK = "素材接口接入 + 视频源探针通过后切换为真数据；商品主数据来自 ka-data 产品维表或人工录入（快手没有商品 API）"
const productHelper = createColumnHelper<GridFeatures, ProductItem>()
const productColumns = productHelper.columns([
  dragColumn<ProductItem>(),
  selectionColumn<ProductItem>(),
  productHelper.accessor("name", { header: "商品", enableHiding: false, meta: { label: "商品" }, cell: ({ row }) => <span className="font-medium">{row.original.name}</span> }),
  productHelper.accessor("status", { header: "状态", meta: { label: "状态" }, cell: ({ getValue }) => <StatusChip tone={productStatusMeta[getValue()].tone}>{productStatusMeta[getValue()].label}</StatusChip> }),
  productHelper.accessor((row) => row.attrs.category ?? "", { id: "category", header: "类目", meta: { label: "类目" }, cell: ({ getValue }) => getValue() ? <TypeChip>{getValue()}</TypeChip> : <MissingValue /> }),
  productHelper.accessor((row) => row.attrs.priceTier ?? "", { id: "price", header: "价格带", meta: { label: "价格带" }, cell: ({ getValue }) => getValue() ? <span className="tabular-nums">¥{getValue()}</span> : <MissingValue /> }),
  productHelper.accessor("materialCount", { header: "素材数", meta: { label: "素材数", align: "right" }, cell: ({ getValue }) => <span className="tabular-nums">{getValue()}</span> }),
  productHelper.accessor((row) => row.metrics.cost.value ?? null, { id: "cost", header: "消耗", meta: { label: "消耗", align: "right" }, cell: ({ row }) => <span className="tabular-nums">{mv(row.original.metrics.cost, "money0")}</span> }),
  productHelper.accessor((row) => row.metrics.exposure.value ?? null, { id: "exposure", header: "曝光", meta: { label: "曝光", align: "right" }, cell: ({ row }) => <span className="tabular-nums">{mv(row.original.metrics.exposure)}</span> }),
  productHelper.accessor((row) => row.metrics.realConversion.value ?? null, { id: "conv", header: "真实转化", meta: { label: "真实转化", align: "right" }, cell: ({ row }) => <span className="tabular-nums">{mv(row.original.metrics.realConversion)}</span> }),
  productHelper.accessor((row) => row.metrics.ratios.ctr.value ?? null, { id: "ctr", header: "CTR", meta: { label: "CTR", align: "right" }, cell: ({ row }) => <span className="tabular-nums">{rv(row.original.metrics.ratios.ctr)}</span> }),
  productHelper.accessor((row) => row.metrics.ratios.realCpa.value ?? null, { id: "cpa", header: "真实 CPA", meta: { label: "真实 CPA", align: "right" }, cell: ({ row }) => <span className="tabular-nums">{rv(row.original.metrics.ratios.realCpa, "money")}</span> }),
  productHelper.accessor("productId", { header: "ID", meta: { label: "ID" }, cell: ({ getValue }) => <span className="font-mono text-xs text-muted-foreground">{getValue()}</span> }),
  actionsColumn<ProductItem>((item) => (
    <>
      <DropdownMenuItem onSelect={() => toast(`商品「${item.name}」`, { description: "接入后打开详情" })}>详情</DropdownMenuItem>
      <DropdownMenuItem onSelect={() => toast("已转可放量", { description: "接口接入后生效（当前为示例）" })}>标为可放量</DropdownMenuItem>
    </>
  )),
])

function ProductsTab() {
  const items = isOk(productsFixture) ? productsFixture.data.items : []
  const table = useGridTable({ data: items, columns: productColumns, pageSize: 20, getRowId: (item) => item.productId, initialColumnVisibility: { productId: false } })
  const experiments = isOk(experimentsFixture) ? experimentsFixture.data : null
  const materials = isOk(materialsFixture) ? materialsFixture.data.items : []
  const nameOf = (id: string) => materials.find((item) => item.materialId === id)?.name ?? id
  return (
    <div className="flex flex-col gap-6">
      <DataGrid table={table} empty="商品池为空" toolbar={<p className="text-xs text-muted-foreground">主数据来自 ka-data 产品维表（团队）或人工录入（个人）</p>} actions={<Button size="sm" onClick={() => toast("新建商品（人工主数据）", { description: "接口接入后生效（当前为示例）" })}><IconPlus />新建商品</Button>} showPagination={false} />
      <Card>
        <CardHeader><CardTitle>商品 × 素材效果矩阵</CardTitle><CardDescription>每格 = 一个素材版本在该商品下的样本；样本不足不出结论</CardDescription></CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader className="bg-muted"><TableRow><TableHead>商品</TableHead><TableHead>素材</TableHead><TableHead className="text-right">账户 / 天</TableHead><TableHead className="text-right">曝光</TableHead><TableHead className="text-right">CTR</TableHead><TableHead className="text-right">推断转化率</TableHead><TableHead className="text-right">真实 CPA</TableHead><TableHead>样本</TableHead></TableRow></TableHeader>
            <TableBody>{experiments?.products.flatMap((product) => product.cells.map((cell) => <TableRow key={`${product.productVersionId}-${cell.materialVersionId}`}><TableCell>{items.find((item) => item.productId === product.productVersionId)?.name ?? product.productVersionId}</TableCell><TableCell>{nameOf(cell.materialVersionId)}</TableCell><TableCell className="text-right tabular-nums">{cell.accountCount} / {cell.activeDayCount}</TableCell><TableCell className="text-right tabular-nums">{mv(cell.exposure)}</TableCell><TableCell className="text-right tabular-nums">{rv(cell.ctr)}</TableCell><TableCell className="text-right tabular-nums">{rv(cell.inferenceRate)}</TableCell><TableCell className="text-right tabular-nums">{rv(cell.realCpa, "money")}</TableCell><TableCell>{cell.sampleStatus === "sufficient" ? <StatusChip tone="success">充足</StatusChip> : <StatusChip tone="muted">不足</StatusChip>}</TableCell></TableRow>))}</TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  )
}

function MaterialCard({ item, onOpen }: { item: MaterialItem; onOpen: (item: MaterialItem) => void }) {
  const unreachable = item.sourceStatus === "unreachable"
  return (
    <Card className={cn("flex flex-col", unreachable && "opacity-70")}>
      <div className="relative m-3 mb-0 flex aspect-video items-center justify-center rounded-lg bg-muted text-muted-foreground">{item.type === "video" ? <IconPlayerPlay className="size-6" /> : <IconPhoto className="size-6" />}<span className="absolute top-2 left-2 flex gap-1"><TypeChip className="bg-background/90 text-[10px]">{item.type === "video" ? "视频" : "图片"}</TypeChip>{item.lineageParentId ? <TypeChip className="bg-background/90 text-[10px]">复刻</TypeChip> : null}</span>{item.durationMs ? <span className="absolute right-2 bottom-2 rounded bg-background/90 px-1.5 text-[10px] tabular-nums">{fmtDuration(item.durationMs)}</span> : null}</div>
      <CardHeader className="pb-2"><CardTitle className="text-sm">{item.name}</CardTitle><CardDescription className="flex flex-wrap items-center gap-1 text-xs"><span>{sourceLabel[item.source]}</span><StatusChip tone={sourceStatusMeta[item.sourceStatus].tone} className="text-[10px]">{sourceStatusMeta[item.sourceStatus].label}</StatusChip><StatusChip tone={analysisStatusMeta[item.analysis.status].tone} className="text-[10px]">{analysisStatusMeta[item.analysis.status].label}{item.analysis.latestVersion ? ` v${item.analysis.latestVersion}` : ""}</StatusChip></CardDescription></CardHeader>
      <CardContent className="flex-1">
        <dl className="grid grid-cols-3 gap-1 text-xs"><div><dt className="text-muted-foreground">真实 CPA</dt><dd className="font-medium tabular-nums">{rv(item.metrics.ratios.realCpa, "money")}</dd></div><div><dt className="text-muted-foreground">CTR</dt><dd className="font-medium tabular-nums">{rv(item.metrics.ratios.ctr)}</dd></div><div><dt className="text-muted-foreground">CVR</dt><dd className="font-medium tabular-nums" title="列表 DTO 无 cvr 字段；显 −">−</dd></div><div><dt className="text-muted-foreground">消耗</dt><dd className="font-medium tabular-nums">{mv(item.metrics.cost, "money0")}</dd></div><div><dt className="text-muted-foreground">曝光</dt><dd className="font-medium tabular-nums">{mv(item.metrics.exposure)}</dd></div><div><dt className="text-muted-foreground">真实转化</dt><dd className="font-medium tabular-nums">{mv(item.metrics.realConversion)}</dd></div></dl>
        {item.tags.length ? <div className="mt-2 flex flex-wrap gap-1">{item.tags.map((tag) => <Badge key={tag} variant="secondary">{tag}</Badge>)}</div> : null}
      </CardContent>
      <CardFooter className="gap-2">
        <Button size="sm" variant="outline" onClick={() => onOpen(item)}>{item.analysis.status === "done" ? "看拆片" : "详情"}</Button>
        <Button size="sm" variant="outline" disabled={unreachable || item.analysis.status === "running"} title={unreachable ? "视频源不可达：analyze 会 409" : ""} onClick={() => toast("已排队拆片", { description: `已排队，完成后在素材详情看拆片结果` })}><IconSparkles />拆片</Button>
        <Button size="sm" variant="ghost" disabled={item.analysis.status !== "done"} onClick={() => toast("去复刻任务出 brief", { description: "接口接入后生效（当前为示例）" })}>复刻</Button>
      </CardFooter>
    </Card>
  )
}

function MaterialsTab({ onOpen }: { onOpen: (item: MaterialItem) => void }) {
  const [productId, setProductId] = useState("all")
  const [type, setType] = useState("all")
  const items = useMemo(() => (isOk(materialsFixture) ? materialsFixture.data.items : []).filter((item) => (productId === "all" || item.productId === productId) && (type === "all" || item.type === type)), [productId, type])
  const products = isOk(productsFixture) ? productsFixture.data.items : []
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <Select value={productId} onValueChange={setProductId}><SelectTrigger size="sm" className="w-44" aria-label="商品"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">全部商品</SelectItem>{products.map((product) => <SelectItem key={product.productId} value={product.productId}>{product.name}</SelectItem>)}</SelectContent></Select>
        <Select value={type} onValueChange={setType}><SelectTrigger size="sm" className="w-28" aria-label="类型"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">全部类型</SelectItem><SelectItem value="video">视频</SelectItem><SelectItem value="image">图片</SelectItem></SelectContent></Select>
        <span className="text-xs text-muted-foreground">共 {items.length} 条 · 视频源不可达标灰</span>
        <Button size="sm" className="ml-auto" onClick={() => toast("上传素材", { description: "接口接入后生效（当前为示例）" })}><IconPlus />上传</Button>
      </div>
      <div className="grid gap-4 @3xl/main:grid-cols-2 @6xl/main:grid-cols-3">{items.map((item) => <MaterialCard key={item.materialId} item={item} onOpen={onOpen} />)}</div>
    </div>
  )
}

function ReplicationTab() {
  const lineage = isOk(lineageFixture) ? lineageFixture.data : null
  const brief = isOk(briefFixture) ? briefFixture.data : null
  const backtest = isOk(backtestFixture) ? backtestFixture.data : null
  const [delivery, setDelivery] = useState(false)
  const [form, setForm] = useState({ variantKey: "v1", materialId: "", method: "script_rewrite" as LineageMethod })
  return (
    <div className="flex flex-col gap-4">
      <div className="grid gap-4 @5xl/main:grid-cols-2">
        <Card>
          <CardHeader><CardTitle>复刻谱系</CardTitle><CardDescription>源 → 变体（method 四类）· 变体指标缺 = −</CardDescription></CardHeader>
          <CardContent className="flex flex-col gap-2 text-sm">
            {lineage ? (
              <>
                <div className="flex items-center gap-2 rounded-lg border px-3 py-2"><IconVideo className="size-4 text-muted-foreground" /><span className="font-medium">{lineage.root.name}</span><TypeChip>源</TypeChip><span className="ml-auto font-mono text-xs text-muted-foreground">{lineage.root.materialId}</span></div>
                {lineage.children.map((child) => <div key={child.materialId} className="ml-6 flex flex-wrap items-center gap-2 rounded-lg border px-3 py-2"><span className="text-muted-foreground">└</span><span className="font-medium">{child.name}</span><TypeChip>{methodLabel[child.method]}</TypeChip><span className="text-xs text-muted-foreground tabular-nums">{child.createdAt}</span><span className="ml-auto text-xs tabular-nums">CPA {rv(child.metrics.ratios.realCpa, "money")} · CTR {rv(child.metrics.ratios.ctr)}</span></div>)}
              </>
            ) : null}
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>回测就绪</CardTitle><CardDescription>三态 等交付 / 等样本 / 可回测</CardDescription></CardHeader>
          <CardContent className="flex flex-col gap-2 text-sm">
            {backtest ? (
              <>
                <p><StatusChip tone={backtest.status === "ready" ? "success" : "warning"}>{backtestStatusLabel[backtest.status]}</StatusChip></p>
                {backtest.missingVariantKeys.length ? <p>缺交付变体：{backtest.missingVariantKeys.join(" / ")}</p> : <p className="text-muted-foreground">变体已全部交付</p>}
                {backtest.insufficientMaterialVersionIds.length ? <p>样本不足：{backtest.insufficientMaterialVersionIds.join("、")}（按实验策略阈值，不出结论）</p> : null}
                <p className="text-xs text-muted-foreground">样本足够后自动生成实验结论，进「测品复盘」。</p>
              </>
            ) : null}
          </CardContent>
        </Card>
      </div>
      {brief ? (
        <Card>
          <CardHeader>
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div><CardTitle className="flex items-center gap-2">设计 brief · {brief.briefId} v{brief.briefVersion}<StatusChip tone={briefStatusMeta[brief.status].tone}>{briefStatusMeta[brief.status].label}</StatusChip></CardTitle><CardDescription>源素材 {brief.sourceMaterialVersionId} · 商品 {brief.productVersionId} · 设计 {brief.designerRef ?? "未指派"} · {brief.createdBy.name} {fmtTime(brief.createdAt)} · 拆片指纹 {brief.sourceTeardownFingerprint.slice(0, 8)}… · 策略指纹 {brief.experimentPolicyFingerprint.slice(0, 8)}…</CardDescription></div>
              <div className="flex gap-2"><Button size="sm" variant="outline" disabled={brief.status !== "draft"} onClick={() => toast("已发给设计", { description: "接口接入后生效（当前为示例）" })}><IconSend />发送</Button><Button size="sm" onClick={() => setDelivery(true)}><IconPlus />登记交付</Button></div>
            </div>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            <p className="text-sm"><span className="text-muted-foreground">目标：</span>{brief.objective}</p>
            <p className="flex flex-wrap items-center gap-1 text-sm"><span className="text-muted-foreground">全局约束：</span>{brief.globalConstraints.map((item) => <Badge key={item} variant="outline">{item}</Badge>)}</p>
            <Table>
              <TableHeader className="bg-muted"><TableRow><TableHead>变体</TableHead><TableHead>改动维度</TableHead><TableHead>假设</TableHead><TableHead>指令</TableHead><TableHead>保持</TableHead></TableRow></TableHeader>
              <TableBody>{brief.variants.map((variant) => <TableRow key={variant.variantKey}><TableCell className="font-mono text-xs">{variant.variantKey}</TableCell><TableCell><TypeChip>{dimensionLabel[variant.changeDimension]}</TypeChip></TableCell><TableCell>{variant.hypothesis}</TableCell><TableCell>{variant.instruction}</TableCell><TableCell className="text-xs text-muted-foreground">{variant.keepDimensions.map((dim) => dimensionLabel[dim as keyof typeof dimensionLabel] ?? dim).join(" / ")}</TableCell></TableRow>)}</TableBody>
            </Table>
          </CardContent>
        </Card>
      ) : null}
      <Dialog open={delivery} onOpenChange={setDelivery}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>登记交付</DialogTitle><DialogDescription>交付后进谱系，等样本回测</DialogDescription></DialogHeader>
          <div className="grid gap-3">
            <div className="grid gap-1.5"><Label>变体</Label><Select value={form.variantKey} onValueChange={(value) => setForm((prev) => ({ ...prev, variantKey: value }))}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{brief?.variants.map((variant) => <SelectItem key={variant.variantKey} value={variant.variantKey}>{variant.variantKey} · {dimensionLabel[variant.changeDimension]}</SelectItem>)}</SelectContent></Select></div>
            <div className="grid gap-1.5"><Label>交付素材 ID</Label><Input value={form.materialId} onChange={(event) => setForm((prev) => ({ ...prev, materialId: event.target.value }))} placeholder="m-51xx" /></div>
            <div className="grid gap-1.5"><Label>方法</Label><Select value={form.method} onValueChange={(value) => setForm((prev) => ({ ...prev, method: value as LineageMethod }))}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{(Object.keys(methodLabel) as LineageMethod[]).map((key) => <SelectItem key={key} value={key}>{methodLabel[key]}</SelectItem>)}</SelectContent></Select></div>
          </div>
          <DialogFooter><Button variant="outline" onClick={() => setDelivery(false)}>取消</Button><Button disabled={!form.materialId} onClick={() => { toast.success("已登记交付", { description: `${form.variantKey} ← ${form.materialId}（${methodLabel[form.method]}）` }); setDelivery(false) }}>登记</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

function ExperimentsTab() {
  const data = isOk(experimentsFixture) ? experimentsFixture.data : null
  const materials = isOk(materialsFixture) ? materialsFixture.data.items : []
  const products = isOk(productsFixture) ? productsFixture.data.items : []
  const nameOf = (id: string) => materials.find((item) => item.materialId === id)?.name ?? id
  if (!data) return null
  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardHeader><CardTitle>实验策略 {data.policy.policyVersion}</CardTitle><CardDescription>样本阈值；不到阈值的格子不参与结论</CardDescription></CardHeader>
        <CardContent><dl className="grid grid-cols-2 gap-x-6 gap-y-1 text-xs @3xl/main:grid-cols-4"><dt className="text-muted-foreground">最少在投天数</dt><dd className="tabular-nums">{data.policy.minActiveDays}</dd><dt className="text-muted-foreground">最少账户</dt><dd className="tabular-nums">{data.policy.minAccounts}</dd><dt className="text-muted-foreground">最少曝光</dt><dd className="tabular-nums">{data.policy.minExposure.toLocaleString("zh-CN")}</dd><dt className="text-muted-foreground">最少点击</dt><dd className="tabular-nums">{data.policy.minClicks}</dd><dt className="text-muted-foreground">最少真实转化</dt><dd className="tabular-nums">{data.policy.minRealConversions}</dd><dt className="text-muted-foreground">最少消耗</dt><dd className="tabular-nums">¥{data.policy.minCost}</dd><dt className="text-muted-foreground">CPA 最小改善</dt><dd className="tabular-nums">{(data.policy.minCpaImprovementRate * 100).toFixed(0)}%</dd><dt className="text-muted-foreground">置信水平</dt><dd className="tabular-nums">{(data.policy.confidenceLevel * 100).toFixed(0)}% · 分母 {data.policy.conversionRateDenominator}</dd></dl></CardContent>
      </Card>
      {data.products.map((product) => (
        <Card key={product.productVersionId}>
          <CardHeader><CardTitle>{products.find((item) => item.productId === product.productVersionId)?.name ?? product.productVersionId}</CardTitle><CardDescription>结论：<span className="font-medium text-foreground">{conclusionLabel[product.conclusion.status]}</span>{product.conclusion.observedLeaderMaterialVersionId ? ` · 观察领先 ${nameOf(product.conclusion.observedLeaderMaterialVersionId)}` : ""}{product.conclusion.directionalLeaderMaterialVersionId ? ` · 方向性领先 ${nameOf(product.conclusion.directionalLeaderMaterialVersionId)}` : " · 无方向性领先"} · CPA 改善 {product.conclusion.cpaImprovementRate === null ? "−" : `${(product.conclusion.cpaImprovementRate * 100).toFixed(1)}%`}</CardDescription></CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader className="bg-muted"><TableRow><TableHead>素材版本</TableHead><TableHead className="text-right">账户 / 天</TableHead><TableHead className="text-right">曝光</TableHead><TableHead className="text-right">点击</TableHead><TableHead className="text-right">真实转化</TableHead><TableHead className="text-right">消耗</TableHead><TableHead className="text-right">CTR</TableHead><TableHead className="text-right">推断转化率（95% 区间）</TableHead><TableHead className="text-right">真实 CPA</TableHead><TableHead>样本</TableHead></TableRow></TableHeader>
              <TableBody>{product.cells.map((cell) => <TableRow key={cell.materialVersionId} className={cn(cell.sampleStatus === "insufficient" && "text-muted-foreground")}><TableCell>{nameOf(cell.materialVersionId)}</TableCell><TableCell className="text-right tabular-nums">{cell.accountCount} / {cell.activeDayCount}</TableCell><TableCell className="text-right tabular-nums">{mv(cell.exposure)}</TableCell><TableCell className="text-right tabular-nums">{mv(cell.click)}</TableCell><TableCell className="text-right tabular-nums">{mv(cell.realConversion)}</TableCell><TableCell className="text-right tabular-nums">{mv(cell.cost, "money0")}</TableCell><TableCell className="text-right tabular-nums">{rv(cell.ctr)}</TableCell><TableCell className="text-right tabular-nums">{rv(cell.inferenceRate)}{cell.inferenceRateInterval95 ? <span className="ml-1 text-xs text-muted-foreground">[{(cell.inferenceRateInterval95.lower * 100).toFixed(2)}%, {(cell.inferenceRateInterval95.upper * 100).toFixed(2)}%]</span> : null}</TableCell><TableCell className="text-right tabular-nums">{rv(cell.realCpa, "money")}</TableCell><TableCell>{cell.sampleStatus === "sufficient" ? <StatusChip tone="success">充足</StatusChip> : <span title={cell.exclusionReasons.map((reason) => exclusionLabel[reason] ?? reason).join("；")}><StatusChip tone="muted">不足 · {cell.exclusionReasons.length} 项</StatusChip></span>}</TableCell></TableRow>)}</TableBody>
            </Table>
          </CardContent>
        </Card>
      ))}
    </div>
  )
}

export function MaterialsPage() {
  const { isMock } = useSession()
  const state = usePageState()
  const [tab, setTab] = usePageTab<Tab>(tabs, "products")
  const [open, setOpen] = useState<MaterialItem | null>(null)
  const [analysisId, setAnalysisId] = useState("m-5001")
  const list = isOk(materialsFixture) ? materialsFixture.data : null
  const cards: DisplayMetric[] = list ? [
    { key: "testing", label: "测品中商品", value: String(list.cards.testingProducts), delta: null, tone: "neutral" },
    { key: "scalable", label: "可放量商品", value: String(list.cards.scalableProducts), delta: null, tone: "positive" },
    { key: "active", label: "在投素材", value: String(list.cards.activeMaterials), delta: null, tone: "neutral" },
    { key: "breakout", label: "爆量素材", value: String(list.cards.breakoutMaterials), delta: null, tone: "positive" },
    { key: "fatigued", label: "疲劳素材", value: String(list.cards.fatigued), delta: null, tone: "warning" },
    { key: "candidates", label: "复刻候选", value: String(list.cards.replicationCandidates), delta: null, tone: "neutral" },
  ] : []
  const materials = list?.items ?? []
  const analysisMaterial = materials.find((item) => item.materialId === analysisId) ?? materials[0] ?? null
  return (
    <PageBody>
      <PageHeader title="商品素材" description="商品池 · 素材池 · 拆片分析 · 复刻 · 测品复盘 · AIGC 下单；素材效果只用数据分析同口径，样本不足不出结论" isMock={isMock} actions={<StateSwitch />} />
      {cards.length ? <ExampleBlock unlock={UNLOCK} inline><KpiCards metrics={cards} /></ExampleBlock> : null}
      <PageTabs tabs={tabs} value={tab} onChange={setTab} />
      <div className="px-4 lg:px-6">
        <StateFrame state={state} unlock={UNLOCK} empty={{ title: "没有商品或素材", description: "先在商品池录入商品，再上传或从奇航素材池同步素材。" }}>
          <ExampleBlock unlock={UNLOCK}>
            {tab === "products" ? <ProductsTab /> : null}
            {tab === "materials" ? <MaterialsTab onOpen={setOpen} /> : null}
            {tab === "analysis" ? (
              <div className="flex flex-col gap-4">
                <div className="flex flex-wrap items-center gap-2"><Select value={analysisMaterial?.materialId ?? ""} onValueChange={setAnalysisId}><SelectTrigger size="sm" className="w-64" aria-label="素材"><SelectValue /></SelectTrigger><SelectContent>{materials.map((item) => <SelectItem key={item.materialId} value={item.materialId}>{item.name} · {analysisStatusMeta[item.analysis.status].label}</SelectItem>)}</SelectContent></Select><span className="text-xs text-muted-foreground">拆片结果按版本保存</span></div>
                {analysisMaterial ? <MaterialAnalysisPanel material={analysisMaterial} /> : null}
              </div>
            ) : null}
            {tab === "replication" ? <ReplicationTab /> : null}
            {tab === "experiments" ? <ExperimentsTab /> : null}
            {tab === "aigc" ? (
              <Card>
                <CardHeader><CardTitle>AIGC 下单</CardTitle><CardDescription>iframe 内嵌内部 material-order-platform（内网地址）；本产品只做入口与回链，不冻 DTO</CardDescription></CardHeader>
                <CardContent><div className="flex h-80 flex-col items-center justify-center gap-2 rounded-lg border border-dashed text-sm text-muted-foreground"><IconExternalLink className="size-6" /><p>内网 AIGC 下单平台会嵌在这里（需内网可达）</p><p className="text-xs">下单完成后回链到素材池（source = internal）</p><Button size="sm" variant="outline" disabled>打开内网地址</Button></div></CardContent>
              </Card>
            ) : null}
          </ExampleBlock>
        </StateFrame>
      </div>
      <Sheet open={open !== null} onOpenChange={(next) => { if (!next) setOpen(null) }}>
        <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-3xl">
          <SheetHeader><SheetTitle>{open?.name}</SheetTitle><SheetDescription>{open?.materialId} · {open ? sourceLabel[open.source] : ""} · {open ? sourceStatusMeta[open.sourceStatus].label : ""}</SheetDescription></SheetHeader>
          <div className="px-4 pb-6 @container/main">{open ? <MaterialAnalysisPanel material={open} /> : null}</div>
        </SheetContent>
      </Sheet>
    </PageBody>
  )
}
