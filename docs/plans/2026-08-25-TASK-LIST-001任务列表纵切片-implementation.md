# TASK-LIST-001 任务列表纵切片实施计划

> 状态：Contract frozen；来源为唯一前端线 P-008 请求，经 root 对真实 Domain/Repository
> 复核后冻结。视觉仍由老板与前端任务验收，本计划只管后端数据、权限和状态。

## 后端任务

1. Domain：为 request、item、page、meta、error 建立 strict schema；任务状态只允许
   preparing/active/ended，pacing 复用 `computeTaskPacing` 和 `RatioValue`。
2. DB：新增 workspace-scoped task list repository，参数化搜索/筛选/稳定排序/分页；同一查询
   快照得到 items 与 total。考核价按业务日取有效版本，账户数与工作项摘要必须先过批准
   `(media,account_id)` scope。
3. Service：组合 AUTH-001、上海 03:00 业务日、coverage/dataAsOf 和奇航主源审计；禁止
   data source 自选，禁止前端计算。
4. HTTP：挂载 `GET /api/v1/tasks`，只接受冻结参数；BFF `/api/internal/tasks` 由唯一前端线
   在后端 fixture 到齐后实现。
5. Fixture：ready/empty/partial/stale、401/403/400/502/503/504/500，以及同号跨媒体、跨
   workspace、无账户 grant、非法任务状态、未来考核价、稳定分页反例。

## 验收硬门

- 真实 PG 证明无权账户不进入 linkedAccountCount/workItemSummary。
- 同一筛选连续查询排序稳定；分页 total 与 items 来自同一一致性快照。
- 所有 pacing 字段与 Domain 函数逐字段相同，零分母保持 RatioValue state。
- 普通接口响应无 KA Data/reconcile 选择器，无浏览器自报 scope，无媒体写路由。
- Domain/DB/Worker 全量测试、typecheck/lint 与 BFF parity fixture 通过后才交前端。
