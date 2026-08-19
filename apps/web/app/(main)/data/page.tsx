"use client"

import { useState } from "react"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Download, Filter } from "lucide-react"

// Mock data - will be replaced with real API call
const mockTableData = [
  {
    row_id: "acc_001_today",
    date: new Date().toISOString().split("T")[0],
    account_id: "acc_001",
    account_name: "账户A",
    task_name: "Q1增长任务",
    cost: 3280.2,
    conversion: 124.2,
    real_conversion: 115,
    cpa: 26.41,
    real_cpa: 28.52,
    assessment_cost: 30,
    gap: 0.08,
    负责人: "张三",
  },
  {
    row_id: "acc_002_today",
    date: new Date().toISOString().split("T")[0],
    account_id: "acc_002",
    account_name: "账户B",
    task_name: "新品测试",
    cost: 5640.8,
    conversion: 174.96,
    real_conversion: 162,
    cpa: 32.23,
    real_cpa: 34.82,
    assessment_cost: 30,
    gap: 0.08,
    负责人: "李四",
  },
]

export default function DataTablePage() {
  const [data] = useState(mockTableData)

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle>完整数据总表</CardTitle>
          <div className="flex gap-2">
            <Button variant="outline" size="sm">
              <Filter className="mr-2 h-4 w-4" />
              筛选
            </Button>
            <Button variant="outline" size="sm">
              <Download className="mr-2 h-4 w-4" />
              导出
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>日期</TableHead>
                <TableHead>账户</TableHead>
                <TableHead>任务</TableHead>
                <TableHead>负责人</TableHead>
                <TableHead className="text-right">消耗</TableHead>
                <TableHead className="text-right">账面转化</TableHead>
                <TableHead className="text-right">真实转化</TableHead>
                <TableHead className="text-right">CPA</TableHead>
                <TableHead className="text-right">真实CPA</TableHead>
                <TableHead className="text-right">考核价</TableHead>
                <TableHead className="text-right">GAP</TableHead>
                <TableHead>达标</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.map((row) => (
                <TableRow key={row.row_id}>
                  <TableCell className="font-medium">{row.date}</TableCell>
                  <TableCell>{row.account_name}</TableCell>
                  <TableCell>{row.task_name}</TableCell>
                  <TableCell>{row.负责人}</TableCell>
                  <TableCell className="text-right tabular-nums">
                    ¥{row.cost.toFixed(2)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {row.conversion.toFixed(1)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {row.real_conversion}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    ¥{row.cpa.toFixed(2)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    ¥{row.real_cpa.toFixed(2)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    ¥{row.assessment_cost}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {(row.gap * 100).toFixed(1)}%
                  </TableCell>
                  <TableCell>
                    <Badge variant={row.real_cpa <= row.assessment_cost ? "default" : "destructive"}>
                      {row.real_cpa <= row.assessment_cost ? "达标" : "超标"}
                    </Badge>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  )
}
