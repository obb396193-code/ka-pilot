# 前端规范实验室（临时 Demo）

入口：[打开 index.html](index.html)

它把 `frontend-product-standard.md` 中的文字、数字、布局、密度、主题和动画规则做成可交互样张，用于老板和前端在正式实现前判断效果。它不是最终产品皮肤，也不进入 `apps/web`。

## 可以操作

- 纸面 / 夜间 / 信号三套临时主题。
- compact / default / comfortable 三档密度。
- 90%–112% 字号缩放。
- full / reduced / off 三档 motion。
- 文字和数字动画重播。
- Storybook 状态样张切换。

## 数据与来源

- 页面业务数据全部是显式脱敏假数据。
- Motion Primitives、Animate UI 两个 iframe 读取 `../live-previews/frames/` 中已经存在的离线官方源码预览。
- 其余文字/数字动画是规范效果样张，用来比较使用场景，不冒充第三方官方实现。
- ECharts 区是无依赖 SVG 规范样张；真实产品仍按 `frontend-product-standard.md` 使用 ECharts。

## 验证

```bash
node --test docs/frontend/ui-assets/standards-demo/standards-demo.test.mjs
```

最终是否采用某一字体、字号、间距、颜色或动效，仍需在真实产品页面跨桌面/移动、多主题和完整状态复核。

