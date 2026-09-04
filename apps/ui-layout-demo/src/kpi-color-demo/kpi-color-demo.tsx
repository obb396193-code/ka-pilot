import { useId, useState } from "react";
import {
  ArrowDownRight,
  ArrowUpRight,
  CircleHelp,
  Clock3,
  ShieldAlert,
} from "lucide-react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip as RechartsTooltip,
  XAxis,
} from "recharts";

import { Badge } from "@/sidebar/shadcn-dashboard/ui/badge";
import { Button } from "@/sidebar/shadcn-dashboard/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/sidebar/shadcn-dashboard/ui/card";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/sidebar/shadcn-dashboard/ui/tooltip";

type ColorMode = "neutral" | "balanced" | "vivid";

const modes: Array<{
  id: ColorMode;
  label: string;
  description: string;
}> = [
  {
    id: "neutral",
    label: "A 中性原版",
    description: "纯黑白灰，作为 shadcn 基线",
  },
  {
    id: "balanced",
    label: "B 克制业务色",
    description: "颜色只承担指标和状态语义",
  },
  {
    id: "vivid",
    label: "C 驾驶舱色",
    description: "色彩更突出，适合远距离扫视",
  },
];

const spendTrend = [
  { day: "周五", amount: 92 },
  { day: "周六", amount: 105 },
  { day: "周日", amount: 99 },
  { day: "周一", amount: 114 },
  { day: "周二", amount: 108 },
  { day: "周三", amount: 121 },
  { day: "今天", amount: 128 },
];

function MetricLabel({ children, help }: { children: string; help: string }) {
  return (
    <div className="metric-label">
      <span>{children}</span>
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            className="metric-help"
            type="button"
            aria-label={`${children}说明`}
          >
            <CircleHelp aria-hidden="true" />
          </button>
        </TooltipTrigger>
        <TooltipContent sideOffset={6}>{help}</TooltipContent>
      </Tooltip>
    </div>
  );
}

function TrendBadge({
  direction,
  children,
}: {
  direction: "up" | "down";
  children: string;
}) {
  const Icon = direction === "up" ? ArrowUpRight : ArrowDownRight;

  return (
    <Badge className={`trend-badge trend-${direction}`} variant="outline">
      <Icon aria-hidden="true" />
      {children}
    </Badge>
  );
}

function SpendCard() {
  const gradientId = useId().replaceAll(":", "");

  return (
    <Card className="metric-card metric-card-primary" data-tone="brand">
      <CardHeader className="metric-card-header">
        <div>
          <MetricLabel help="今日 00:00 至当前时刻的媒体账面消耗。">
            今日消耗
          </MetricLabel>
          <CardTitle className="metric-value metric-value-primary">
            ¥128,430
          </CardTitle>
        </div>
        <TrendBadge direction="up">8.6%</TrendBadge>
      </CardHeader>
      <CardContent className="spend-card-content">
        <div className="spark-summary">
          <span className="summary-strong">近 7 日消耗趋势</span>
          <span className="summary-muted">预算节奏 91%</span>
        </div>
        <div
          className="spark-chart"
          aria-label="近七日消耗由九万二增长至十二万八"
        >
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart
              data={spendTrend}
              margin={{ top: 8, right: 2, bottom: 0, left: 2 }}
            >
              <defs>
                <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                  <stop
                    offset="0%"
                    stopColor="var(--tone)"
                    stopOpacity={0.34}
                  />
                  <stop
                    offset="100%"
                    stopColor="var(--tone)"
                    stopOpacity={0.02}
                  />
                </linearGradient>
              </defs>
              <CartesianGrid
                vertical={false}
                stroke="var(--grid-line)"
                strokeDasharray="3 4"
              />
              <XAxis
                axisLine={false}
                dataKey="day"
                interval={0}
                minTickGap={0}
                padding={{ left: 12, right: 12 }}
                tick={{ fill: "var(--muted-copy)", fontSize: 11 }}
                tickLine={false}
                tickMargin={10}
              />
              <RechartsTooltip
                cursor={{ stroke: "var(--tone)", strokeOpacity: 0.25 }}
                content={({ active, payload, label }) =>
                  active && payload?.length ? (
                    <div className="chart-tooltip">
                      <span>{label}</span>
                      <strong>¥{payload[0].value}k</strong>
                    </div>
                  ) : null
                }
              />
              <Area
                dataKey="amount"
                fill={`url(#${gradientId})`}
                stroke="var(--tone)"
                strokeWidth={2.5}
                type="monotone"
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
}

function ConversionCard() {
  return (
    <Card className="metric-card compact-card" data-tone="success">
      <CardHeader className="compact-header">
        <MetricLabel help="已完成后端数据回收并去重的真实转化数。">
          真实转化
        </MetricLabel>
        <TrendBadge direction="down">3.2%</TrendBadge>
      </CardHeader>
      <CardContent className="compact-content">
        <CardTitle className="metric-value">1,284</CardTitle>
        <div className="comparison-block">
          <div className="comparison-row">
            <span>目标进度</span>
            <strong>92%</strong>
          </div>
          <div className="thin-progress" aria-label="转化目标完成百分之九十二">
            <span style={{ width: "92%" }} />
          </div>
          <p>
            <ShieldAlert aria-hidden="true" />3 个账户需检查波动
          </p>
        </div>
      </CardContent>
    </Card>
  );
}

function AccountCard() {
  return (
    <Card className="metric-card compact-card" data-tone="warning">
      <CardHeader className="compact-header">
        <MetricLabel help="今天产生有效消耗的账户数量。">活跃账户</MetricLabel>
        <TrendBadge direction="up">+4</TrendBadge>
      </CardHeader>
      <CardContent className="compact-content">
        <CardTitle className="metric-value">68</CardTitle>
        <div className="account-status">
          <div
            className="status-track"
            aria-label="正常五十二个，观察十个，异常六个"
          >
            <span className="status-ok" style={{ width: "76.5%" }} />
            <span className="status-watch" style={{ width: "14.7%" }} />
            <span className="status-risk" style={{ width: "8.8%" }} />
          </div>
          <div className="status-legend">
            <span>
              <i className="status-ok" />
              正常 52
            </span>
            <span>
              <i className="status-watch" />
              观察 10
            </span>
            <span>
              <i className="status-risk" />
              异常 6
            </span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function CostCard() {
  return (
    <Card className="metric-card cost-card" data-tone="success">
      <CardContent className="cost-card-content">
        <div className="cost-leading">
          <MetricLabel help="当前真实成本相对于任务考核线的达成情况。">
            成本达成率
          </MetricLabel>
          <div className="cost-value-row">
            <CardTitle className="metric-value">96.4%</CardTitle>
            <TrendBadge direction="up">1.8%</TrendBadge>
          </div>
        </div>
        <div className="cost-progress-wrap">
          <div className="cost-meta">
            <span>
              <b>当前 CPA</b> ¥42.60
            </span>
            <span>
              <b>演示考核线</b> ¥44.20
            </span>
          </div>
          <div className="marker-track" aria-label="当前成本位于考核线以内">
            <span className="marker-fill" style={{ width: "72%" }} />
            <i className="marker-target" style={{ left: "79%" }} />
          </div>
          <div className="marker-caption">
            <span>成本更优</span>
            <span>考核线</span>
            <span>需处理</span>
          </div>
        </div>
        <div className="cost-note">
          <Clock3 aria-hidden="true" />
          <span>数据更新于 10:32</span>
        </div>
      </CardContent>
    </Card>
  );
}

export function KpiColorDemo() {
  const [mode, setMode] = useState<ColorMode>("balanced");
  const activeMode = modes.find((item) => item.id === mode)!;

  return (
    <TooltipProvider>
      <main
        className="kpi-color-demo"
        data-color-mode={mode}
        data-testid="kpi-color-demo"
      >
        <div className="demo-shell">
          <header className="demo-header">
            <div>
              <Badge className="demo-kicker" variant="outline">
                KPI COLOR STUDY
              </Badge>
              <h1>投放总览 · 指标卡配色对比</h1>
              <p>同一套 shadcn 骨架，只改变颜色参与信息表达的程度。</p>
            </div>
            <div className="demo-note">
              <span>页面数据均为脱敏演示数据</span>
              <strong>{activeMode.description}</strong>
            </div>
          </header>

          <div
            className="mode-switch"
            role="group"
            aria-label="KPI 卡片配色方案"
          >
            {modes.map((item) => (
              <Button
                aria-pressed={mode === item.id}
                className="mode-button"
                key={item.id}
                onClick={() => setMode(item.id)}
                size="sm"
                variant={mode === item.id ? "default" : "outline"}
              >
                {item.label}
              </Button>
            ))}
          </div>

          <section className="metric-grid" aria-label="投放核心指标">
            <SpendCard />
            <ConversionCard />
            <AccountCard />
            <CostCard />
          </section>

          <footer className="demo-footer">
            <span>
              结构来源：shadcn Card / Badge / Tooltip + Tremor KPI / Data Bars
              模式
            </span>
            <span>此页面为独立选型 Demo，不影响现有侧栏版</span>
          </footer>
        </div>
      </main>
    </TooltipProvider>
  );
}
