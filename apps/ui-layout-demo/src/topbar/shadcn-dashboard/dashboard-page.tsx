import {
  BellRing,
  Bot,
  CircleDollarSign,
  Download,
  Gauge,
  Target,
} from "lucide-react";

import { Button } from "./ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "./ui/card";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "./ui/sheet";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "./ui/tabs";
import { CalendarDateRangePicker } from "./date-range-picker";
import { kpis, viewLabels } from "./demo-data";
import { Overview } from "./overview";
import { RecentActivity } from "./recent-activity";
import type { DashboardView } from "./team-switcher";

const metricIcons = [CircleDollarSign, Gauge, Target, BellRing];

export function DashboardPage({ view }: { view: DashboardView }) {
  return (
    <div className="flex-1 space-y-4 p-8 pt-6">
      <div className="flex items-center justify-between space-y-2">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">投放经营总览</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            当前视图：{viewLabels[view]} · 页面数据均为脱敏演示数据
          </p>
        </div>
        <div className="flex items-center space-x-2">
          <CalendarDateRangePicker />
          <Button variant="outline">
            <Download />
            导出
          </Button>
          <Sheet>
            <SheetTrigger asChild>
              <Button>
                <Bot />
                投放 Agent
              </Button>
            </SheetTrigger>
            <SheetContent className="sm:max-w-md">
              <SheetHeader>
                <SheetTitle>投放 Agent</SheetTitle>
                <SheetDescription>
                  基于当前视图解释异常、生成复盘建议。Demo 不执行媒体写操作。
                </SheetDescription>
              </SheetHeader>
              <div className="mx-4 rounded-lg border bg-muted/40 p-4 text-sm leading-6">
                今日消耗提升 8.4%，真实 CPA 仍低于考核价
                ¥2.80。建议优先处理“新建广告存活检查”的 24h
                零消耗异常，并复核闲鱼潜客转化的数据链路。
              </div>
            </SheetContent>
          </Sheet>
        </div>
      </div>
      <Tabs defaultValue="overview" className="space-y-4">
        <TabsList>
          <TabsTrigger value="overview">总览</TabsTrigger>
          <TabsTrigger value="performance">投放表现</TabsTrigger>
          <TabsTrigger value="collaboration">协作进度</TabsTrigger>
        </TabsList>
        <TabsContent value="overview" className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            {kpis[view].map((metric, index) => {
              const Icon = metricIcons[index];
              return (
                <Card key={metric.label}>
                  <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium">
                      {metric.label}
                    </CardTitle>
                    <Icon className="size-4 text-muted-foreground" />
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold tabular-nums">
                      {metric.value}
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {metric.change}
                    </p>
                  </CardContent>
                </Card>
              );
            })}
          </div>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-7">
            <Card className="col-span-4">
              <CardHeader>
                <CardTitle>近 14 日消耗与真实 CPA</CardTitle>
                <CardDescription>
                  面积表示账面消耗，折线表示真实 CPA。
                </CardDescription>
              </CardHeader>
              <CardContent className="pl-2">
                <Overview />
              </CardContent>
            </Card>
            <Card className="col-span-3">
              <CardHeader>
                <CardTitle>近期投放任务</CardTitle>
                <CardDescription>按异常优先级与更新时间排列。</CardDescription>
              </CardHeader>
              <CardContent>
                <RecentActivity />
              </CardContent>
            </Card>
          </div>
        </TabsContent>
        <TabsContent value="performance">
          <Card>
            <CardHeader>
              <CardTitle>投放表现</CardTitle>
              <CardDescription>
                正式产品将在这里承接媒体、账户与商品层级下钻。
              </CardDescription>
            </CardHeader>
          </Card>
        </TabsContent>
        <TabsContent value="collaboration">
          <Card>
            <CardHeader>
              <CardTitle>协作进度</CardTitle>
              <CardDescription>
                团队协作作为工作台视图和行内动作存在，不占一级导航。
              </CardDescription>
            </CardHeader>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
