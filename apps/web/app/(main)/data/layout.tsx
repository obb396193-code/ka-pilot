import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"

export default function DataLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <div className="flex-1 space-y-4 p-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">数据分析</h1>
        <p className="text-sm text-muted-foreground">数据到底咋样</p>
      </div>

      <Tabs defaultValue="table" className="space-y-4">
        <TabsList>
          <TabsTrigger value="table">数据总表</TabsTrigger>
          <TabsTrigger value="dashboard">大盘</TabsTrigger>
          <TabsTrigger value="pivot">维度透视</TabsTrigger>
        </TabsList>
        <TabsContent value="table" className="space-y-4">
          {children}
        </TabsContent>
        <TabsContent value="dashboard" className="space-y-4">
          <div className="rounded-lg border p-8 text-center text-muted-foreground">
            大盘视图 - 待实现
          </div>
        </TabsContent>
        <TabsContent value="pivot" className="space-y-4">
          <div className="rounded-lg border p-8 text-center text-muted-foreground">
            维度透视 - 待实现
          </div>
        </TabsContent>
      </Tabs>
    </div>
  )
}
