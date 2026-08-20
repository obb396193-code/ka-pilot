# 17 库代表预览官方证据

> 核验日期：2026-08-20
> 用途：只决定离线比较墙的 1–2 个代表能力，不改变 7,056 条全量目录计数。

## 选择规则

- 只使用官方 Registry、官方仓库或官方发布包中公开可取得的源码。
- 代表项优先体现该产品线的差异，不强迫 17 家展示同一个组件。
- `live` 仅表示可从隔离缓存构建离线预览，不表示安装进产品运行时。
- 付费、未授权或没有明确复用许可证的源码不缓存、不仿写。

## 17 条产品线

| 产品线 | 代表项 | 公开证据与边界 |
|---|---|---|
| shadcn | `calendar-demo` + `calendar` | 官方 New York v4 Registry；MIT。 |
| coss current | `p-date-picker-2` | 官方 current Registry；`apps/ui` MIT，仓库根 AGPL-3.0 边界保留。 |
| coss Origin | `comp-100` + `button` | `https://coss.com/origin/r/comp-100.json` 实测公开；Origin MIT，legacy/limited support。 |
| ReUI | `c-data-grid-27` | 官方 Free Registry，MIT；只使用已缓存 Free 源码，不调用 Pro key endpoint。 |
| Tremor current | `kpi-card-01` | 官方 tremor-blocks 源码；Apache-2.0。 |
| Tremor legacy | `@tremor/react@3.18.7` Card/Metric | npm 官方包仍可下载，Registry 元数据标 Apache 2.0；只作 legacy 比较。 |
| Aceternity | `bento-grid` | 官方 Free Registry；MIT Free 边界，未读取 Pro；选择无远程渲染依赖的代表项保证离线复现。 |
| Magic UI Free | `number-ticker` | 官方 Free Registry；MIT。 |
| Magic UI Pro | public `blog-template` 的 `flickering-grid.tsx` | 官方 `magicuidesign/blog-template` 公开仓库 README 与 LICENSE 为 MIT；仅代表公开模板，不代表取得 101 个私有 Pro blocks。 |
| React Bits Free | `Counter` | 官方公开仓库源码；MIT + Commons Clause 限制继续标注。 |
| React Bits Pro | 702 Pro variants | 全部为付费许可后源码；唯一 `blocked-paid` 卡，不产生本地文件。 |
| tweakcn | `modern-minimal` + `defaultPresets` | 官方 preset 源，MIT；用于 token 切换，不另造组件底层。 |
| AI Elements | Conversation + Sources | 官方 Registry 缓存，Apache-2.0；复用现有 frame。 |
| Kibo UI | Dropzone + Color Picker | 官方 Registry 缓存，MIT；复用现有 frame。 |
| Dice UI | File Upload + Kanban | 官方 Registry 缓存，MIT；复用现有 frame。 |
| Animate UI | Ripple + Counting Number | 官方 Registry 缓存，MIT + Commons Clause；复用现有 frame。 |
| Motion Primitives | Animated Number + Disclosure | 官方仓库缓存，MIT；复用现有 frame。 |

## 现场实证

- coss Origin `comp-100.json` 返回 `registry:component`，源码以 `useState` 驱动可访问的菜单开关按钮，并只依赖公开 `button.json`。
- shadcn `calendar-demo.json` 返回 `registry:example`，依赖公开 `calendar` Registry item。
- npm Registry 的 `@tremor/react@3.18.7` 元数据给出 Apache 2.0、固定 tarball、SHA-512 integrity 和 436 个文件；预览只取 Card/Metric 的官方发布实现。
- Magic UI 官方 `blog-template` 仓库公开 `components/magicui/flickering-grid.tsx`，仓库 README 明确 MIT；私有 Pro Registry 仍不访问。

## 不可越过的边界

- React Bits Pro 不缓存、不生成 frame。
- Magic UI Pro 卡只展示公开 MIT template 的特征，并在标题与说明中明确“Public Template”；不能把它说成私有 Pro block 已获取。
- Tremor legacy 只展示固定 3.18.7 版本，不把仍在线文档说成当前推荐版本。
- coss Origin 与 current 独立展示，禁止同名文件覆盖。
