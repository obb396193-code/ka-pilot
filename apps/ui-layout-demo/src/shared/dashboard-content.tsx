import {
  ArrowDownRight,
  ArrowRight,
  ArrowUpRight,
  Bot,
  CalendarDays,
  CheckCircle2,
  ChevronRight,
  CircleAlert,
  Clock3,
  DatabaseZap,
  Filter,
  MessageSquareText,
  MoreHorizontal,
  RefreshCw,
  Send,
  ShieldAlert,
  Sparkles,
  TrendingUp,
  UsersRound,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import {
  accounts,
  actionQueue,
  roleViews,
  teamRanking,
  trendData,
  type RoleMode,
} from "./demo-data";
import {
  formatCompactCurrency,
  formatCurrency,
  formatInteger,
  formatPercent,
} from "./formatters";

type DashboardVariant = "sidebar" | "topbar";

const roleOptions: { value: RoleMode; label: string }[] = [
  { value: "optimizer", label: "优化师" },
  { value: "manager", label: "KA 负责人" },
  { value: "hybrid", label: "综合首页" },
];

const metricSets = {
  optimizer: [
    {
      label: "今日消耗",
      value: formatCompactCurrency(128640.72),
      exact: "精确值 ¥128,640.72",
      delta: "+8.6%",
      tone: "info",
      icon: TrendingUp,
    },
    {
      label: "后端真实转化",
      value: formatInteger(2080),
      exact: "媒体回传 2,232 · Gap 6.8%",
      delta: "+12.4%",
      tone: "success",
      icon: DatabaseZap,
    },
    {
      label: "真实 CPA",
      value: formatCurrency(61.85),
      exact: "考核价 ¥58.00 · 高 6.6%",
      delta: "+3.8%",
      tone: "warning",
      icon: CircleAlert,
    },
    {
      label: "风险账户",
      value: "3 / 46",
      exact: "1 个严重 · 2 个关注",
      delta: "待处理",
      tone: "danger",
      icon: ShieldAlert,
    },
  ],
  manager: [
    {
      label: "本月目标完成",
      value: formatPercent(0.824),
      exact: "距月目标还差 17.6%",
      delta: "+6.2%",
      tone: "info",
      icon: TrendingUp,
    },
    {
      label: "团队真实 CPA",
      value: formatCurrency(60.42),
      exact: "考核均值 ¥59.10",
      delta: "+2.2%",
      tone: "warning",
      icon: UsersRound,
    },
    {
      label: "活跃任务",
      value: "15",
      exact: "6 个放量 · 7 个稳定 · 2 个测试",
      delta: "正常",
      tone: "success",
      icon: CheckCircle2,
    },
    {
      label: "需拍板事项",
      value: "2",
      exact: "预算倾斜 1 · 任务止损 1",
      delta: "今天",
      tone: "danger",
      icon: ShieldAlert,
    },
  ],
  hybrid: [
    {
      label: "今日消耗",
      value: formatCompactCurrency(128640.72),
      exact: "完成日预算 74.2%",
      delta: "+8.6%",
      tone: "info",
      icon: TrendingUp,
    },
    {
      label: "本月目标完成",
      value: formatPercent(0.824),
      exact: "按当前速度预计达成 96.1%",
      delta: "+6.2%",
      tone: "success",
      icon: CheckCircle2,
    },
    {
      label: "真实 CPA",
      value: formatCurrency(61.85),
      exact: "考核价 ¥58.00",
      delta: "+6.6%",
      tone: "warning",
      icon: CircleAlert,
    },
    {
      label: "行动队列",
      value: "5",
      exact: "3 项个人处理 · 2 项负责人拍板",
      delta: "进行中",
      tone: "danger",
      icon: Sparkles,
    },
  ],
} as const;

function RoleSwitcher({
  value,
  onChange,
}: {
  value: RoleMode;
  onChange: (value: RoleMode) => void;
}) {
  return (
    <div className="role-switcher" aria-label="首页角色模式">
      {roleOptions.map((option) => (
        <button
          key={option.value}
          type="button"
          aria-pressed={value === option.value}
          onClick={() => onChange(option.value)}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

function DashboardFilters({
  onChange,
}: {
  onChange: (message: string) => void;
}) {
  return (
    <div className="dashboard-filters" aria-label="工作台筛选">
      <label>
        <span className="sr-only">日期范围</span>
        <CalendarDays aria-hidden="true" />
        <select
          onChange={(event) =>
            onChange(`已切换到${event.target.selectedOptions[0].text}`)
          }
          defaultValue="today"
        >
          <option value="today">今天 · 08/20</option>
          <option value="yesterday">昨天 · 08/19</option>
          <option value="week">近 7 天</option>
        </select>
      </label>
      <label>
        <span className="sr-only">投放任务</span>
        <Filter aria-hidden="true" />
        <select
          onChange={(event) =>
            onChange(`正在查看${event.target.selectedOptions[0].text}`)
          }
          defaultValue="all"
        >
          <option value="all">全部任务</option>
          <option value="growth">新客增长计划</option>
          <option value="product">重点单品放量</option>
          <option value="recall">老客召回测试</option>
        </select>
      </label>
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => onChange("数据已刷新 · 10:42")}
      >
        <RefreshCw /> 刷新
      </Button>
    </div>
  );
}

function MetricGrid({ role }: { role: RoleMode }) {
  return (
    <div className="metric-grid">
      {metricSets[role].map((metric, index) => {
        const Icon = metric.icon;
        return (
          <Card className="metric-card" key={metric.label}>
            <CardHeader>
              <div>
                <CardDescription>{metric.label}</CardDescription>
                <div className="metric-value">{metric.value}</div>
              </div>
              <div className={`metric-icon tone-${metric.tone}`}>
                <Icon />
              </div>
            </CardHeader>
            <CardContent>
              <div className="metric-meta">
                <span>{metric.exact}</span>
                <Badge
                  tone={
                    metric.tone === "danger"
                      ? "danger"
                      : metric.tone === "warning"
                        ? "warning"
                        : metric.tone === "success"
                          ? "success"
                          : "info"
                  }
                >
                  {metric.delta}
                </Badge>
              </div>
              <div className="metric-index">0{index + 1}</div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}

function PerformanceChart({
  role,
  variant,
}: {
  role: RoleMode;
  variant: DashboardVariant;
}) {
  const chartRef = useRef<HTMLDivElement>(null);
  const [metric, setMetric] = useState<"spend" | "cpa">("spend");

  useEffect(() => {
    if (!chartRef.current || typeof ResizeObserver === "undefined") return;
    let cancelled = false;
    let chart: { resize: () => void; dispose: () => void } | undefined;
    let observer: ResizeObserver | undefined;
    void import("./chart-runtime").then(({ echarts }) => {
      if (cancelled || !chartRef.current) return;
      const instance = echarts.init(chartRef.current);
      chart = instance;
      const isSpend = metric === "spend";
      instance.setOption({
        animationDuration: 520,
        grid: { left: 48, right: 22, top: 26, bottom: 30 },
        tooltip: {
          trigger: "axis",
          backgroundColor: "rgba(15,23,42,.94)",
          borderWidth: 0,
          textStyle: { color: "#fff", fontSize: 12 },
          padding: [10, 12],
        },
        xAxis: {
          type: "category",
          boundaryGap: false,
          data: trendData.map((item) => item.time),
          axisLine: { lineStyle: { color: "#d8dee8" } },
          axisTick: { show: false },
          axisLabel: { color: "#8a94a6", fontSize: 11 },
        },
        yAxis: {
          type: "value",
          scale: true,
          splitNumber: 4,
          splitLine: {
            lineStyle: {
              color: variant === "topbar" ? "#e7ebf1" : "#e8e9ec",
              type: "dashed",
            },
          },
          axisLabel: {
            color: "#8a94a6",
            formatter: isSpend ? "¥{value}k" : "¥{value}",
          },
        },
        series: [
          {
            name: isSpend ? "累计消耗" : "真实 CPA",
            type: "line",
            smooth: 0.36,
            symbol: "circle",
            showSymbol: false,
            symbolSize: 7,
            lineStyle: {
              width: 3,
              color: variant === "topbar" ? "#165dff" : "#2563eb",
            },
            itemStyle: { color: variant === "topbar" ? "#165dff" : "#2563eb" },
            areaStyle: {
              color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
                {
                  offset: 0,
                  color:
                    variant === "topbar"
                      ? "rgba(22,93,255,.22)"
                      : "rgba(37,99,235,.18)",
                },
                { offset: 1, color: "rgba(37,99,235,0)" },
              ]),
            },
            data: trendData.map((item) => (isSpend ? item.spend : item.cpa)),
            markLine: isSpend
              ? undefined
              : {
                  symbol: "none",
                  label: { formatter: "考核 ¥58", color: "#d97706" },
                  lineStyle: { color: "#f59e0b", type: "dashed" },
                  data: [{ yAxis: 58 }],
                },
          },
        ],
        aria: {
          enabled: true,
          decal: { show: false },
          description: `${roleViews[role].title}。${isSpend ? "今日累计消耗" : "真实 CPA"}趋势，数据为脱敏演示数据。`,
        },
      });
      observer = new ResizeObserver(() => instance.resize());
      observer.observe(chartRef.current);
    });
    return () => {
      cancelled = true;
      observer?.disconnect();
      chart?.dispose();
    };
  }, [metric, role, variant]);

  return (
    <Card className="chart-card">
      <CardHeader>
        <div>
          <CardTitle>经营趋势</CardTitle>
          <CardDescription>
            截至 10:42 · 后端真实转化约延迟 8 分钟
          </CardDescription>
        </div>
        <div className="chart-tabs" aria-label="趋势指标">
          <button
            type="button"
            aria-pressed={metric === "spend"}
            onClick={() => setMetric("spend")}
          >
            消耗
          </button>
          <button
            type="button"
            aria-pressed={metric === "cpa"}
            onClick={() => setMetric("cpa")}
          >
            真实 CPA
          </button>
        </div>
      </CardHeader>
      <CardContent>
        <div
          className="chart-canvas"
          ref={chartRef}
          role="img"
          aria-label="投放经营趋势图"
        />
      </CardContent>
    </Card>
  );
}

function ActionQueue() {
  return (
    <Card className="queue-card">
      <CardHeader>
        <div>
          <CardTitle>今日需要处理</CardTitle>
          <CardDescription>按成本与跑量影响排序</CardDescription>
        </div>
        <Badge tone="danger">3 项</Badge>
      </CardHeader>
      <CardContent className="queue-list">
        {actionQueue.map((item) => (
          <article className="queue-item" key={item.id}>
            <span className={`risk-dot ${item.level}`} />
            <div className="queue-copy">
              <strong>{item.title}</strong>
              <span>{item.detail}</span>
              <small>{item.time}</small>
            </div>
            <Button variant="ghost" size="icon-sm" aria-label={item.action}>
              <ChevronRight />
            </Button>
          </article>
        ))}
        <Button variant="outline" className="w-full">
          查看完整行动队列 <ArrowRight />
        </Button>
      </CardContent>
    </Card>
  );
}

function TeamRanking() {
  return (
    <Card className="queue-card">
      <CardHeader>
        <div>
          <CardTitle>团队经营表现</CardTitle>
          <CardDescription>按本月目标完成率排序</CardDescription>
        </div>
        <Badge tone="info">3 人</Badge>
      </CardHeader>
      <CardContent className="ranking-list">
        {teamRanking.map((member, index) => (
          <article className="ranking-item" key={member.name}>
            <span className="rank-number">0{index + 1}</span>
            <div>
              <strong>{member.name}</strong>
              <span>{member.tasks} 个活跃任务</span>
            </div>
            <div className="rank-metric">
              <strong>{formatPercent(member.completion)}</strong>
              <span>CPA {formatCurrency(member.cpa)}</span>
            </div>
          </article>
        ))}
        <Button variant="outline" className="w-full">
          查看团队明细 <ArrowRight />
        </Button>
      </CardContent>
    </Card>
  );
}

function AccountsTable() {
  const [sortKey, setSortKey] = useState<"spend" | "cpa">("spend");
  const rows = useMemo(
    () => [...accounts].sort((a, b) => b[sortKey] - a[sortKey]),
    [sortKey],
  );
  return (
    <Card className="table-card">
      <CardHeader>
        <div>
          <CardTitle>账户经营明细</CardTitle>
          <CardDescription>6 条脱敏演示记录 · 金额按精确值显示</CardDescription>
        </div>
        <div className="table-tools">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setSortKey(sortKey === "spend" ? "cpa" : "spend")}
          >
            <Filter />按{sortKey === "spend" ? "CPA" : "消耗"}排序
          </Button>
          <Button variant="ghost" size="icon-sm" aria-label="更多表格操作">
            <MoreHorizontal />
          </Button>
        </div>
      </CardHeader>
      <CardContent className="table-scroll">
        <table>
          <thead>
            <tr>
              <th>账户 / 任务</th>
              <th>负责人</th>
              <th className="numeric">今日消耗</th>
              <th className="numeric">真实转化</th>
              <th className="numeric">真实 CPA</th>
              <th>状态</th>
              <th>
                <span className="sr-only">操作</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((account) => (
              <tr key={account.id}>
                <td>
                  <strong>{account.name}</strong>
                  <span>{account.task}</span>
                </td>
                <td>{account.owner}</td>
                <td className="numeric">{formatCurrency(account.spend)}</td>
                <td className="numeric">
                  {formatInteger(account.conversions)}
                </td>
                <td className="numeric">
                  <strong>{formatCurrency(account.cpa)}</strong>
                  <small
                    className={account.trend > 0 ? "trend-up" : "trend-down"}
                  >
                    {account.trend > 0 ? <ArrowUpRight /> : <ArrowDownRight />}
                    {formatPercent(Math.abs(account.trend))}
                  </small>
                </td>
                <td>
                  <Badge
                    tone={
                      account.risk === "critical"
                        ? "danger"
                        : account.risk === "warning"
                          ? "warning"
                          : "success"
                    }
                  >
                    {account.risk === "critical"
                      ? "严重"
                      : account.risk === "warning"
                        ? "关注"
                        : "正常"}
                  </Badge>
                </td>
                <td>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label={`查看${account.name}`}
                  >
                    <ChevronRight />
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </CardContent>
    </Card>
  );
}

function AgentDrawer({ variant }: { variant: DashboardVariant }) {
  const [message, setMessage] = useState("");
  return (
    <Sheet>
      <SheetTrigger asChild>
        <button
          type="button"
          className={`agent-fab ${variant}`}
          aria-label="打开投放 Agent"
        >
          <Sparkles />
          <span>问 Agent</span>
        </button>
      </SheetTrigger>
      <SheetContent>
        <div className="agent-header">
          <div className="agent-avatar">
            <Bot />
          </div>
          <div>
            <SheetTitle>投放 Agent</SheetTitle>
            <SheetDescription>已带入当前工作台和筛选条件</SheetDescription>
          </div>
        </div>
        <div className="agent-context">
          <Badge tone="info">上下文</Badge>
          <span>今天 · 全部任务 · 46 个活跃账户</span>
        </div>
        <div className="agent-thread">
          <div className="agent-message assistant">
            <span className="message-icon">
              <Sparkles />
            </span>
            <div>
              <strong>当前最值得先看的是演示账户-A01。</strong>
              <p>
                它连续 90 分钟超成本，真实 CPA 比考核价高
                22.8%，同时消耗仍在增长。
              </p>
              <button type="button">
                查看证据链 <ArrowRight />
              </button>
            </div>
          </div>
          <div className="agent-message user">
            <div>如果先不关停，还有什么更稳妥的处理方式？</div>
          </div>
          <div className="agent-message assistant">
            <span className="message-icon">
              <MessageSquareText />
            </span>
            <div>
              <strong>建议先预览两项低风险动作：</strong>
              <ol>
                <li>收紧高成本时段，不改变全天预算。</li>
                <li>保留跑量素材，暂停近 2 小时无转化的组合。</li>
              </ol>
              <small>任何写操作都需要你确认后才执行。</small>
            </div>
          </div>
        </div>
        <form
          className="agent-composer"
          onSubmit={(event) => {
            event.preventDefault();
            setMessage("");
          }}
        >
          <label htmlFor="agent-input" className="sr-only">
            向 Agent 提问
          </label>
          <textarea
            id="agent-input"
            name="agent-question"
            autoComplete="off"
            value={message}
            onChange={(event) => setMessage(event.target.value)}
            placeholder="继续追问数据、原因或处理建议…"
            rows={3}
          />
          <div>
            <span>Enter 发送 · Shift + Enter 换行</span>
            <Button
              type="submit"
              size="icon-sm"
              aria-label="发送"
              disabled={!message.trim()}
            >
              <Send />
            </Button>
          </div>
        </form>
      </SheetContent>
    </Sheet>
  );
}

export function DashboardContent({ variant }: { variant: DashboardVariant }) {
  const [role, setRole] = useState<RoleMode>("optimizer");
  const [filterMessage, setFilterMessage] =
    useState("全部任务 · 数据更新于 10:42");
  const view = roleViews[role];
  return (
    <main id="main-content" className={`dashboard-content ${variant}`}>
      <section className="dashboard-intro">
        <div className="intro-copy">
          <p className="eyebrow">{view.eyebrow}</p>
          <h1>{view.title}</h1>
          <p>{view.description}</p>
        </div>
        <div className="intro-controls">
          <RoleSwitcher value={role} onChange={setRole} />
          <DashboardFilters onChange={setFilterMessage} />
          <div className="freshness" aria-live="polite">
            <Clock3 />
            {filterMessage}
          </div>
        </div>
      </section>
      <MetricGrid role={role} />
      <section className={`analysis-grid ${role}`}>
        <PerformanceChart role={role} variant={variant} />
        {role === "manager" ? <TeamRanking /> : <ActionQueue />}
      </section>
      {role === "hybrid" && (
        <section className="hybrid-extra">
          <TeamRanking />
        </section>
      )}
      <AccountsTable />
      <footer className="demo-footer">
        <span>所有账户、金额与人员均为脱敏演示数据</span>
        <span>数据状态：媒体已更新 · 后端延迟约 8 分钟</span>
      </footer>
      <AgentDrawer variant={variant} />
    </main>
  );
}
