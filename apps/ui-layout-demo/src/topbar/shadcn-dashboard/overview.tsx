"use client";

import {
  Area,
  CartesianGrid,
  ComposedChart,
  Line,
  XAxis,
  YAxis,
} from "recharts";

import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "./ui/chart";
import { chartData } from "./demo-data";

const chartConfig = {
  spend: {
    label: "消耗（千元）",
    color: "var(--primary)",
  },
  realCpa: {
    label: "真实 CPA（元）",
    color: "var(--muted-foreground)",
  },
} satisfies ChartConfig;

export function Overview() {
  return (
    <ChartContainer
      config={chartConfig}
      className="aspect-auto h-[350px] w-full"
    >
      <ComposedChart data={chartData} margin={{ left: 4, right: 8 }}>
        <defs>
          <linearGradient id="fillSpend" x1="0" y1="0" x2="0" y2="1">
            <stop
              offset="5%"
              stopColor="var(--color-spend)"
              stopOpacity={0.28}
            />
            <stop
              offset="95%"
              stopColor="var(--color-spend)"
              stopOpacity={0.02}
            />
          </linearGradient>
        </defs>
        <CartesianGrid vertical={false} />
        <XAxis
          dataKey="date"
          tickLine={false}
          axisLine={false}
          tickMargin={8}
          minTickGap={24}
          tickFormatter={(value) =>
            new Date(String(value)).toLocaleDateString("zh-CN", {
              month: "numeric",
              day: "numeric",
            })
          }
        />
        <YAxis
          yAxisId="spend"
          tickLine={false}
          axisLine={false}
          tickMargin={8}
          width={46}
          tickFormatter={(value) => `¥${value}k`}
        />
        <YAxis
          yAxisId="cpa"
          orientation="right"
          tickLine={false}
          axisLine={false}
          tickMargin={8}
          width={42}
          domain={[32, 44]}
          tickFormatter={(value) => `¥${value}`}
        />
        <ChartTooltip
          cursor={false}
          content={
            <ChartTooltipContent
              indicator="dot"
              labelFormatter={(value) =>
                new Date(String(value)).toLocaleDateString("zh-CN", {
                  month: "long",
                  day: "numeric",
                })
              }
            />
          }
        />
        <Area
          yAxisId="spend"
          dataKey="spend"
          type="natural"
          fill="url(#fillSpend)"
          stroke="var(--color-spend)"
          strokeWidth={2}
        />
        <Line
          yAxisId="cpa"
          dataKey="realCpa"
          type="natural"
          stroke="var(--color-realCpa)"
          strokeWidth={2}
          dot={false}
          activeDot={{ r: 4 }}
        />
      </ComposedChart>
    </ChartContainer>
  );
}
