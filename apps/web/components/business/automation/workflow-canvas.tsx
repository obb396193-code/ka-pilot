"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { IconAlertTriangle, IconArrowLeft, IconBell, IconBolt, IconCircleCheck, IconClockPause, IconDatabaseSearch, IconFileDiff, IconGitBranch, IconMathFunction, IconPlayerPlay, IconSparkles, IconTrash, IconUserCheck } from "@tabler/icons-react"
import { addEdge, Background, BackgroundVariant, Controls, Handle, MarkerType, MiniMap, Position, ReactFlow, ReactFlowProvider, useEdgesState, useNodesState, useReactFlow, type Connection, type Edge, type Node, type NodeProps } from "@xyflow/react"
import "@xyflow/react/dist/style.css"
import { toast } from "sonner"

import { StatusChip, TypeChip } from "@/components/business/data-grid/data-grid"
import { PageBody, PageHeader } from "@/components/business/page-header"
import { useSession } from "@/components/business/session/session-provider"
import { ExampleBadge, StateFrame, StateSwitch, usePageState } from "@/components/business/state/page-state"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Separator } from "@/components/ui/separator"
import { definitionsFixture, executorLabel, graphFixture, nodeTypeMeta, nodeTypeOrder, sideEffectLabel, simulateFixture, validateFixture, type ExecutorIdentity, type GraphNode, type NodeType, type SideEffect, type WorkflowGraph } from "@/lib/fixtures/automation"
import { isOk } from "@/lib/fixtures/contract"
import { cn } from "@/lib/utils"

// 工作流画布（v1.5.1 ③ workflow-graph/v1）：React Flow；节点库十类拖拽、属性面板、校验 / 模拟 / 发布；write 未经 human_confirm → 红
type KpNodeData = { node: GraphNode; issue?: string | null; missing?: string[] }
type KpNode = Node<KpNodeData, "kp">
const typeIcon: Record<NodeType, typeof IconBolt> = { trigger: IconBolt, query: IconDatabaseSearch, compute: IconMathFunction, condition: IconGitBranch, agent_analysis: IconSparkles, changeset: IconFileDiff, human_confirm: IconUserCheck, execute: IconPlayerPlay, wait_reconcile: IconClockPause, notify: IconBell }

/** 分层布局：按最长路径深度排列，同深度纵向错开 */
function layout(graph: WorkflowGraph): Record<string, { x: number; y: number }> {
  const depth: Record<string, number> = {}
  const incoming = new Map<string, string[]>()
  graph.edges.forEach((edge) => incoming.set(edge.to, [...(incoming.get(edge.to) ?? []), edge.from]))
  const resolve = (id: string, seen: Set<string>): number => {
    if (depth[id] !== undefined) return depth[id]
    if (seen.has(id)) return 0
    seen.add(id)
    const parents = incoming.get(id) ?? []
    depth[id] = parents.length ? Math.max(...parents.map((parent) => resolve(parent, seen))) + 1 : 0
    return depth[id]
  }
  graph.nodes.forEach((node) => resolve(node.id, new Set()))
  const perDepth: Record<number, number> = {}
  const positions: Record<string, { x: number; y: number }> = {}
  graph.nodes.forEach((node) => {
    const d = depth[node.id] ?? 0
    const row = perDepth[d] ?? 0
    perDepth[d] = row + 1
    positions[node.id] = { x: d * 260, y: row * 130 }
  })
  return positions
}

/** write/external 节点前必须经过 human_confirm（契约 ③）：沿入边回溯 */
function confirmIssues(graph: WorkflowGraph): Record<string, string> {
  const incoming = new Map<string, string[]>()
  graph.edges.forEach((edge) => incoming.set(edge.to, [...(incoming.get(edge.to) ?? []), edge.from]))
  const byId = Object.fromEntries(graph.nodes.map((node) => [node.id, node]))
  const hasConfirmUpstream = (id: string, seen = new Set<string>()): boolean => (incoming.get(id) ?? []).some((parent) => { if (seen.has(parent)) return false; seen.add(parent); return byId[parent]?.type === "human_confirm" || hasConfirmUpstream(parent, seen) })
  const issues: Record<string, string> = {}
  graph.nodes.forEach((node) => {
    if (node.side_effect === "write" && node.type !== "changeset" && !hasConfirmUpstream(node.id)) issues[node.id] = "write 节点前没有人工确认"
    if ((node.side_effect === "write" || node.side_effect === "external") && node.idempotency !== "key_required") issues[node.id] = "write/external 必须 key_required"
  })
  return issues
}

function KpNodeView({ data, selected }: NodeProps<KpNode>) {
  const { node, issue, missing } = data
  const Icon = typeIcon[node.type]
  return (
    <div className={cn("w-56 rounded-xl border bg-card px-3 py-2.5 text-card-foreground shadow-sm", selected && "ring-2 ring-foreground", issue && "border-status-critical")}>
      <Handle type="target" position={Position.Left} className="!size-2.5 !border-2 !border-background !bg-foreground" />
      <div className="flex items-center gap-2"><span className={cn("flex size-7 items-center justify-center rounded-lg", node.side_effect === "write" ? "bg-status-critical/10 text-status-critical" : node.side_effect === "external" ? "bg-status-warning/10 text-status-warning" : "bg-muted text-foreground")}><Icon className="size-4" /></span><div className="min-w-0 flex-1"><p className="truncate text-sm font-medium">{node.label}</p><p className="text-[11px] text-muted-foreground">{nodeTypeMeta[node.type].label} · {executorLabel[node.executor_identity]}</p></div></div>
      <div className="mt-2 flex flex-wrap items-center gap-1">
        <TypeChip className="text-[10px]">{sideEffectLabel[node.side_effect]}</TypeChip>
        {node.idempotency === "key_required" ? <TypeChip className="text-[10px]">幂等键</TypeChip> : null}
        {missing?.length ? <StatusChip tone="warning" className="text-[10px]">缺 {missing.join("/")}</StatusChip> : null}
      </div>
      {issue ? <p className="mt-1.5 flex items-center gap-1 text-[11px] text-status-critical"><IconAlertTriangle className="size-3" />{issue}</p> : null}
      <Handle type="source" position={Position.Right} className="!size-2.5 !border-2 !border-background !bg-foreground" />
    </div>
  )
}
const nodeTypes = { kp: KpNodeView }

function toFlow(graph: WorkflowGraph, missingByNode: Record<string, string[]>): { nodes: KpNode[]; edges: Edge[] } {
  const positions = layout(graph)
  const issues = confirmIssues(graph)
  return {
    nodes: graph.nodes.map((node) => ({ id: node.id, type: "kp" as const, position: positions[node.id], data: { node, issue: issues[node.id] ?? null, missing: missingByNode[node.id] ?? [] } })),
    edges: graph.edges.map((edge) => ({ id: `${edge.from}-${edge.to}`, source: edge.from, target: edge.to, label: edge.condition?.expr ?? undefined, markerEnd: { type: MarkerType.ArrowClosed }, style: { strokeWidth: 1.5 }, labelStyle: { fontSize: 10 }, labelBgPadding: [4, 2] as [number, number] })),
  }
}

function Canvas({ definitionId }: { definitionId: string }) {
  const version = isOk(graphFixture) ? graphFixture.data : null
  const defs = isOk(definitionsFixture) ? [...definitionsFixture.data.official, ...definitionsFixture.data.mine, ...definitionsFixture.data.team] : []
  const definition = defs.find((item) => item.id === definitionId) ?? null
  const isNew = definitionId === "new"
  const validation = isOk(validateFixture) ? validateFixture.data : null
  const missingByNode = useMemo(() => { const map: Record<string, string[]> = {}; validation?.missing_params.forEach((item) => { map[item.node_id] = [...(map[item.node_id] ?? []), item.param] }); return map }, [validation])
  const initial = useMemo(() => toFlow(isNew ? { version: "workflow-graph/v1", nodes: [], edges: [] } : version?.graph ?? { version: "workflow-graph/v1", nodes: [], edges: [] }, missingByNode), [isNew, version, missingByNode])
  const [nodes, setNodes, onNodesChange] = useNodesState<KpNode>(initial.nodes)
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>(initial.edges)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [editing, setEditing] = useState(isNew || version?.status !== "published")
  const [dialog, setDialog] = useState<"validate" | "simulate" | null>(null)
  const { screenToFlowPosition, fitView } = useReactFlow()
  useEffect(() => { const timer = setTimeout(() => fitView({ padding: 0.2 }), 50); return () => clearTimeout(timer) }, [fitView])

  const graph = useMemo<WorkflowGraph>(() => ({ version: "workflow-graph/v1", nodes: nodes.map((node) => node.data.node), edges: edges.map((edge) => ({ from: edge.source, to: edge.target, condition: typeof edge.label === "string" && edge.label ? { expr: edge.label } : null })) }), [nodes, edges])
  useEffect(() => {
    const issues = confirmIssues(graph)
    setNodes((prev) => {
      let changed = false
      const next = prev.map((node) => { const issue = issues[node.id] ?? null; if ((node.data.issue ?? null) === issue) return node; changed = true; return { ...node, data: { ...node.data, issue } } })
      return changed ? next : prev
    })
  }, [graph, setNodes])
  const selected = nodes.find((node) => node.id === selectedId) ?? null
  const localIssues = Object.keys(confirmIssues(graph)).length
  const canPublish = editing && validation?.canPublish === true && localIssues === 0

  const updateNode = useCallback((id: string, patch: Partial<GraphNode>) => setNodes((prev) => prev.map((node) => node.id === id ? { ...node, data: { ...node.data, node: { ...node.data.node, ...patch } } } : node)), [setNodes])
  const addNode = useCallback((type: NodeType, position: { x: number; y: number }) => {
    const id = `n${Date.now().toString(36)}`
    const meta = nodeTypeMeta[type]
    const node: GraphNode = { id, type, label: meta.label, params: {}, executor_identity: meta.executor, side_effect: meta.sideEffect, idempotency: meta.sideEffect === "read" ? "none" : "key_required", retry: { max: meta.sideEffect === "read" ? 2 : 1, backoff: "fixed", base_ms: 2000 }, timeout_ms: type === "human_confirm" ? 86400000 : 30000, permission_scope: [] }
    setNodes((prev) => [...prev, { id, type: "kp", position, data: { node, issue: null, missing: [] } }])
    setSelectedId(id)
  }, [setNodes])
  const onConnect = useCallback((connection: Connection) => setEdges((prev) => addEdge({ ...connection, markerEnd: { type: MarkerType.ArrowClosed }, style: { strokeWidth: 1.5 } }, prev)), [setEdges])
  const onDrop = useCallback((event: React.DragEvent) => { event.preventDefault(); const type = event.dataTransfer.getData("application/kp-node") as NodeType; if (!type || !editing) return; addNode(type, screenToFlowPosition({ x: event.clientX, y: event.clientY })) }, [addNode, editing, screenToFlowPosition])

  return (
    <div className="grid min-h-[640px] gap-3 @5xl/main:grid-cols-[200px_minmax(0,1fr)_300px]">
      <aside className="flex flex-col gap-2 rounded-xl border bg-card p-3">
        <p className="text-xs font-medium text-muted-foreground">节点库 · 十类{editing ? "（拖到画布）" : "（已发布只读）"}</p>
        {nodeTypeOrder.map((type) => { const Icon = typeIcon[type]; return <button key={type} type="button" draggable={editing} disabled={!editing} onDragStart={(event) => event.dataTransfer.setData("application/kp-node", type)} onClick={() => editing && addNode(type, { x: 120 + Math.random() * 200, y: 120 + Math.random() * 200 })} className="flex items-center gap-2 rounded-lg border px-2.5 py-2 text-left text-sm hover:bg-muted disabled:cursor-not-allowed disabled:opacity-60" title={nodeTypeMeta[type].hint}><Icon className="size-4" /><span className="flex-1">{nodeTypeMeta[type].label}</span><span className={cn("size-1.5 rounded-full", nodeTypeMeta[type].sideEffect === "write" ? "bg-status-critical" : nodeTypeMeta[type].sideEffect === "external" ? "bg-status-warning" : "bg-muted-foreground/40")} /></button> })}
        <p className="mt-2 text-[11px] text-muted-foreground">红点 = 写媒体，须 变更集 → 人工确认 → 执行；黄点 = 外部调用</p>
      </aside>
      <div className="relative min-h-[520px] overflow-hidden rounded-xl border bg-card" onDrop={onDrop} onDragOver={(event) => { event.preventDefault(); event.dataTransfer.dropEffect = "move" }}>
        <ReactFlow nodes={nodes} edges={edges} nodeTypes={nodeTypes} onNodesChange={onNodesChange} onEdgesChange={onEdgesChange} onConnect={onConnect} onNodeClick={(_, node) => setSelectedId(node.id)} onPaneClick={() => setSelectedId(null)} nodesDraggable={editing} nodesConnectable={editing} elementsSelectable fitView proOptions={{ hideAttribution: true }} deleteKeyCode={editing ? ["Backspace", "Delete"] : null} className="[&_.react-flow__edge-path]:stroke-foreground/50 [&_.react-flow__edge-textbg]:fill-card [&_.react-flow__edge-text]:fill-muted-foreground">
          <Background variant={BackgroundVariant.Dots} gap={20} size={1} className="!bg-card" />
          <Controls showInteractive={false} className="!rounded-lg !border !bg-card !shadow-sm [&>button]:!border-b [&>button]:!bg-card [&>button]:!fill-foreground" />
          <MiniMap pannable zoomable className="!rounded-lg !border !bg-card" maskColor="color-mix(in oklch, var(--muted) 70%, transparent)" nodeColor={(node) => ((node as KpNode).data?.node?.side_effect === "write" ? "var(--kp-status-critical)" : "var(--muted-foreground)")} />
        </ReactFlow>
        {nodes.length === 0 ? <div className="pointer-events-none absolute inset-0 flex items-center justify-center text-sm text-muted-foreground">从左侧拖一个「触发」开始</div> : null}
      </div>
      <aside className="flex flex-col gap-3 rounded-xl border bg-card p-3">
        {selected ? (
          <ScrollArea className="h-[600px] pr-2">
            <div className="flex flex-col gap-3">
              <div className="flex items-center justify-between"><p className="text-sm font-medium">节点属性</p>{editing ? <Button variant="ghost" size="icon-sm" aria-label="删除节点" onClick={() => { setNodes((prev) => prev.filter((node) => node.id !== selected.id)); setEdges((prev) => prev.filter((edge) => edge.source !== selected.id && edge.target !== selected.id)); setSelectedId(null) }}><IconTrash /></Button> : null}</div>
              <div className="grid gap-1.5"><Label>名称</Label><Input value={selected.data.node.label} disabled={!editing} onChange={(event) => updateNode(selected.id, { label: event.target.value })} /></div>
              <div className="grid gap-1.5"><Label>类型</Label><Select value={selected.data.node.type} disabled={!editing} onValueChange={(value) => updateNode(selected.id, { type: value as NodeType })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{nodeTypeOrder.map((type) => <SelectItem key={type} value={type}>{nodeTypeMeta[type].label}</SelectItem>)}</SelectContent></Select></div>
              <div className="grid gap-1.5"><Label>执行身份</Label><Select value={selected.data.node.executor_identity} disabled={!editing} onValueChange={(value) => updateNode(selected.id, { executor_identity: value as ExecutorIdentity })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{(Object.keys(executorLabel) as ExecutorIdentity[]).map((key) => <SelectItem key={key} value={key}>{executorLabel[key]}</SelectItem>)}</SelectContent></Select></div>
              <div className="grid gap-1.5"><Label>副作用</Label><Select value={selected.data.node.side_effect} disabled={!editing} onValueChange={(value) => updateNode(selected.id, { side_effect: value as SideEffect, idempotency: value === "read" ? selected.data.node.idempotency : "key_required" })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{(Object.keys(sideEffectLabel) as SideEffect[]).map((key) => <SelectItem key={key} value={key}>{sideEffectLabel[key]}</SelectItem>)}</SelectContent></Select></div>
              <div className="grid gap-1.5"><Label>幂等</Label><Select value={selected.data.node.idempotency} disabled={!editing || selected.data.node.side_effect !== "read"} onValueChange={(value) => updateNode(selected.id, { idempotency: value as GraphNode["idempotency"] })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="key_required">key_required</SelectItem><SelectItem value="none">none</SelectItem></SelectContent></Select></div>
              <div className="grid grid-cols-3 gap-2">
                <div className="grid gap-1.5"><Label>重试次数</Label><Input type="number" min={0} disabled={!editing} value={selected.data.node.retry.max} onChange={(event) => updateNode(selected.id, { retry: { ...selected.data.node.retry, max: Number(event.target.value) } })} /></div>
                <div className="grid gap-1.5"><Label>退避</Label><Select value={selected.data.node.retry.backoff} disabled={!editing} onValueChange={(value) => updateNode(selected.id, { retry: { ...selected.data.node.retry, backoff: value as "fixed" | "exponential" } })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="fixed">固定</SelectItem><SelectItem value="exponential">指数</SelectItem></SelectContent></Select></div>
                <div className="grid gap-1.5"><Label>基础 ms</Label><Input type="number" min={0} disabled={!editing} value={selected.data.node.retry.base_ms} onChange={(event) => updateNode(selected.id, { retry: { ...selected.data.node.retry, base_ms: Number(event.target.value) } })} /></div>
              </div>
              <div className="grid gap-1.5"><Label>超时 ms</Label><Input type="number" min={0} disabled={!editing} value={selected.data.node.timeout_ms} onChange={(event) => updateNode(selected.id, { timeout_ms: Number(event.target.value) })} /></div>
              <div className="grid gap-1.5"><Label>权限范围</Label><div className="flex flex-wrap gap-1">{selected.data.node.permission_scope.length ? selected.data.node.permission_scope.map((scope) => <TypeChip key={scope} className="font-mono text-[10px]">{scope}</TypeChip>) : <span className="text-xs text-muted-foreground">无（由 Registry 按类型冻结）</span>}</div></div>
              <div className="grid gap-1.5"><Label>参数</Label><pre className="max-h-40 overflow-auto rounded-lg bg-muted p-2 text-[11px]">{JSON.stringify(selected.data.node.params, null, 2)}</pre>{selected.data.missing?.length ? <p className="text-xs text-status-warning">缺参：{selected.data.missing.join("、")}</p> : null}</div>
            </div>
          </ScrollArea>
        ) : (
          <div className="flex flex-col gap-2 text-sm">
            <p className="font-medium">画布</p>
            <p className="text-xs text-muted-foreground">点节点看属性；拖节点连线；写媒体节点前必须有「人工确认」，否则标红。</p>
            <Separator />
            <dl className="grid grid-cols-2 gap-y-1 text-xs">
              <dt className="text-muted-foreground">节点</dt><dd className="text-right tabular-nums">{nodes.length}</dd>
              <dt className="text-muted-foreground">边</dt><dd className="text-right tabular-nums">{edges.length}</dd>
              <dt className="text-muted-foreground">本地红点</dt><dd className={cn("text-right tabular-nums", localIssues && "text-status-critical")}>{localIssues}</dd>
              <dt className="text-muted-foreground">缺参</dt><dd className="text-right tabular-nums">{validation?.missing_params.length ?? "−"}</dd>
            </dl>
            <Separator />
            <div className="relative rounded-lg border p-2"><ExampleBadge className="absolute top-1 right-1" /><p className="text-xs font-medium">Agent 帮编</p><p className="mt-1 text-[11px] text-muted-foreground">输入目标 → 出图草稿 + 缺参列表；应用后仍须校验（R-010b 后接入）</p><Input className="mt-2" placeholder="例：只处理快手账户" readOnly /></div>
          </div>
        )}
        <div className="mt-auto flex flex-col gap-2">
          {!editing ? <Button variant="outline" size="sm" onClick={() => { setEditing(true); toast("已建草稿 v" + ((version?.version ?? 0) + 1), { description: "已发布版本不可变；编辑落到新版本" }) }}>基于 v{version?.version ?? 1} 新建草稿</Button> : null}
          <Button variant="outline" size="sm" onClick={() => setDialog("validate")}>校验</Button>
          <Button variant="outline" size="sm" onClick={() => setDialog("simulate")}>模拟运行</Button>
          <Button size="sm" disabled={!canPublish} title={canPublish ? "" : "四组校验全过且缺参为空才可发布"} onClick={() => toast.success("已发布（不可变）", { description: "POST .../publish → status=published；运行固定版本" })}>发布</Button>
        </div>
      </aside>
      <Dialog open={dialog !== null} onOpenChange={(open) => { if (!open) setDialog(null) }}>
        <DialogContent className="sm:max-w-lg">
          {dialog === "validate" ? (
            <>
              <DialogHeader><DialogTitle>校验结果</DialogTitle><DialogDescription>POST /workflows/:id/versions/:v/validate · 四组全过且缺参为空才可发布</DialogDescription></DialogHeader>
              {validation ? (
                <div className="flex flex-col gap-3 text-sm">
                  {(["schema", "permissions", "links"] as const).map((group) => <div key={group}><p className="mb-1 text-xs font-medium text-muted-foreground">{group === "schema" ? "结构" : group === "permissions" ? "权限" : "连线"}</p><ul className="flex flex-col gap-1">{validation[group].map((item) => <li key={item.check} className="flex items-center gap-2">{item.pass ? <IconCircleCheck className="size-4 text-status-success" /> : <IconAlertTriangle className="size-4 text-status-critical" />}{item.check}{item.detail ? <span className="text-xs text-muted-foreground">{item.detail}</span> : null}</li>)}</ul></div>)}
                  <div><p className="mb-1 text-xs font-medium text-muted-foreground">缺参</p>{validation.missing_params.length ? <ul className="flex flex-col gap-1">{validation.missing_params.map((item) => <li key={`${item.node_id}-${item.param}`} className="flex items-center gap-2"><IconAlertTriangle className="size-4 text-status-warning" /><span className="font-mono text-xs">{item.node_id}</span>{item.param}{item.required ? <Badge variant="outline">必填</Badge> : null}</li>)}</ul> : <p className="text-xs text-muted-foreground">无</p>}</div>
                  {localIssues ? <p className="text-xs text-status-critical">画布本地还有 {localIssues} 个红点（write 前无人工确认 / 幂等键缺失）</p> : null}
                  <p className="text-xs">{validation.canPublish && !localIssues ? "可发布" : "不可发布"}</p>
                </div>
              ) : null}
            </>
          ) : (
            <>
              <DialogHeader><DialogTitle>模拟运行</DialogTitle><DialogDescription>POST .../simulate · 无副作用；write / external 节点只出预览不执行</DialogDescription></DialogHeader>
              {isOk(simulateFixture) ? <ol className="flex flex-col gap-2 text-sm">{simulateFixture.data.steps.map((step) => <li key={step.node_id} className="flex items-start gap-2"><StatusChip tone={step.status === "ok" ? "success" : step.status === "would_wait" ? "warning" : step.status === "error" ? "critical" : "muted"}>{step.status === "ok" ? "通过" : step.status === "would_wait" ? "会等待" : step.status === "error" ? "错误" : "跳过"}</StatusChip><span className="font-mono text-xs">{step.node_id}</span><span className="flex-1 text-xs text-muted-foreground">{typeof step.preview === "string" ? step.preview : JSON.stringify(step.preview)}</span></li>)}</ol> : null}
            </>
          )}
        </DialogContent>
      </Dialog>
      {definition || isNew ? null : <p className="@5xl/main:col-span-3 text-xs text-muted-foreground">定义 {definitionId} 不在 fixture 里；画布显示 graph-v1 样例（新任务开户到基建）。</p>}
    </div>
  )
}

export function WorkflowCanvasPage({ definitionId }: { definitionId: string }) {
  const { isMock } = useSession()
  const state = usePageState()
  const version = isOk(graphFixture) ? graphFixture.data : null
  const defs = isOk(definitionsFixture) ? [...definitionsFixture.data.official, ...definitionsFixture.data.mine, ...definitionsFixture.data.team] : []
  const definition = defs.find((item) => item.id === definitionId) ?? null
  const isNew = definitionId === "new"
  return (
    <PageBody>
      <PageHeader title={<span className="flex items-center gap-2">{isNew ? "新建工作流" : definition?.name ?? "工作流画布"}{!isNew && version ? <StatusChip tone={version.status === "published" ? "success" : "pending"}>{version.status === "published" ? `v${version.version} 已发布` : `v${version.version} 草稿`}</StatusChip> : null}</span>} description={isNew ? "从空白画布开始；也可以回官方模板复制" : definition?.description ?? "workflow-graph/v1"} isMock={isMock} actions={<><StateSwitch /><Button asChild variant="outline" size="sm"><Link href="/automation"><IconArrowLeft />自动化</Link></Button></>} />
      <div className="px-4 lg:px-6">
        <StateFrame state={state} unlock="R-014 工作流画布接口（graph / validate / simulate / publish）接入后切换为真数据" empty={{ title: "没有这个工作流", description: "回自动化页从模板创建。" }}>
          <ReactFlowProvider><Canvas definitionId={definitionId} /></ReactFlowProvider>
        </StateFrame>
      </div>
    </PageBody>
  )
}
