# Motion Primitives 官方使用与适配指南

> 最后核验：2026-08-19  
> 目录：`../catalogs/motion-primitives.json`（33）  
> 定位：选择性轻量 Motion primitive；用于文字、数字、Disclosure 等局部过渡

## 安装与获取

官网 Registry 可能对自动客户端限流，因此目录以官方仓库 `public/c/registry.json` 为权威刷新源；实际组件仍按官方单项 URL inspect/add：

```bash
npx shadcn@latest view https://motion-primitives.com/c/text-effect.json --cwd apps/web
npx shadcn@latest add https://motion-primitives.com/c/text-effect.json --cwd apps/web
```

核心依赖为 `motion`。若页面尚未使用 Motion，先比较交互收益和 bundle 成本。

## 使用与组合

- 适合数字变化、文字进入、Disclosure、Carousel 等单一明确过渡。
- 与 Animate UI/React Bits 重叠时，只保留更贴合业务、依赖更小、无障碍更完整的一种。
- 不用它重写 Kibo/Dice 已自带的复杂拖拽或弹层动画。

## 修改与适配

1. 颜色和排版继承项目 token，运动参数集中到 motion token。
2. 支持 reduced-motion；动画关闭后内容顺序和交互不变。
3. 数字动画保留真实可访问文本，不能让读屏逐帧播报。
4. Disclosure/Carousel 保留焦点、aria 和键盘操作。
5. 迁入源码保留官方 Registry URL、仓库 ref、hash 和本地适配说明。

## 许可证

官方仓库为 MIT。官网 429/403 只表示自动访问限流，不是会员付费边界。

## 更新与变更

更新以官方仓库 Registry 和 commits 为准；回归 motion 版本、hydration、reduced-motion、焦点和性能。

## 官方来源

- Docs：<https://motion-primitives.com/docs>
- Installation：<https://motion-primitives.com/docs/installation>
- Official Registry source：<https://raw.githubusercontent.com/ibelick/motion-primitives/main/public/c/registry.json>
- Repository / License：<https://github.com/ibelick/motion-primitives>
