# React Bits 官方使用与适配指南

> 最后核验：2026-08-19  
> 目录：`../catalogs/react-bits.json`（Free 166）+ `../catalogs/react-bits-pro.json`（Pro 702）
> 定位：偶尔使用的文字、背景、光标和交互动效

## 安装与获取

免费 React Bits 每项通常提供四种代码变体：JS-CSS、JS-TW、TS-CSS、TS-TW。本项目默认先看 TypeScript + Tailwind：

```bash
npx shadcn@latest view @react-bits/BlurText-TS-TW --cwd apps/web
npx shadcn@latest add @react-bits/BlurText-TS-TW --cwd apps/web
```

也可从官方页面手工复制。React Bits Pro 使用独立受鉴权 Registry 和 license key，不能把 Pro 当免费目录 item。

Pro 当前公开目录为 134 Animated Components（Starter）、238 Page Blocks + 300 App UI + 19 Agent Kit（Pro）、11 Templates（Ultimate），合计 702。公开名称和预览可用于选型，源码只在取得相应 license key 后下载到项目。

## 使用与组合

- 官方目录分 Text Animations、Animations、Components、Backgrounds。
- 每项依赖不同；WebGL/canvas/physics/GSAP 类效果必须先 inspect 依赖和 SSR 条件。
- 适合局部状态、空态、欢迎/Agent、少量背景；不作为表格和表单的基础交互层。
- 同页避免多个持续 canvas/WebGL 效果竞争资源。

## 修改与适配

官方强调 fully customizable、可编辑源码。项目规则：

1. 首选 TS-TW 变体，避免同一效果保留四份源码；
2. props、颜色和尺寸接项目 token；
3. 补 `prefers-reduced-motion`、暂停/卸载 cleanup 和移动端降级；
4. 需要 window/canvas 的组件用 client boundary，必要时 dynamic import；
5. 放 `components/motion/react-bits/`，不污染 shadcn primitives。

## 许可证

免费 React Bits 为 MIT + Commons Clause，官方说明可个人和商业使用；不得把其源码作为竞争性组件库/服务重新销售或再分发。React Bits Pro 是独立付费许可与受鉴权 Registry，未购买时只保留目录/预览信息。

## 更新与变更

免费目录增长频繁，刷新官方仓库 `src/content` 并按 capability 去重；本地更新需核四变体差异、依赖 major、cleanup、SSR/hydration、reduced-motion 和性能。

## 官方来源

- Free catalog/docs：<https://reactbits.dev/>
- Free repository：<https://github.com/DavidHDev/react-bits>
- Installation 示例：<https://github.com/DavidHDev/react-bits#installation>
- Free license：<https://github.com/DavidHDev/react-bits/blob/main/LICENSE.md>
- Pro installation/边界：<https://pro.reactbits.dev/docs/installation>
- Pro license：<https://pro.reactbits.dev/license>
