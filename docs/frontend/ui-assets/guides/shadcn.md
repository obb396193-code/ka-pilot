# shadcn/ui 官方使用与适配指南

> 最后核验：2026-08-19  
> 目录：`../catalogs/shadcn.json`  
> 定位：全站基础层、页面壳、官方 Blocks

## 安装与获取

当前项目已经有 `apps/web/components.json`，style 为 `new-york-v4`。先查看再加入：

```bash
npx shadcn@latest info --cwd apps/web
npx shadcn@latest view <item> --cwd apps/web
npx shadcn@latest search @shadcn -q "<能力词>"
npx shadcn@latest add <item> --cwd apps/web
```

官方 bare name 指向 shadcn item；第三方使用 `@namespace/item`、GitHub address 或完整 Registry URL。`components.json` 的命名空间 URL必须包含 `{name}`。

## 使用与组合

- shadcn 是 open code/distribution platform，不是只能通过 npm 黑盒调用的组件包；源码进入项目后由项目持有。
- 官方 Blocks 是完整页面组合，优先复制 Block 后替换数据/文案，不根据截图重新画。
- 当前 New York v4 主路径使用 Radix 行为模型；trigger 组合遵循相应组件的 `asChild`/Slot 契约。
- 先用 primitives 组合业务模块，再在 `components/business/` 增加业务语义，不建立一套重复的万能 primitives。

## 修改与适配

官方明确支持修改、扩展和自有化源码：

- Tailwind v4 语义 token 通过 CSS variables + `@theme inline` 注册；
- variants 优先在原组件的 `cva` 定义中扩展；
- `--radius` 控制全局圆角，组件由它派生尺寸；
- 可改 token、variant、尺寸、图标、文案和组合；
- 修改 overlay/焦点/键盘/ARIA 之前先核对 Radix 原始行为和官方例子。

项目规则：shadcn/Radix 只放 `components/ui/`；第三方 Base UI 文件不得覆盖同名路径。

## 许可证

官方仓库为 MIT。复制源码需保留项目的第三方许可证记录和上游 URL。社区 Registry 不自动继承 shadcn 的 MIT，必须逐个核其自身许可证。

## 更新与变更

shadcn 源码复制后不会自动升级。更新流程：

1. `view` 新版本并和本地 vendored 文件 diff；
2. 查看 shadcn releases/changelog 与对应 primitive 变更；
3. 逐文件合并，不用 `--overwrite` 粗暴覆盖项目修改；
4. 跑 lint/build/键盘/多主题/页面回归；
5. 更新 manifest 的上游 ref 和本地修改说明。

## 官方来源

- 文档：<https://ui.shadcn.com/docs>
- Components：<https://ui.shadcn.com/docs/components>
- Blocks：<https://ui.shadcn.com/blocks>
- Registry 规则：<https://github.com/shadcn-ui/ui/blob/main/skills/shadcn/registry.md>
- Customization：<https://github.com/shadcn-ui/ui/blob/main/skills/shadcn/customization.md>
- 官方 Agent Skill：<https://github.com/shadcn-ui/ui/blob/main/skills/shadcn/SKILL.md>
- 仓库/许可证/更新：<https://github.com/shadcn-ui/ui>

