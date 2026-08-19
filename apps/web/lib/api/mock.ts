/**
 * Mock API Layer
 * 契约驱动 mock，按 packages/contract/src/api/endpoints.ts 定义
 * 脱敏假数据自造，数字符合 metrics.md 口径公式自洽
 */

// 响应结构：所有端点统一包裹 meta.data_as_of
interface ApiResponse<T> {
  data: T
  meta: {
    data_as_of: string
  }
}

// ============ /api/v1/dashboard/summary ============
interface DashboardSummary {
  total_cost: number
  total_cost_change: number
  avg_real_cpa: number
  assessment_cost: number
  compliance_rate: number
  compliance_change: number
  cost_margin: number
  bi_volume: number
  bi_volume_change: number
  pending_items: number
  p0_count: number
}

export async function getDashboardSummary(): Promise<ApiResponse<DashboardSummary>> {
  await new Promise((r) => setTimeout(r, 100)) // 模拟网络延迟

  const data: DashboardSummary = {
    total_cost: 156780.5, // ¥15.68万
    total_cost_change: 0.124, // +12.4%
    avg_real_cpa: 28.3,
    assessment_cost: 30,
    compliance_rate: 0.732, // 73.2%
    compliance_change: -0.05, // -5pp
    cost_margin: 18940.2, // +¥1.89万
    bi_volume: 5542,
    bi_volume_change: -0.087, // -8.7%
    pending_items: 7,
    p0_count: 2,
  }

  return {
    data,
    meta: {
      data_as_of: new Date().toISOString(),
    },
  }
}

// ============ /api/v1/work-items ============
interface WorkItem {
  id: string
  severity: "P0" | "P1" | "P2"
  title: string
  description: string
  task_name: string
  account_name: string
  created_at: string
}

export async function getWorkItems(): Promise<ApiResponse<WorkItem[]>> {
  await new Promise((r) => setTimeout(r, 100))

  const data: WorkItem[] = [
    {
      id: "wi_001",
      severity: "P0",
      title: "CPA严重超标",
      description: "账户B真实CPA ¥34.82，超考核价 16.1%，已持续2天",
      task_name: "新品测试",
      account_name: "账户B",
      created_at: new Date(Date.now() - 3600000).toISOString(),
    },
    {
      id: "wi_002",
      severity: "P0",
      title: "余额不足预警",
      description: "账户C余额仅剩 ¥1280，预计今日消耗 ¥3500",
      task_name: "Q1增长任务",
      account_name: "账户C",
      created_at: new Date(Date.now() - 7200000).toISOString(),
    },
    {
      id: "wi_003",
      severity: "P1",
      title: "BI量级下降",
      description: "任务「新品测试」BI量级环比下降 28.3%",
      task_name: "新品测试",
      account_name: "账户A",
      created_at: new Date(Date.now() - 10800000).toISOString(),
    },
    {
      id: "wi_004",
      severity: "P2",
      title: "广告计划待审核",
      description: "3条新计划已提交，等待审核",
      task_name: "Q1增长任务",
      account_name: "账户A",
      created_at: new Date(Date.now() - 14400000).toISOString(),
    },
  ]

  return {
    data,
    meta: {
      data_as_of: new Date().toISOString(),
    },
  }
}

// ============ /api/v1/tasks ============
interface Task {
  task_id: string
  task_name: string
  status: "in_progress" | "paused"
  real_cpa: number
  assessment_cost: number
  compliance_rate: number
  total_cost: number
  total_real_conversion: number
  pacing: number // 进度 0-1
}

export async function getTasks(): Promise<ApiResponse<Task[]>> {
  await new Promise((r) => setTimeout(r, 100))

  // 数字自洽：real_cpa = total_cost / total_real_conversion
  const data: Task[] = [
    {
      task_id: "task_001",
      task_name: "Q1增长任务",
      status: "in_progress",
      real_cpa: 28.52,
      assessment_cost: 30,
      compliance_rate: 0.78,
      total_cost: 89460.2,
      total_real_conversion: 3136,
      pacing: 0.68,
    },
    {
      task_id: "task_002",
      task_name: "新品测试",
      status: "in_progress",
      real_cpa: 34.82,
      assessment_cost: 30,
      compliance_rate: 0.62,
      total_cost: 67320.3,
      total_real_conversion: 1933,
      pacing: 0.45,
    },
    {
      task_id: "task_003",
      task_name: "618大促准备",
      status: "paused",
      real_cpa: 26.15,
      assessment_cost: 28,
      compliance_rate: 0.91,
      total_cost: 45280.0,
      total_real_conversion: 1731,
      pacing: 0.22,
    },
  ]

  return {
    data,
    meta: {
      data_as_of: new Date().toISOString(),
    },
  }
}

// ============ /api/v1/accounts ============
interface Account {
  account_id: string
  account_name: string
  advertiser_id: string
  status: "active" | "paused"
  real_cpa_today: number
  assessment_cost: number
  is_compliant: boolean
  cost_today: number
  real_conversion_today: number
  daily_budget: number
  balance: number
  负责人: string
}

export async function getAccounts(): Promise<ApiResponse<Account[]>> {
  await new Promise((r) => setTimeout(r, 100))

  // 数字自洽：real_cpa_today = cost_today / real_conversion_today
  const data: Account[] = [
    {
      account_id: "acc_001",
      account_name: "账户A",
      advertiser_id: "1234567890",
      status: "active",
      real_cpa_today: 28.52,
      assessment_cost: 30,
      is_compliant: true,
      cost_today: 3280.2,
      real_conversion_today: 115,
      daily_budget: 5000,
      balance: 24680.5,
      负责人: "张三",
    },
    {
      account_id: "acc_002",
      account_name: "账户B",
      advertiser_id: "1234567891",
      status: "active",
      real_cpa_today: 34.82,
      assessment_cost: 30,
      is_compliant: false,
      cost_today: 5640.8,
      real_conversion_today: 162,
      daily_budget: 8000,
      balance: 18920.3,
      负责人: "李四",
    },
    {
      account_id: "acc_003",
      account_name: "账户C",
      advertiser_id: "1234567892",
      status: "active",
      real_cpa_today: 26.45,
      assessment_cost: 28,
      is_compliant: true,
      cost_today: 2910.5,
      real_conversion_today: 110,
      daily_budget: 3500,
      balance: 1280.0,
      负责人: "王五",
    },
    {
      account_id: "acc_004",
      account_name: "账户D",
      advertiser_id: "1234567893",
      status: "paused",
      real_cpa_today: 0,
      assessment_cost: 30,
      is_compliant: true,
      cost_today: 0,
      real_conversion_today: 0,
      daily_budget: 6000,
      balance: 32450.8,
      负责人: "赵六",
    },
  ]

  return {
    data,
    meta: {
      data_as_of: new Date().toISOString(),
    },
  }
}

// 导出统一的 mockApi 对象
export const mockApi = {
  getDashboardSummary,
  getWorkItems,
  getTasks,
  getAccounts,
}
