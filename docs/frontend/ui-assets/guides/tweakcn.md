# tweakcn 官方使用与适配指南

> 最后核验：2026-08-19  
> 目录：`../catalogs/tweakcn.json`（官方 defaultPresets 42 项）  
> 定位：运行时多风格 token 的核心来源与可视化编辑器

## 安装与获取

tweakcn 是 shadcn/Tailwind 的视觉主题编辑器，不是替换组件行为的 UI primitive 包。官方预设源码位于：

```text
https://github.com/jnsahaj/tweakcn/blob/main/utils/theme-presets.ts
```

在官网选择 preset 或修改 token，通过 Code/share 功能取得 CSS variables；项目必须记录 preset key、share/source URL、Tailwind/color format 和本地修改。

## 使用与组合

- tweakcn 主要控制 background/foreground/card/popover/primary/secondary/muted/accent/destructive/border/input/ring、chart、sidebar、font、radius、shadow 等语义 token。
- 主题改变视觉，不应改变页面对象、数据结构、权限和功能。
- 官方 preset 可作为起点，不要求原样照搬；项目发布的是经过组件展厅和核心页面验证的主题包。

## 修改与适配

项目运行时方案（基于官方 token，属于本项目适配规则）：

1. 用 `data-theme` 选择主题，另用 `data-density`、`data-motion` 解耦密度和动效。
2. 同一组件树切 token，不复制 42 套页面。
3. 将 coss 新增 info/success/warning token 和 ECharts token bridge 一并映射。
4. 保留 light/dark、字体加载、radius、shadow 和 sidebar token；缺 token 的 preset 不发布。
5. 主题切换防 hydration flash，并尊重 reduced-motion。

## 许可证

tweakcn 官方仓库为 Apache-2.0。社区用户发布的主题、字体和图片可能有单独条款；默认只把官方 defaultPresets 视为 Apache-2.0 范围，社区主题逐项核验。

## 更新与变更

官方没有承诺稳定的“全部社区主题 API”。目录完整性口径是：

- 官方仓库 `defaultPresets` 全收；
- 社区动态主题只保留入口或按已批准的 theme id 收录；
- 刷新时比较 preset key、token 完整性和许可证，不因为社区数量变化清空旧快照。

任何 preset 更新后都要回归 shadcn、coss、ReUI、ECharts、light/dark 和核心数据页。

## 官方来源

- Editor：<https://tweakcn.com/editor/theme>
- Product：<https://tweakcn.com/>
- Repository：<https://github.com/jnsahaj/tweakcn>
- Default presets：<https://github.com/jnsahaj/tweakcn/blob/main/utils/theme-presets.ts>
- License：<https://github.com/jnsahaj/tweakcn/blob/main/LICENSE>
- Changes：<https://github.com/jnsahaj/tweakcn/commits/main>

