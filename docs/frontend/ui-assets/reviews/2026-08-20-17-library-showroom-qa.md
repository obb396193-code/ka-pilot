# 17 库官方源码比较墙终验

- 日期：2026-08-20
- 产物：`docs/frontend/ui-assets/showroom.html#discovery`
- 结论：通过

## 机械契约

- 比较位置：17
- 实时官方源码 frame：16
- 付费锁定位置：1（React Bits Pro）
- 代表官方资产：27
- frame sandbox：全部严格为 `allow-scripts`
- frame CSP：禁止网络；CSS 与 JavaScript 内联，适配 `file://`
- React Bits Pro：缓存、bundle、frame 均为 0

## 真实 Chrome `file://` 验收

直接打开：

```text
file:///Users/aik/Desktop/投放agent/docs/frontend/ui-assets/showroom.html#discovery
```

使用本机 Google Chrome 真实引擎分别在 1440×900 和 390×844 验证：

- 基础组件：3/3 frame 非空（shadcn、coss current、coss Origin）
- 数据业务：5/5 frame 非空（ReUI、Tremor current、Tremor legacy、Kibo、Dice）
- 动效视觉：6/6 frame 非空（Aceternity、Magic Free、Magic public template、React Bits Free、Animate、Motion Primitives）
- Agent：1/1 frame 非空（Vercel AI Elements）
- 主题系统：1/1 frame 非空（tweakcn）
- 主文档和全部 16 个 frame 在两个视口的 `scrollWidth-clientWidth` 均为 0
- 控制台 error：0
- HTTP(S) 请求：0

## 交互验收

- coss Date Range：键盘 Enter 打开 Popover，`aria-expanded=false→true`
- coss Origin：菜单按钮 `Open menu→Close menu`
- AI Elements：Sources 折叠状态 `true→false`
- tweakcn：当前主题 `Modern Minimal→Violet Bloom`
- 付费筛选：从其他分组进入“只看付费锁定”后自动回到全组口径，精确显示 React Bits Pro 1 张卡、0 个 frame

## 本轮发现并修复

1. “只看付费锁定”原先会和前一个分组叠加，可能错误显示 0；现已重置分组并补静态回归断言。
2. ReUI 官方虚拟表格在 390px frame 内把文档撑宽；现只在 ReUI demo card 内提供横向滚动，frame 与主页面不再溢出，不改官方表格源码。

预览通过不等于运行时已安装。产品接入仍从隔离官方源码缓存复制，并完成依赖、token、许可证、可访问性和业务契约适配。
