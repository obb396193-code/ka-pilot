# shadcn/ui 官方示例组件库

> 来源：https://github.com/shadcn-ui/ui
> 下载时间：2026-08-19
> 用途：开发时直接复制粘贴，不要对照着写

## 目录结构

```
.shadcn-reference/
├── dashboard/          # 仪表板示例（已在当前目录）
│   ├── app-sidebar-official.tsx
│   ├── chart-area-interactive.tsx
│   ├── data-table-official.tsx (26KB)
│   ├── section-cards.tsx
│   ├── nav-*.tsx (导航组件)
│   ├── site-header-official.tsx
│   └── page-official.tsx
├── tasks/              # 任务管理示例（完整数据表格）
│   ├── data-table.tsx (3.1KB，轻量版)
│   ├── data-table-column-header.tsx
│   ├── data-table-faceted-filter.tsx (筛选器)
│   ├── data-table-pagination.tsx
│   ├── data-table-row-actions.tsx
│   ├── data-table-toolbar.tsx
│   ├── data-table-view-options.tsx
│   ├── columns.tsx (列定义示例)
│   └── schema.ts (数据结构)
├── playground/         # 表单控件示例
│   ├── model-selector.tsx (下拉选择)
│   ├── temperature-selector.tsx (滑块)
│   ├── preset-selector.tsx
│   ├── preset-save.tsx
│   └── code-viewer.tsx
└── authentication/     # 登录表单示例
    ├── user-auth-form.tsx
    └── page.tsx
```

## 组件使用指南

### 1. 数据表格（Data Table）

**场景：数据总表、透视表、任务列表**

有两个版本可选：
- `dashboard/data-table-official.tsx` (26KB) - 功能完整，带虚拟滚动
- `tasks/data-table.tsx` (3.1KB) - 轻量版，适合简单场景

配套工具：
- 列头排序：`tasks/data-table-column-header.tsx`
- 筛选器：`tasks/data-table-faceted-filter.tsx`
- 分页器：`tasks/data-table-pagination.tsx`
- 工具栏：`tasks/data-table-toolbar.tsx`
- 行操作：`tasks/data-table-row-actions.tsx`
- 列可见性：`tasks/data-table-view-options.tsx`

使用步骤：
1. 复制 `tasks/data-table.tsx` 到项目
2. 复制需要的配套工具
3. 参考 `tasks/columns.tsx` 定义列
4. 参考 `tasks/page.tsx` 组装页面

### 2. 卡片布局（Cards）

**场景：KPI 卡片、统计卡片、信息卡**

参考：`dashboard/section-cards.tsx`
- 包含多种卡片样式
- 响应式网格布局
- 数字展示 + 趋势指示器

### 3. 图表（Charts）

**场景：趋势图、面积图、柱状图**

参考：`dashboard/chart-area-interactive.tsx`
- 基于 Recharts
- 带交互和 tooltip
- 响应式容器

### 4. 导航（Navigation）

**侧边栏导航：**
- `dashboard/app-sidebar-official.tsx` - 主侧边栏
- `dashboard/nav-main.tsx` - 主导航
- `dashboard/nav-documents.tsx` - 文档导航
- `dashboard/nav-secondary.tsx` - 次要导航
- `dashboard/nav-user.tsx` - 用户菜单

**顶部导航：**
- `dashboard/site-header-official.tsx` - 站点头部

### 5. 表单控件（Form Controls）

**选择器：**
- `playground/model-selector.tsx` - 下拉选择（带搜索）
- `playground/preset-selector.tsx` - 预设选择器

**滑块：**
- `playground/temperature-selector.tsx` - 数值滑块

**表单：**
- `authentication/user-auth-form.tsx` - 登录表单（含验证）

### 6. 操作按钮（Actions）

参考：`playground/preset-actions.tsx`
- 保存、分享、删除等操作
- 带确认对话框
- 图标 + 文字

## 开发流程

### ✅ 正确做法

1. **先查这个目录** - 看有没有类似的官方组件
2. **整个复制** - 把源码复制到项目里
3. **改数据源** - 把示例数据改成真实 API
4. **改文案** - 翻译成中文
5. **微调样式** - 根据 D-CON 规范调整颜色

### ❌ 错误做法

- ❌ 对照着写一个类似的
- ❌ 只看一眼然后自己实现
- ❌ 改太多破坏原有结构

## 常见场景映射

| 需要实现的功能 | 参考组件 |
|---|---|
| 数据总表（排序、筛选、分页） | `tasks/data-table.tsx` + 工具链 |
| KPI 卡片 | `dashboard/section-cards.tsx` |
| 趋势图 | `dashboard/chart-area-interactive.tsx` |
| 侧边栏导航 | `dashboard/app-sidebar-official.tsx` |
| 顶部导航 | `dashboard/site-header-official.tsx` |
| 下拉选择 | `playground/model-selector.tsx` |
| 数值滑块 | `playground/temperature-selector.tsx` |
| 登录表单 | `authentication/user-auth-form.tsx` |

## 注意事项

1. **依赖检查** - 复制组件后检查 import，确保依赖已安装
2. **类型定义** - 注意组件的 TypeScript 类型定义
3. **数据格式** - 参考 `tasks/schema.ts` 了解数据结构
4. **响应式** - 官方组件都是响应式的，不要破坏
5. **无障碍** - 官方组件有完整的 a11y，保留这些属性

## 扩展资源

- 官方文档：https://ui.shadcn.com
- 中文文档：https://www.shadcn.com.cn
- GitHub：https://github.com/shadcn-ui/ui
- 在线示例：https://ui.shadcn.com/examples

---

**记住：能复制粘贴的绝不手写！**
