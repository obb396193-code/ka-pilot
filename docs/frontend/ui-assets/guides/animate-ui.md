# Animate UI 官方使用与适配指南

> 最后核验：2026-08-19  
> 目录：`../catalogs/animate-ui.json`（580）  
> 定位：选择性微交互库；只补按钮、展开、数字、反馈等局部动效

## 安装与获取

Registry 包含 components、primitives、demos、hooks、style 和大量 icons。只缓存/接入经页面选型的少量条目：

```bash
npx shadcn@latest view https://animate-ui.com/r/components-buttons-button.json --cwd apps/web
npx shadcn@latest add https://animate-ui.com/r/components-buttons-button.json --cwd apps/web
```

demo 与 primitive 是可分别安装的 Registry item，但 demo 不是新的业务能力；选型时优先落核心 primitive/component，避免把示例依赖链全部带入。

## 使用与组合

- 仅用于状态变化提示、数字过渡、按钮反馈、展开/收起等能帮助理解的微交互。
- 与 Aceternity、Magic UI、React Bits、Motion Primitives 同能力时并排预览后选择，不叠加多个动效库。
- 报表、表格和操作流以稳定性为先；装饰背景不进入数据密集主工作区。

## 修改与适配

1. 使用项目 token，不复制独立主题。
2. 支持 `prefers-reduced-motion`，关闭非必要动画后功能仍完整。
3. 动画不得阻塞输入、焦点、点击或读屏状态；离场动画不能延迟关键提交结果。
4. 控制 motion bundle 与客户端边界，测低性能设备和移动端。
5. icon 动画只在明确状态语义中使用，不替代文本标签。

## 许可证

许可证是 MIT + Commons Clause：可用于本产品应用，但禁止将组件库本身作为产品销售或再分发。源码缓存、内部适配和最终应用使用均保留来源；不得对外发布本地 Registry 镜像。

## 更新与变更

更新时对照 Registry/仓库并回归 reduced-motion、焦点和 bundle。

## 官方来源

- Installation：<https://animate-ui.com/docs/installation>
- Components：<https://animate-ui.com/docs/components>
- Primitives：<https://animate-ui.com/docs/primitives>
- Accessibility：<https://animate-ui.com/docs/accessibility>
- Registry：<https://animate-ui.com/r/registry.json>
- Repository / License：<https://github.com/imskyleen/animate-ui>
