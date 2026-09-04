import { useState } from "react";
import { ArrowDownRight, ArrowUpRight, Info } from "lucide-react";

import { Badge } from "@/sidebar/shadcn-dashboard/ui/badge";
import { Button } from "@/sidebar/shadcn-dashboard/ui/button";
import { SectionCards } from "@/sidebar/shadcn-dashboard/section-cards";

import { Card } from "./tremor/Card";
import { CategoryBar } from "./tremor/CategoryBar";
import { SparkAreaChart } from "./tremor/SparkChart";
import { Tracker, type TrackerBlockProps } from "./tremor/Tracker";

type ComponentMode = "shadcn" | "tremor-block" | "tremor-matched";

const modes: Array<{
  id: ComponentMode;
  label: string;
  title: string;
  description: string;
}> = [
  {
    id: "shadcn",
    label: "A 当前 shadcn",
    title: "当前官方 SectionCards",
    description: "四张卡结构完全一致，视觉统一，但指标语义区分较弱。",
  },
  {
    id: "tremor-block",
    label: "B Tremor KPI Block",
    title: "Tremor 官方 KPI Block 结构",
    description: "直接采用 kpi-card-14 模式，每项指标都附带迷你趋势图。",
  },
  {
    id: "tremor-matched",
    label: "C Tremor 功能组合",
    title: "每种指标使用不同的数据组件",
    description: "趋势、组成、状态和考核线分别使用最合适的官方组件。",
  },
];

const trendData = [
  { date: "08-10", 消耗: 101, 转化: 1328, 账户: 58, 达成率: 91.2 },
  { date: "08-11", 消耗: 108, 转化: 1315, 账户: 60, 达成率: 92.1 },
  { date: "08-12", 消耗: 104, 转化: 1309, 账户: 61, 达成率: 92.8 },
  { date: "08-13", 消耗: 115, 转化: 1304, 账户: 62, 达成率: 93.4 },
  { date: "08-14", 消耗: 111, 转化: 1299, 账户: 64, 达成率: 94.1 },
  { date: "08-15", 消耗: 120, 转化: 1293, 账户: 65, 达成率: 94.8 },
  { date: "今天", 消耗: 128, 转化: 1284, 账户: 68, 达成率: 96.4 },
];

const summary = [
  {
    name: "今日消耗",
    key: "消耗",
    value: "¥128,430",
    change: "+8.6%",
    period: "较昨日",
    changeType: "positive",
    color: "blue" as const,
  },
  {
    name: "真实转化",
    key: "转化",
    value: "1,284",
    change: "-3.2%",
    period: "较昨日",
    changeType: "negative",
    color: "red" as const,
  },
  {
    name: "活跃账户",
    key: "账户",
    value: "68",
    change: "+4",
    period: "今日新增",
    changeType: "positive",
    color: "emerald" as const,
  },
  {
    name: "成本达成率",
    key: "达成率",
    value: "96.4%",
    change: "+1.8%",
    period: "较昨日",
    changeType: "positive",
    color: "emerald" as const,
  },
];

const accountTracker: TrackerBlockProps[] = [
  ...Array.from({ length: 52 }, (_, index) => ({
    key: `normal-${index}`,
    color: "bg-emerald-500 dark:bg-emerald-500",
    tooltip: `正常账户 ${index + 1}`,
  })),
  ...Array.from({ length: 10 }, (_, index) => ({
    key: `watch-${index}`,
    color: "bg-amber-500 dark:bg-amber-500",
    tooltip: `观察账户 ${index + 1}`,
  })),
  ...Array.from({ length: 6 }, (_, index) => ({
    key: `risk-${index}`,
    color: "bg-red-500 dark:bg-red-500",
    tooltip: `异常账户 ${index + 1}`,
  })),
];

function CurrentShadcn() {
  return (
    <div className="component-stage baseline-stage">
      <div className="stage-label">
        <strong>当前官方 SectionCards</strong>
        <span>原页面组件直接渲染，没有改结构</span>
      </div>
      <div className="@container/main baseline-cards">
        <SectionCards />
      </div>
    </div>
  );
}

function TremorBlock() {
  return (
    <div className="component-stage" data-variant="tremor-spark-grid">
      <div className="stage-label">
        <strong>Tremor `kpi-card-14` 结构</strong>
        <span>Card + SparkAreaChart，每张卡保持一致结构</span>
      </div>
      <dl className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
        {summary.map((item) => (
          <Card key={item.name} className="tremor-kpi-card">
            <dt className="text-sm font-medium text-gray-900 dark:text-gray-50">
              {item.name}
            </dt>
            <div className="mt-2 flex items-baseline justify-between gap-3">
              <dd className="text-2xl font-semibold tracking-tight text-gray-900 tabular-nums dark:text-gray-50">
                {item.value}
              </dd>
              <dd className="flex items-center gap-1 text-sm">
                <span
                  className={
                    item.changeType === "positive"
                      ? "font-medium text-emerald-700 dark:text-emerald-500"
                      : "font-medium text-red-700 dark:text-red-500"
                  }
                >
                  {item.changeType === "positive" ? (
                    <ArrowUpRight aria-hidden="true" />
                  ) : (
                    <ArrowDownRight aria-hidden="true" />
                  )}
                  {item.change}
                </span>
              </dd>
            </div>
            <SparkAreaChart
              autoMinValue
              className="mt-6 h-16 w-full"
              colors={[item.color]}
              data={trendData}
              fill="gradient"
              index="date"
              categories={[item.key]}
            />
            <dd className="mt-3 flex items-center justify-between text-xs text-gray-500 dark:text-gray-500">
              <span>近 7 日</span>
              <span>{item.period}</span>
            </dd>
          </Card>
        ))}
      </dl>
    </div>
  );
}

function LegendDot({
  className,
  children,
}: {
  className: string;
  children: string;
}) {
  return (
    <span className="matched-legend-item">
      <i className={className} aria-hidden="true" />
      {children}
    </span>
  );
}

function TremorMatched() {
  return (
    <div className="component-stage" data-variant="tremor-matched-grid">
      <div className="stage-label">
        <strong>每种指标使用不同的数据组件</strong>
        <span>SparkAreaChart / CategoryBar / Tracker / Marker</span>
      </div>
      <div className="matched-grid">
        <Card className="matched-card matched-spend">
          <div className="matched-heading">
            <div>
              <p>今日消耗</p>
              <strong>¥128,430</strong>
            </div>
            <Badge className="matched-delta" variant="outline">
              <ArrowUpRight aria-hidden="true" />
              8.6%
            </Badge>
          </div>
          <SparkAreaChart
            autoMinValue
            className="mt-7 h-24 w-full"
            colors={["blue"]}
            data={trendData}
            fill="gradient"
            index="date"
            categories={["消耗"]}
          />
          <div className="matched-foot">
            <span>近 7 日趋势</span>
            <span>预算节奏 91%</span>
          </div>
        </Card>

        <Card className="matched-card">
          <div className="matched-heading">
            <div>
              <p>真实转化</p>
              <strong>1,284</strong>
            </div>
          </div>
          <CategoryBar
            className="mt-8"
            colors={["emerald", "lightGray"]}
            showLabels={false}
            values={[1284, 96]}
          />
          <div className="matched-legend">
            <LegendDot className="bg-emerald-500" children="有效 1,284" />
            <LegendDot className="bg-gray-300" children="待核 96" />
          </div>
        </Card>

        <Card className="matched-card">
          <div className="matched-heading">
            <div>
              <p>活跃账户</p>
              <strong>68</strong>
            </div>
          </div>
          <Tracker className="mt-7 h-7" data={accountTracker} hoverEffect />
          <div className="matched-legend matched-legend-three">
            <LegendDot className="bg-emerald-500" children="正常 52" />
            <LegendDot className="bg-amber-500" children="观察 10" />
            <LegendDot className="bg-red-500" children="异常 6" />
          </div>
        </Card>

        <Card className="matched-card matched-cost">
          <div className="matched-heading matched-heading-horizontal">
            <div>
              <p>成本达成率</p>
              <strong>96.4%</strong>
            </div>
            <div className="matched-cost-meta">
              <span>
                当前 CPA <b>¥42.60</b>
              </span>
              <span>
                演示考核线 <b>¥44.20</b>
              </span>
            </div>
          </div>
          <CategoryBar
            className="mt-6"
            colors={["emerald", "amber", "red"]}
            marker={{ value: 72, tooltip: "当前 CPA ¥42.60" }}
            showLabels={false}
            values={[78, 7, 15]}
          />
          <div className="matched-foot">
            <span>成本更优</span>
            <span>接近考核线</span>
            <span>需要处理</span>
          </div>
        </Card>
      </div>
    </div>
  );
}

export function KpiComponentDemo() {
  const [mode, setMode] = useState<ComponentMode>("tremor-block");
  const active = modes.find((item) => item.id === mode)!;

  return (
    <main
      className="kpi-component-demo"
      data-component-mode={mode}
      data-testid="kpi-component-demo"
    >
      <div className="component-demo-shell">
        <header className="component-demo-header">
          <div>
            <Badge variant="outline">COMPONENT REPLACEMENT STUDY</Badge>
            <h1>KPI 区域 · 直接换组件对比</h1>
            <p>不是换颜色：同一批脱敏数据，比较三套真实组件结构。</p>
          </div>
          <div className="component-source-note">
            <Info aria-hidden="true" />
            <span>方案 B/C 使用 Tremor 官方 MIT 源码</span>
          </div>
        </header>

        <div
          className="component-mode-switch"
          role="group"
          aria-label="KPI 组件方案"
        >
          {modes.map((item) => (
            <Button
              aria-pressed={mode === item.id}
              key={item.id}
              onClick={() => setMode(item.id)}
              size="sm"
              variant={mode === item.id ? "default" : "outline"}
            >
              {item.label}
            </Button>
          ))}
        </div>

        <section className="active-component-summary" aria-live="polite">
          <strong>{active.title}</strong>
          <span>{active.description}</span>
        </section>

        {mode === "shadcn" ? <CurrentShadcn /> : null}
        {mode === "tremor-block" ? <TremorBlock /> : null}
        {mode === "tremor-matched" ? <TremorMatched /> : null}

        <footer className="component-demo-footer">
          <span>页面数据均为脱敏演示数据</span>
          <span>独立 Demo，不修改现有 sidebar/topbar</span>
        </footer>
      </div>
    </main>
  );
}
