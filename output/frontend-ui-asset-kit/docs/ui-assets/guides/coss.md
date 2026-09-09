# coss/ui 官方使用与适配指南

> 最后核验：2026-08-19  
> 目录：`../catalogs/coss.json`（current 577）+ `../catalogs/coss-origin.json`（legacy 646）
> 定位：投放平台细节组件优先库

## 安装与获取

coss 支持 shadcn CLI 单项安装、手工复制和官方 Code/Markdown：

```bash
npx shadcn@latest view @coss/calendar --cwd apps/web
npx shadcn@latest view @coss/p-date-picker-2 --cwd apps/web
npx shadcn@latest add @coss/p-date-picker-2 --cwd apps/web
```

新项目可以 `init @coss/style`，现有项目也可以全量 `add @coss/ui`，但**本项目不执行这两个全量命令**，避免覆盖当前 shadcn 主底座；只按需 inspect/add 单项，在干净 worktree 生成后迁入 `components/coss/`。

Date Picker 不是 `@coss/date-picker` primitive。官方 Registry 当前有 `p-date-picker-1…9`；其中 `p-date-picker-2` 是日期范围，依赖 Calendar、Popover、Button。

Origin 是官方 Roadmap 明确保留的 legacy snapshot，不是会员资产。它另有 599 个 `comp-*` 成品与 47 个 primitives/hooks/libs，共 646 个公开 item JSON；只在 current coss 找不到合适实现时再查。`p-input-group-25` 虽仍能公开访问，但已从 current Registry/源码删除，只能标 deprecated orphan，不能计入 current 577。

## 使用与组合

- coss primitives 基于 Base UI；Particles 是真实业务组合例子，开发细节交互时优先查 Particles。
- styled component 适合默认场景；需要特殊组合时可用其 re-export 的 Base UI primitive。
- trigger composition 使用 Base UI `render`，不是 Radix `asChild`。
- 官方迁移重点：`asChild → render`、部分 `onSelect → onClick`、Select 使用 items-first pattern、ToggleGroup `type → multiple`、Slider 值模型不同。
- Dialog/Sheet/Drawer、Field/Form 等必须按官方 section/composition 结构使用，避免焦点和验证关系被拆坏。

## 修改与适配

官方样式沿用 shadcn CSS variables，并增加：

- `--destructive-foreground`；
- `--info/--info-foreground`；
- `--success/--success-foreground`；
- `--warning/--warning-foreground`；
- `--font-sans`、`--font-heading`、`--font-mono`。

Base UI portal 需要应用根 wrapper `isolation: isolate`；官方还建议 body `position: relative` 处理 iOS Safari backdrop。迁入本项目时：

1. 把新增 token 映射到项目语义层；
2. 保留 `render`、portal、focus、items/value API；
3. 中文、密度、日期格式/时区、业务 presets 放业务薄封装；
4. coss 文件放 `components/coss/`，内部 import 一并修正；
5. 同页和 Radix overlay 组合时专门测 stacking/focus。

## 许可证

coss 仓库采用混合许可证：仓库默认 AGPL-3.0，官方 `LICENSING.md` 明确 `apps/ui` 和 legacy `apps/origin` 保持 MIT。每个复制文件必须确认来自 MIT 范围或官方 UI Registry，并记录路径；不要从仓库其他目录顺手复制 AGPL 文件。

## 更新与变更

官方 changelog 已出现 Base UI API、OTP Field、Table variant、React DayPicker 10 等破坏性变化。更新 vendored 文件时：

- 对照 changelog 和单项 Registry diff；
- Calendar/DatePicker 特别核 `@daypicker/react` major；
- 不全量 overwrite；
- 更新 manifest/ref 后跑 focus、range、portal、mobile Safari 和多主题回归。

## 官方 Agent 资料

coss 提供 Agent Skill、`llms.txt` 和每页 Copy Markdown。官方 Skill 覆盖 53 primitives、Base UI 迁移、token 与 Particles pattern；前端 Agent 可按需读取，但项目硬规则仍以 `apps/web/AGENTS.md` 为准。

## 官方来源

- Get Started：<https://coss.com/ui/docs/get-started>
- Components：<https://coss.com/ui>
- Particles：<https://coss.com/ui/particles>
- Styling：<https://coss.com/ui/docs/styling>
- Migration：<https://coss.com/ui/docs/radix-shadcn-migration>
- Skills：<https://coss.com/ui/docs/skills>
- `llms.txt`：<https://coss.com/ui/llms.txt>
- Changelog：<https://coss.com/ui/docs/changelog>
- Origin/roadmap：<https://coss.com/ui/docs/roadmap>
- Origin source：<https://github.com/cosscom/coss/tree/main/apps/origin>
- Repository/licensing：<https://github.com/cosscom/coss/blob/main/LICENSING.md>
