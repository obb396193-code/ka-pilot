# COSS 产品顶栏对比版设计

> 日期：2026-08-21
>
> 状态：老板已在 shadcn A 方案拍板时同意追加本独立版
>
> 范围：`apps/ui-layout-demo/topbar-coss.html`；不修改 `apps/web`

## 1. 目标

新增一个与 shadcn A 版完全独立的 COSS 产品风顶栏经营看板，供老板只比较设计语言和信息密度。页面不显示“切换布局”按钮，通过独立 URL 打开。

## 2. 复用来源

运行时实际复用 COSS current 公开 Registry 源码：

- `button`
- `card`
- `badge`
- `avatar`
- `input`
- `table`
- `segmented-control`
- `p-navigation-1` 的分段导航组合

底层依赖为 Base UI + Tailwind CSS v4，字体使用 COSS `font-heading` 条目指定的 Inter。不直接复制未声明独立许可证的 Atlas CRM 整仓页面；仅参考其产品化顶栏、密度和右侧操作区，内容区由已核实 COSS 组件组合。

## 3. 页面结构

1. 64px 产品顶栏：`KA Pilot`、COSS segmented navigation、全局搜索、Agent 按钮、官方头像。
2. 页头：工作台标题、脱敏数据声明、日期与导出操作。
3. 四张 COSS Card KPI：今日消耗、真实 CPA、达标率、待处理。
4. 主区：消耗 / 真实 CPA 趋势 + 今日需处理。
5. 下方 COSS Table：AAC 拉新、wake_uv、aac_ptt_uv、0 消耗和结构风险等脱敏任务。

## 4. 视觉边界

- 保留 COSS 的 `rounded-2xl`、轻边框、弱阴影、Base UI focus ring、更紧凑的表格与 Badge。
- 不添加渐变背景、重阴影、高饱和彩色 KPI 或炫技动效。
- 图表使用现有 Recharts 作为数据绘制层，但外壳、标签和提示全部使用 COSS 信息层级。
- 与 `topbar.html` / `sidebar.html` 样式隔离，禁止导入它们的入口 CSS。

## 5. 业务边界

- 不出现“支付”或 ROI。
- 不发明新指标；仅使用消耗、真实 CPA、考核价、达标率、真实转化和待处理。
- 任务名使用真实业务类型 + 脱敏名称，不使用真实账户 ID、考核价、公司内部人名或真实消耗数。

## 6. 验收

- 1440px 桌面宽度无横向溢出，顶栏不换行。
- 搜索、分段导航、角色菜单、Agent 面板和表格筛选可操作。
- 页面内无其他布局入口或方案切换器。
- console 0 error / 0 warning，针对性 Vitest、Node 入口测试、Prettier、Vite build 通过。
