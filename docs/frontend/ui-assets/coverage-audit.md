# UI 资产官方覆盖与访问边界审计

> 核验快照：2026-08-19T15:29:07.580Z
> 目录总量：7,056；全量源码缓存：0

目录项是可搜索元数据，不等于源码已下载。付费资产只记录公开名称、预览、产品层级和官方获取入口；未绕过登录、401 或会员限制。

## 总表

| 来源 | 目录项 | 公开源码 | 公开元数据 | 购买后源码 | 覆盖口径 |
|---|---:|---:|---:|---:|---|
| shadcn | 473 | 414 | 59 | 0 | complete-new-york-v4-plus-logical-index |
| coss | 577 | 570 | 7 | 0 | complete-current-registry |
| coss-origin | 646 | 646 | 0 | 0 | complete-legacy-registry |
| reui | 2315 | 1149 | 0 | 1166 | complete-official-llms-index |
| tremor | 375 | 375 | 0 | 0 | complete-current-public-surfaces |
| tremor-legacy | 30 | 30 | 0 | 0 | complete-live-legacy-docs |
| aceternity | 319 | 112 | 0 | 207 | complete-to-ai-index |
| magic-ui | 247 | 246 | 1 | 0 | complete-free-registry |
| magic-ui-pro | 104 | 3 | 0 | 101 | partial-public-docs-lower-bound |
| react-bits | 166 | 166 | 0 | 0 | complete-free-repository |
| react-bits-pro | 702 | 0 | 0 | 702 | complete-public-pro-index |
| tweakcn | 42 | 42 | 0 | 0 | complete-default-presets-partial-dynamic-community |
| ai-elements | 136 | 136 | 0 | 0 | complete-official-runtime-registry |
| kibo-ui | 69 | 40 | 29 | 0 | complete-current-registry-plus-public-block-docs |
| dice-ui | 242 | 242 | 0 | 0 | complete-current-radix-registry |
| animate-ui | 580 | 579 | 1 | 0 | complete-current-registry |
| motion-primitives | 33 | 33 | 0 | 0 | complete-official-repository-registry |

## 不能混算的数量

- shadcn 的 5,120 是 24 套 preset 的 variant records，不是 5,120 个不同组件；逻辑目录与 variant 矩阵分开保存。
- ReUI 的 2,552 是 638 个图标 × 4 种样式的渲染变体；目录按 638 个图标概念计数。
- Magic UI Pro 的 104 是公开可复现下限（95 blocks + 9 observed templates），不是官方 Pro 总量。
- tweakcn 社区主题是动态集合，没有稳定有限总数；42 仅指官方 defaultPresets。

## 逐库边界

### shadcn

New York v4 complete Registry plus current logical UI index

已知目录外/另算：

- 24 preset variants contain 5,120 implementation/config records but only 216 deduplicated names; stored as a variant matrix, not unique assets.
- Registry Directory lists 280 third-party providers; their internal counts, prices and authentication are not supplied by shadcn.
- Official Figma page lists 3 free and 7 paid third-party kits; these are discovery metadata, not first-party code items.

未消解：

- Third-party Registry Directory provider inventories require per-provider audits.

官方证据：

- <https://ui.shadcn.com/r/styles/new-york-v4/registry.json>
- <https://ui.shadcn.com/r/index.json>
- <https://ui.shadcn.com/r/config.json>

### coss

Complete current coss/ui Registry

已知目录外/另算：

- Deprecated orphan p-input-group-25 remains publicly reachable but is excluded from the current 577.

未消解：

- Future atoms mentioned on the roadmap have no published count or Registry.

官方证据：

- <https://coss.com/ui/r/registry.json>
- <https://coss.com/ui/docs/roadmap>

### coss-origin

Complete preserved Origin public Registry snapshot

已知目录外/另算：

- Two repo-only internal sources, resizable and toaster, have no public item JSON and are not counted in the 646 Registry items.

官方证据：

- <https://github.com/cosscom/coss/tree/main/apps/origin>
- <https://github.com/cosscom/coss/blob/main/apps/origin/config/components.ts>

### reui

Official Registry plus llms.txt product index

已知目录外/另算：

- 16 Base/Radix style variants are stored as a matrix.
- 638 icon concepts produce 2,552 style variants; the catalog counts concepts once.

官方证据：

- <https://reui.io/llms.txt>
- <https://reui.io/r/registry.json>
- <https://reui.io/pricing>

### tremor

Current Raw, Blocks and Templates public surfaces

已知目录外/另算：

- Dashboard OSS is recorded as a related variant, not a seventh unique current template.

未消解：

- The template-dashboard README retains old commercial wording while its current LICENSE.md is MIT.

官方证据：

- <https://www.tremor.so/docs>
- <https://blocks.tremor.so/blocks>
- <https://blocks.tremor.so/templates>

### tremor-legacy

Still-live @tremor/react 3.18.7 documentation

未消解：

- No official deprecated declaration was found; maintenance-stale is an evidence-based status, not a deprecation claim.

官方证据：

- <https://npm.tremor.so/sitemap.xml>
- <https://www.npmjs.com/package/@tremor/react/v/3.18.7>

### aceternity

Complete to the official AI recommendations index

未消解：

- Pricing says 200+ premium blocks while the public AI index enumerates 167 leaf blocks; a paid account would be needed to reconcile the product pack.

官方证据：

- <https://ui.aceternity.com/ai-recommendations>
- <https://ui.aceternity.com/pricing>
- <https://ui.aceternity.com/licence>

### magic-ui

Complete free Registry

官方证据：

- <https://magicui.design/r/registry.json>
- <https://github.com/magicuidesign/magicui>

### magic-ui-pro

Public documentation lower bound, not a complete Pro manifest

已知目录外/另算：

- 95 exact public block slugs and 9 observed template names are catalogued; 3 templates have public official repositories.

未消解：

- Official copy says 50+ sections and 9+ templates but exposes no total Registry; unknown additional assets remain outside the lower-bound catalog.

官方证据：

- <https://pro.magicui.design/>
- <https://pro.magicui.design/sitemap.xml>
- <https://pro.magicui.design/docs/installation>

### react-bits

Complete free repository capability set, four code variants deduplicated

官方证据：

- <https://github.com/DavidHDev/react-bits>
- <https://reactbits.dev/get-started/installation>

### react-bits-pro

Complete public Pro documentation asset index

官方证据：

- <https://pro.reactbits.dev/>
- <https://pro.reactbits.dev/sitemap.xml>
- <https://pro.reactbits.dev/docs/installation>

### tweakcn

Complete 42 defaultPresets; dynamic community is a separate discovery surface

已知目录外/另算：

- Anonymous community themes are cursor-paginated and continuously growing; no stable finite total or promised public Registry API exists.

未消解：

- A community snapshot can be taken for a dated design review but cannot be called permanent full coverage.

官方证据：

- <https://github.com/jnsahaj/tweakcn/blob/main/utils/theme-presets.ts>
- <https://tweakcn.com/community>
- <https://tweakcn.com/pricing>

### ai-elements

Complete deployed runtime Registry: components and examples

已知目录外/另算：

- Documentation headings and prose recipes are not counted as installable assets.

官方证据：

- <https://elements.ai-sdk.dev/api/registry/registry.json>
- <https://github.com/vercel/ai-elements>

### kibo-ui

Current Registry plus finite official block documentation leaves

已知目录外/另算：

- Shadcnblocks patterns are a separate product and are not Kibo Registry assets.

未消解：

- Twenty-eight documented blocks currently return HTTP 500 at sampled /r endpoints, so they remain public-metadata-only.

官方证据：

- <https://www.kibo-ui.com/r/registry.json>
- <https://www.kibo-ui.com/>
- <https://github.com/shadcnblocks/kibo>

### dice-ui

Complete current Radix Registry

已知目录外/另算：

- Base/Radix and Nova/Vega distributions are a variant matrix, not separate logical products.

官方证据：

- <https://diceui.com/r/registry.json>
- <https://github.com/sadmann7/diceui>

### animate-ui

Complete current Registry including demos, hooks, styles and icons

未消解：

- Commons Clause permits application use but prohibits selling or redistributing the component library itself.

官方证据：

- <https://animate-ui.com/r/registry.json>
- <https://github.com/imskyleen/animate-ui>

### motion-primitives

Complete Registry committed in the official repository

未消解：

- The deployed Registry endpoint rate-limits some automated clients; refreshes use the official repository copy.

官方证据：

- <https://raw.githubusercontent.com/ibelick/motion-primitives/main/public/c/registry.json>
- <https://github.com/ibelick/motion-primitives>
