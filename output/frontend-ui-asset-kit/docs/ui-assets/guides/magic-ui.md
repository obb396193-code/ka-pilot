# Magic UI 官方使用与适配指南

> 最后核验：2026-08-19  
> 目录：`../catalogs/magic-ui.json`（Free 247）+ `../catalogs/magic-ui-pro.json`（公开下限 104）
> 定位：Bento、数字/文字效果、局部反馈与轻量高级视觉

## 安装与获取

Magic UI 提供 shadcn-compatible Registry：

```bash
npx shadcn@latest view @magicui/magic-card --cwd apps/web
npx shadcn@latest add @magicui/magic-card --cwd apps/web
```

使用前从完整 Registry 目录查看 UI item 和 example，不只复制文档中的一段截图。

免费 Registry 为 77 UI + 168 examples + 1 lib + 1 空 style manifest。Pro 没有公开总 Registry：当前 12 个公开 section 页面可复现至少 95 个 block，官网另公开 9 个模板名（文案为 9+）；其中 Portfolio、Changelog、Blog 有官方公开仓库，其余至少 6 个模板需要 Pro。未授权 Pro Registry 返回 401，需要 `MAGICUI_PRO_REGISTRY_TOKEN`。

## 使用与组合

- Magic UI 源码复制进项目后可直接调整；适合 spotlight card、Bento、数字/文字/滚动反馈。
- 优先选“帮助理解状态或层级”的动效，不把营销页强动效原样搬进数据密集后台。
- 同类能力若 Aceternity/React Bits 也有，第一次引入时按对比模板给老板看真实预览。

## 修改与适配

1. 把颜色/边框/阴影接项目语义 token。
2. 保留组件的尺寸/observer/motion 生命周期，避免重复注册滚动监听。
3. 统一 `prefers-reduced-motion`，禁用路径不能丢信息。
4. 一个页面最多一个主要视觉动效；表格单元格内避免常驻高频动画。
5. 放 `components/motion/magic-ui/`，业务触发状态放 adapter。

## 许可证

免费官方仓库为 MIT。Registry item 引用的外部图标、字体、图片和依赖仍需逐项核验。Pro 采用商业许可，允许项目使用/修改但禁止源码再分发；公开模板仓库也必须逐仓检查 LICENSE，不能因公开就自动推断 MIT。

## 更新与变更

Magic UI 以 Registry/仓库更新为主。更新时对比 item JSON、dependencies 和本地文件；跑 hydration、observer cleanup、reduced-motion、light/dark 和移动端性能测试。

## 官方来源

- Docs：<https://magicui.design/docs>
- Components：<https://magicui.design/docs/components>
- Registry：<https://magicui.design/r/registry.json>
- Repository/license/changes：<https://github.com/magicuidesign/magicui>
- Pro preview：<https://pro.magicui.design/>
- Pro installation：<https://pro.magicui.design/docs/installation>
- Pro license：<https://pro.magicui.design/license>
