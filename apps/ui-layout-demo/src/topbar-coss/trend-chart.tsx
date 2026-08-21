import {
  Area,
  CartesianGrid,
  ComposedChart,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { chartData } from "@/topbar/shadcn-dashboard/demo-data";

export function TrendChart() {
  return (
    <div
      className="h-[280px] w-full"
      aria-label="近 14 日消耗与真实 CPA 趋势图"
    >
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart
          data={chartData}
          margin={{ top: 8, right: 6, bottom: 0, left: 0 }}
        >
          <defs>
            <linearGradient id="cossSpend" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="var(--chart-1)" stopOpacity={0.2} />
              <stop offset="95%" stopColor="var(--chart-1)" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid vertical={false} stroke="var(--border)" />
          <XAxis
            axisLine={false}
            dataKey="date"
            minTickGap={28}
            tick={{ fill: "var(--muted-foreground)", fontSize: 12 }}
            tickFormatter={(value) =>
              new Date(String(value)).toLocaleDateString("zh-CN", {
                month: "numeric",
                day: "numeric",
              })
            }
            tickLine={false}
            tickMargin={10}
          />
          <YAxis
            axisLine={false}
            domain={[70, 140]}
            tick={{ fill: "var(--muted-foreground)", fontSize: 12 }}
            tickFormatter={(value) => `¥${value}k`}
            tickLine={false}
            tickMargin={8}
            width={48}
            yAxisId="spend"
          />
          <YAxis
            axisLine={false}
            domain={[34, 44]}
            orientation="right"
            tick={{ fill: "var(--muted-foreground)", fontSize: 12 }}
            tickFormatter={(value) => `¥${value}`}
            tickLine={false}
            tickMargin={8}
            width={40}
            yAxisId="cpa"
          />
          <Tooltip
            contentStyle={{
              background: "var(--popover)",
              border: "1px solid var(--border)",
              borderRadius: "10px",
              boxShadow: "0 8px 24px rgb(0 0 0 / 8%)",
              color: "var(--popover-foreground)",
              fontSize: "12px",
            }}
            formatter={(value, name) => [
              name === "spend" ? `¥${value}k` : `¥${value}`,
              name === "spend" ? "消耗" : "真实 CPA",
            ]}
            labelFormatter={(value) =>
              new Date(String(value)).toLocaleDateString("zh-CN", {
                month: "long",
                day: "numeric",
              })
            }
          />
          <Area
            dataKey="spend"
            fill="url(#cossSpend)"
            stroke="var(--chart-1)"
            strokeWidth={2}
            type="natural"
            yAxisId="spend"
          />
          <Line
            activeDot={{ r: 4 }}
            dataKey="realCpa"
            dot={false}
            stroke="var(--chart-4)"
            strokeWidth={2}
            type="natural"
            yAxisId="cpa"
          />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
