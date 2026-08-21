import * as React from "react";
import {
  Activity,
  ArrowDownToLine,
  Bot,
  CalendarDays,
  Check,
  ChevronDown,
  CircleAlert,
  CircleGauge,
  Clock3,
  MoreHorizontal,
  Search,
  SlidersHorizontal,
  Sparkles,
  Target,
  WalletCards,
  X,
} from "lucide-react";

import { cn } from "@/lib/utils";
import { kpis, viewLabels } from "@/topbar/shadcn-dashboard/demo-data";

import { Avatar, AvatarFallback, AvatarImage } from "./coss-ui/avatar";
import { Badge } from "./coss-ui/badge";
import { Button } from "./coss-ui/button";
import {
  Card,
  CardAction,
  CardDescription,
  CardHeader,
  CardPanel,
  CardTitle,
} from "./coss-ui/card";
import { Input } from "./coss-ui/input";
import {
  segmentedControlItemVariants,
  segmentedControlRootClassName,
} from "./coss-ui/segmented-control";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "./coss-ui/table";
import { TrendChart } from "./trend-chart";

type DashboardView = keyof typeof kpis;

const navItems = ["工作台", "投放任务", "数据分析", "账户池"];
const moreItems = ["自动化", "商品素材", "报告", "知识库", "集成与通知"];
const roleItems: DashboardView[] = ["optimizer", "ka", "executive"];

const metricIcons = [WalletCards, CircleGauge, Target, CircleAlert];

const taskRows = [
  {
    task: "AAC 拉新",
    biz: "CVR",
    metric: "newaac_uv_attrib_install",
    result: "CPA ¥36.20",
    status: "成本达标",
    tone: "success" as const,
    updatedAt: "10:42",
  },
  {
    task: "闲鱼唤端召回",
    biz: "WAKE",
    metric: "wake_uv",
    result: "2,840",
    status: "正常",
    tone: "secondary" as const,
    updatedAt: "10:38",
  },
  {
    task: "闲鱼潜客转化",
    biz: "AAC",
    metric: "aac_ptt_uv",
    result: "612",
    status: "待复核",
    tone: "warning" as const,
    updatedAt: "10:35",
  },
  {
    task: "新建广告存活检查",
    biz: "PLAN",
    metric: "24h 零消耗",
    result: "1 条",
    status: "P0 待处理",
    tone: "error" as const,
    updatedAt: "10:31",
  },
  {
    task: "主力广告依赖排查",
    biz: "STRUCTURE",
    metric: "main_ad_cost_proportion",
    result: "78%",
    status: "需调整",
    tone: "warning" as const,
    updatedAt: "10:27",
  },
];

const attentionItems = [
  {
    title: "新建广告 24h 零消耗",
    meta: "1 个计划 · 最后检查 10:31",
    badge: "P0",
    tone: "error" as const,
  },
  {
    title: "AAC 潜客链路待复核",
    meta: "aac_ptt_uv · 数据链路",
    badge: "待复核",
    tone: "warning" as const,
  },
  {
    title: "主力广告消耗集中",
    meta: "结构风险 · 集中度 78%",
    badge: "需调整",
    tone: "secondary" as const,
  },
];

function HeaderMenu({
  open,
  className,
  children,
}: {
  open: boolean;
  className?: string;
  children: React.ReactNode;
}) {
  if (!open) return null;
  return (
    <div
      className={cn(
        "absolute top-[calc(100%+8px)] z-50 min-w-48 rounded-xl border bg-popover p-1.5 text-popover-foreground shadow-xl/10",
        className,
      )}
      role="menu"
    >
      {children}
    </div>
  );
}

function MenuItem({
  active,
  children,
  onClick,
}: {
  active?: boolean;
  children: React.ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      className="flex w-full items-center justify-between gap-3 rounded-lg px-3 py-2 text-left text-sm hover:bg-accent focus-visible:outline-2 focus-visible:outline-ring"
      onClick={onClick}
      role="menuitem"
      type="button"
    >
      {children}
      {active ? <Check className="size-4" /> : null}
    </button>
  );
}

function MetricCard({
  index,
  label,
  value,
  change,
}: {
  index: number;
  label: string;
  value: string;
  change: string;
}) {
  const Icon = metricIcons[index];
  return (
    <Card>
      <CardHeader className="gap-3 p-5 pb-3">
        <CardTitle className="font-sans text-sm font-medium text-muted-foreground">
          {label}
        </CardTitle>
        <CardAction>
          <span className="flex size-8 items-center justify-center rounded-lg bg-muted text-muted-foreground">
            <Icon className="size-4" />
          </span>
        </CardAction>
      </CardHeader>
      <CardPanel className="p-5 pt-0">
        <div className="font-heading text-3xl font-semibold tracking-tight tabular-nums">
          {value}
        </div>
        <p className="mt-2 text-sm text-muted-foreground">{change}</p>
      </CardPanel>
    </Card>
  );
}

export function CossDashboard() {
  const [activeNav, setActiveNav] = React.useState("工作台");
  const [view, setView] = React.useState<DashboardView>("optimizer");
  const [query, setQuery] = React.useState("");
  const [roleOpen, setRoleOpen] = React.useState(false);
  const [moreOpen, setMoreOpen] = React.useState(false);
  const [userOpen, setUserOpen] = React.useState(false);
  const [agentOpen, setAgentOpen] = React.useState(false);

  const filteredTasks = taskRows.filter((row) =>
    [row.task, row.biz, row.metric, row.status]
      .join(" ")
      .toLocaleLowerCase("zh-CN")
      .includes(query.trim().toLocaleLowerCase("zh-CN")),
  );

  return (
    <div className="min-h-screen bg-muted/30">
      <header className="sticky top-0 z-40 border-b bg-background/96 backdrop-blur">
        <div className="flex h-16 min-w-[1180px] items-center gap-4 px-5">
          <div className="relative">
            <Button
              aria-expanded={roleOpen}
              aria-haspopup="menu"
              className="min-w-40 justify-between"
              onClick={() => {
                setRoleOpen((value) => !value);
                setMoreOpen(false);
                setUserOpen(false);
              }}
              variant="outline"
            >
              <span className="flex items-center gap-2">
                <span
                  aria-hidden="true"
                  className="flex size-5 items-center justify-center rounded-md bg-primary text-[10px] font-bold text-primary-foreground"
                >
                  KA
                </span>
                KA Pilot
              </span>
              <ChevronDown className="size-4" />
            </Button>
            <HeaderMenu open={roleOpen}>
              <p className="px-3 py-2 text-xs font-medium text-muted-foreground">
                工作视图
              </p>
              {roleItems.map((item) => (
                <MenuItem
                  active={view === item}
                  key={item}
                  onClick={() => {
                    setView(item);
                    setRoleOpen(false);
                  }}
                >
                  {viewLabels[item]}
                </MenuItem>
              ))}
            </HeaderMenu>
          </div>

          <nav aria-label="COSS 产品导航">
            <div className={segmentedControlRootClassName}>
              {navItems.map((item) => (
                <a
                  aria-current={activeNav === item ? "page" : undefined}
                  className={segmentedControlItemVariants({ state: "current" })}
                  href={`#${item}`}
                  key={item}
                  onClick={(event) => {
                    event.preventDefault();
                    setActiveNav(item);
                  }}
                >
                  {item}
                </a>
              ))}
            </div>
          </nav>

          <div className="relative">
            <Button
              aria-expanded={moreOpen}
              aria-haspopup="menu"
              onClick={() => {
                setMoreOpen((value) => !value);
                setRoleOpen(false);
                setUserOpen(false);
              }}
              variant="ghost"
            >
              更多
              <ChevronDown className="size-4" />
            </Button>
            <HeaderMenu open={moreOpen}>
              {moreItems.map((item) => (
                <MenuItem
                  key={item}
                  onClick={() => {
                    setActiveNav(item);
                    setMoreOpen(false);
                  }}
                >
                  {item}
                </MenuItem>
              ))}
            </HeaderMenu>
          </div>

          <div className="ml-auto flex items-center gap-2">
            <div className="relative w-[280px]">
              <Search className="pointer-events-none absolute top-1/2 left-3 z-10 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                aria-label="搜索任务与指标"
                className="pl-9"
                onChange={(event) => setQuery(event.target.value)}
                onFocus={() => {
                  setRoleOpen(false);
                  setMoreOpen(false);
                  setUserOpen(false);
                }}
                placeholder="搜索任务、biz 或指标..."
                type="search"
                value={query}
              />
            </div>
            <Button onClick={() => setAgentOpen(true)}>
              <Bot />
              投放 Agent
            </Button>
            <div className="relative">
              <Button
                aria-expanded={userOpen}
                aria-haspopup="menu"
                onClick={() => {
                  setUserOpen((value) => !value);
                  setMoreOpen(false);
                  setRoleOpen(false);
                }}
                size="icon"
                variant="ghost"
              >
                <Avatar className="size-7">
                  <AvatarImage
                    alt="快手优化师"
                    src="/avatars/shadcn-morty-official.jpg"
                  />
                  <AvatarFallback>KS</AvatarFallback>
                </Avatar>
              </Button>
              <HeaderMenu className="right-0" open={userOpen}>
                <div className="border-b px-3 py-2.5">
                  <p className="font-medium text-sm">快手优化师</p>
                  <p className="text-xs text-muted-foreground">
                    demo@ka-pilot.local
                  </p>
                </div>
                {["账户", "设置", "退出登录"].map((item) => (
                  <MenuItem key={item} onClick={() => setUserOpen(false)}>
                    {item}
                  </MenuItem>
                ))}
              </HeaderMenu>
            </div>
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-[1600px] px-6 py-6">
        <div className="mb-6 flex items-end justify-between gap-4">
          <div>
            <div className="mb-2 flex items-center gap-2">
              <Badge variant="outline">COSS 产品版</Badge>
              <Badge variant="success">数据同步正常</Badge>
            </div>
            <h1 className="font-heading text-3xl font-semibold tracking-tight">
              投放经营工作台
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              当前视图：{viewLabels[view]} · 页面数据均为脱敏演示数据
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline">
              <CalendarDays />
              2026-08-01 至 2026-08-21
            </Button>
            <Button variant="outline">
              <ArrowDownToLine />
              导出
            </Button>
          </div>
        </div>

        <section aria-label="经营核心指标" className="grid grid-cols-4 gap-4">
          {kpis[view].map((metric, index) => (
            <MetricCard index={index} key={metric.label} {...metric} />
          ))}
        </section>

        <section className="mt-4 grid grid-cols-12 gap-4">
          <Card className="col-span-8">
            <CardHeader className="border-b p-5">
              <CardTitle className="font-sans text-base">
                消耗与真实 CPA
              </CardTitle>
              <CardDescription>近 14 日双轴趋势</CardDescription>
              <CardAction>
                <div className="flex items-center gap-4 text-xs text-muted-foreground">
                  <span className="flex items-center gap-1.5">
                    <i className="size-2 rounded-full bg-foreground" />
                    消耗
                  </span>
                  <span className="flex items-center gap-1.5">
                    <i className="size-2 rounded-full bg-success" />
                    真实 CPA
                  </span>
                </div>
              </CardAction>
            </CardHeader>
            <CardPanel className="p-5 pb-3">
              <TrendChart />
            </CardPanel>
          </Card>

          <Card className="col-span-4">
            <CardHeader className="border-b p-5">
              <CardTitle className="font-sans text-base">今日需处理</CardTitle>
              <CardDescription>按优先级与更新时间排序</CardDescription>
              <CardAction>
                <Button size="icon-sm" variant="ghost">
                  <MoreHorizontal />
                </Button>
              </CardAction>
            </CardHeader>
            <CardPanel className="divide-y p-0">
              {attentionItems.map((item) => (
                <div
                  className="flex items-start gap-3 px-5 py-4"
                  key={item.title}
                >
                  <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
                    <Activity className="size-4" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{item.title}</p>
                    <p className="mt-1 truncate text-xs text-muted-foreground">
                      {item.meta}
                    </p>
                  </div>
                  <Badge variant={item.tone}>{item.badge}</Badge>
                </div>
              ))}
            </CardPanel>
          </Card>
        </section>

        <Card className="mt-4">
          <CardHeader className="border-b p-5">
            <CardTitle className="font-sans text-base">投放任务</CardTitle>
            <CardDescription>
              AAC、唤端、潜客链路与异常任务脱敏样例
            </CardDescription>
            <CardAction>
              <Button variant="outline">
                <SlidersHorizontal />
                筛选
              </Button>
            </CardAction>
          </CardHeader>
          <CardPanel className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>任务</TableHead>
                  <TableHead>biz</TableHead>
                  <TableHead>主指标 / 诊断字段</TableHead>
                  <TableHead>当前值</TableHead>
                  <TableHead>状态</TableHead>
                  <TableHead className="text-right">更新时间</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredTasks.map((row) => (
                  <TableRow key={row.task}>
                    <TableCell className="font-medium">{row.task}</TableCell>
                    <TableCell>
                      <code className="rounded bg-muted px-1.5 py-1 text-xs">
                        {row.biz}
                      </code>
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {row.metric}
                    </TableCell>
                    <TableCell className="font-medium tabular-nums">
                      {row.result}
                    </TableCell>
                    <TableCell>
                      <Badge variant={row.tone}>{row.status}</Badge>
                    </TableCell>
                    <TableCell className="text-right text-muted-foreground tabular-nums">
                      {row.updatedAt}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            {filteredTasks.length === 0 ? (
              <div className="flex h-28 items-center justify-center text-sm text-muted-foreground">
                没有匹配的脱敏任务
              </div>
            ) : null}
          </CardPanel>
        </Card>
      </main>

      {agentOpen ? (
        <div className="fixed inset-0 z-50 bg-black/16" role="presentation">
          <aside
            aria-label="投放 Agent 面板"
            className="absolute inset-y-0 right-0 w-[420px] border-l bg-background p-5 shadow-2xl/15"
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="flex size-9 items-center justify-center rounded-xl bg-primary text-primary-foreground">
                  <Sparkles className="size-4" />
                </span>
                <div>
                  <h2 className="font-heading font-semibold">投放 Agent</h2>
                  <p className="text-xs text-muted-foreground">当前视图诊断</p>
                </div>
              </div>
              <Button
                aria-label="关闭投放 Agent"
                onClick={() => setAgentOpen(false)}
                size="icon"
                variant="ghost"
              >
                <X />
              </Button>
            </div>
            <Card className="mt-6">
              <CardPanel className="p-4 text-sm leading-6">
                真实 CPA 仍低于考核价 ¥2.80。建议先处理新建广告 24h
                零消耗，再复核 AAC 潜客链路。Demo 不执行媒体写操作。
              </CardPanel>
            </Card>
            <div className="mt-4 flex items-center gap-2 text-xs text-muted-foreground">
              <Clock3 className="size-3.5" />
              使用 10:42 已同步的脱敏数据
            </div>
          </aside>
        </div>
      ) : null}
    </div>
  );
}
