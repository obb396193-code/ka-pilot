# shadcn 历史顶栏 Dashboard 整页替换设计

> 日期：2026-08-21  
> 状态：老板已拍板  
> 范围：`apps/ui-layout-demo/topbar.html`；不修改正式产品 `apps/web`

## 1. 目标

把现有顶栏 Demo 从“coss Navigation Menu primitive + 项目自写 App Shell/DashboardContent”替换为成熟完整页面。

最终顶栏版必须满足：

- 和已经认可的 shadcn `new-york-v4/dashboard-01` 侧栏版属于同一视觉语言；
- 整块复用成熟页面的结构、间距、密度、字体、token 和交互；
- 本地只做中文投放业务文案、脱敏假数据、导航信息架构和 Agent 入口适配；
- `sidebar.html` 与 `topbar.html` 继续是两个完全独立入口，不显示布局切换按钮；
- 电脑端优先，先验收 1440×768 与 1440×900。

## 2. 来源选择

选择 shadcn 官方历史版 Dashboard 顶栏页面作为唯一主来源。其完整结构包含：

- `TeamSwitcher`
- `MainNav`
- `Search`
- `UserNav`
- `CalendarDateRangePicker`
- KPI Cards
- `Overview`
- `RecentSales`
- Tabs 与下载操作

来源证据：

- 历史页面结构记录：<https://dev.to/ramunarasinga/shadcn-uiui-codebase-analysis-dashboard-example-explained-42a1>
- shadcn 官方仓库：<https://github.com/shadcn-ui/ui>
- shadcn 许可证：MIT

未选方案：

- COSS Atlas CRM：完整顶栏应用视觉可参考，但社区整仓未声明许可证；本批次不复制其页面壳。
- Tabler horizontal/navbar-overlap：完整成熟，但基于 Bootstrap 5；不为一个 Demo 引入第二套样式系统。
- 当前顶栏：只复用了 coss Navigation Menu primitive，页面壳与数据区仍是本项目自写，未满足“整页复用”。

## 3. 页面信息架构

### 3.1 顶栏

保持历史 shadcn 页面单行顶栏结构：

1. 左侧产品/工作区切换：显示 `KA Pilot`，使用原 TeamSwitcher 的尺寸、菜单和交互。
2. 高频一级导航：`工作台`、`投放任务`、`数据分析`、`账户池`、`自动化`、`商品素材`。
3. `更多`：承接 `报告`、`知识库`、`集成与通知`，不删除“更多”。
4. 右侧操作：全局搜索、Agent 入口、通知、`快手优化师`头像菜单。

这样保留九项冻结业务入口，同时避免 1366–1440px 下九项全部平铺造成拥挤。

### 3.2 首页正文

保持历史 shadcn Dashboard 的完整层级，不复用当前自写 `DashboardContent`：

1. 页面标题 + 日期范围 + 导出操作；
2. 四张 KPI 卡：今日消耗、支付 ROI、转化成本、计划达成率；
3. 主趋势图：消耗与支付金额趋势；
4. 辅助列表：近期投放任务/需关注异常；
5. Tabs：总览、投放表现、协作进度；
6. 投放 Agent 使用 shadcn Button/Sheet 或 Drawer 接入，不另造视觉组件。

全部数据为脱敏假数据，并显式标记 Demo 数据。

## 4. 复用边界

必须保留：

- 上游组件 DOM 层级；
- Tailwind className 序列；
- shadcn token、Geist 字体、圆角、边框、留白和卡片密度；
- Popover、Dropdown、Tabs、Avatar、日期选择和键盘焦点行为。

允许修改：

- import 路径；
- 中文投放业务文案；
- 脱敏假数据；
- 导航项和业务图表数据；
- `KA Pilot`、头像、账号显示名；
- 为适配 React/Vite 所需的最小 glue code。

禁止：

- 再写一套顶栏皮肤；
- 用裸 `table/th/td/svg/font` 全局规则污染官方块；
- 给卡片增加渐变、重阴影、彩色装饰或非官方动效；
- 与侧栏入口共享会改变官方几何的全局 CSS；
- 把未实现功能伪装成已接入正式产品。

## 5. 代码组织

- `topbar.html` 只加载顶栏入口样式和入口脚本。
- 新建独立的 topbar official block 目录，保存本地适配后的完整页面与组件。
- 侧栏 `src/sidebar/official-dashboard-01/` 不改。
- 旧 `topbar-shell.tsx`、旧顶栏 CSS 与只为旧顶栏服务的共享分支在新页面通过测试后移除。
- 来源 URL、许可证、抓取日期和上游快照 hash 写入 `THIRD_PARTY_SOURCES.md` 与验收报告。

## 6. 验收

### 机械验收

- 保存官方历史源码快照与 SHA-256；
- 对上游/本地组件的结构与 className 做可复现比对；
- TypeScript、Vitest、Prettier、production build 全通过；
- `topbar.html` 不再 import 自写 `DashboardContent`。

### 浏览器验收

- 1440×768、1440×900 无横向溢出；
- 顶栏不换行、不遮挡、导航“更多”可操作；
- 搜索、日期、Tabs、头像菜单、Agent Drawer/Sheet 可操作；
- console error/warning 为 0；
- 字体、卡片、图表和内容起点与选定上游页面在同视口下逐项核对；
- 与 `sidebar.html` 样式隔离，两边互不污染。

## 7. 非目标

- 本批次不把 Demo 接入正式 `apps/web`；
- 不补完整手机端产品交互；
- 不实现真实媒体数据接口与写操作；
- 不在顶栏和侧栏之间做页面内切换。

## 8. 后续对比版

A 版完成并通过验收后，再新增独立入口 `topbar-coss.html`：

- 以 COSS Atlas CRM 的顶栏产品气质作为整页视觉参考；
- 尽量使用已经收录、许可证已核的 COSS 官方组件源码实现；
- 不与 shadcn A 版共享会污染视觉的全局 CSS；
- 共用同一份脱敏业务数据，便于只比较布局与设计语言；
- 不在任一页面显示布局切换控件，通过独立 URL 打开比较。

该后续版单独写设计与实施计划，不阻塞 A 版交付。
