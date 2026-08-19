# Frontend UI Asset Reuse System Implementation Plan

> **For Codex:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. If that skill is unavailable, execute locally in the listed order and preserve the same verification/commit gates.

**Goal:** Build a complete, source-traceable catalog of the selected official UI libraries, make their official usage/adaptation rules searchable by frontend agents, and prove the workflow with a vendored coss date filter plus tweakcn-based runtime themes.

**Architecture:** Store complete upstream capability metadata separately from runtime source. A catalog sync tool normalizes official registries and documented indexes into snapshots; frontend agents search a cross-source capability index before coding. Approved source is vendored into source-isolated directories, wrapped only by thin business adapters, and validated in a theme-aware UI lab.

**Tech Stack:** Next.js 15, React 19, TypeScript, Tailwind CSS v4, shadcn CLI/Registry, Radix UI, Base UI, TanStack Table, ECharts, Node.js built-in test runner.

---

## Preconditions and worktree boundary

- Current `fe/f001` worktree contains unrelated uncommitted frontend route/component changes. Tasks 1–6 add isolated files and may proceed now.
- Tasks 7–10 touch `apps/web` runtime files and must start only after the existing F-001 owner commits/hands off or in a clean `codex/ui-assets` worktree created from the agreed integration base.
- Do not delete or rewrite `.shadcn-reference/` until its owner and usefulness have been audited.
- Every completed task updates `docs/plans/工作台账.md`; each commit stages explicit task files only.

## Task 1: Create the asset knowledge entrypoint and frontend-agent rules

**Files:**

- Create: `docs/frontend/ui-assets/README.md`
- Create: `docs/frontend/ui-assets/agent-workflow.md`
- Create: `docs/frontend/ui-assets/comparison-template.md`
- Create: `apps/web/AGENTS.md`
- Modify: `docs/plans/工作台账.md`

**Step 1: Write the failing documentation check**

Add `apps/web/scripts/ui-catalog/check-agent-entry.mjs` that exits non-zero unless `apps/web/AGENTS.md` links all three documents and contains the keywords `先查目录`, `官方源码`, `多候选对比`, `许可证`.

**Step 2: Run the check and verify it fails**

Run: `node apps/web/scripts/ui-catalog/check-agent-entry.mjs`  
Expected: non-zero with missing-file/missing-rule messages.

**Step 3: Add the minimum rules**

`apps/web/AGENTS.md` must require the frontend agent to:

1. search the catalog before implementing UI;
2. inspect official preview/source/guides;
3. submit a comparison card when two or more qualified sources exist;
4. use an already approved `preferred` asset without re-asking;
5. vendor official source and log provenance;
6. avoid overwriting shadcn primitives with coss/Base UI files;
7. run the validation gate before delivery.

**Step 4: Run the check and verify it passes**

Run: `node apps/web/scripts/ui-catalog/check-agent-entry.mjs`  
Expected: `UI asset agent entry: OK`.

**Step 5: Commit**

```bash
git add apps/web/AGENTS.md apps/web/scripts/ui-catalog/check-agent-entry.mjs docs/frontend/ui-assets/README.md docs/frontend/ui-assets/agent-workflow.md docs/frontend/ui-assets/comparison-template.md docs/plans/工作台账.md
git commit -m "docs: 建立前端UI资产检索与对比规则"
```

## Task 2: Define the normalized catalog schema with tests

**Files:**

- Create: `apps/web/scripts/ui-catalog/catalog.mjs`
- Create: `apps/web/scripts/ui-catalog/catalog.test.mjs`
- Create: `docs/frontend/ui-assets/catalog.schema.json`

**Step 1: Write failing tests**

Use `node:test` to cover:

- normalization of a Registry item into `source/upstream_name/kind/category/preview_url/source_url/install_command/foundation/license/dependencies/project_fit/theme_ready/last_verified/upstream_ref/local_status/local_path`;
- rejection of missing source URLs, license state, verification date or duplicate `(source, upstream_name)`;
- preservation of all upstream items, including items not currently recommended;
- `preferred` requires a decision record and comparison reference.

**Step 2: Run tests**

Run: `node --test apps/web/scripts/ui-catalog/catalog.test.mjs`  
Expected: FAIL because normalizer/validator are absent.

**Step 3: Implement normalizer and validator**

Keep source-specific extraction outside the core schema. Unknown fields stay in `upstream_meta` so refreshes do not silently lose data.

**Step 4: Run tests**

Run: `node --test apps/web/scripts/ui-catalog/catalog.test.mjs`  
Expected: PASS.

**Step 5: Commit**

```bash
git add apps/web/scripts/ui-catalog/catalog.mjs apps/web/scripts/ui-catalog/catalog.test.mjs docs/frontend/ui-assets/catalog.schema.json
git commit -m "feat: 定义UI资产目录标准与校验"
```

## Task 3: Configure and verify complete official source indexes

**Files:**

- Create: `apps/web/scripts/ui-catalog/sources.mjs`
- Create: `apps/web/scripts/ui-catalog/source-health.mjs`
- Create: `docs/frontend/ui-assets/sources.md`
- Create: `docs/frontend/ui-assets/source-health.json`

**Step 1: Add source definitions**

Cover at minimum:

- shadcn/ui Components, Blocks and styles;
- coss/ui registry, Components, Particles, `llms.txt`, migration, styling and changelog;
- ReUI components/blocks/registry and documentation;
- Tremor Blocks/components/templates and license;
- Aceternity free components/blocks/templates, registry/CLI docs and separate Pro license boundary;
- Magic UI registry/components/templates;
- React Bits components/categories/CLI and license terms;
- tweakcn theme presets/editor/docs and source repository.

Each source definition records `catalog_mode` (`registry`, `documented-index`, `repository-index`, `theme-index`), official URL, license URL, guide URLs and whether full source redistribution is allowed.

**Step 2: Add health check**

The check follows redirects, verifies content type, captures ETag/Last-Modified where available, and marks sources `verified`, `partial`, or `blocked`; it must never invent an endpoint.

**Step 3: Run health check**

Run: `node apps/web/scripts/ui-catalog/source-health.mjs --write`  
Expected: every source has a real official endpoint or an explicit `partial/blocked` reason.

**Step 4: Manually audit generated facts**

Verify known anchors:

- coss registry exposes primitives and hundreds of Particles;
- coss Date Picker is a composition of Calendar + Popover + Button, not `@coss/date-picker`;
- paid Aceternity assets are not treated as redistributable free registry items;
- Tremor chart/runtime dependencies are separated from reusable layout Blocks.

**Step 5: Commit**

```bash
git add apps/web/scripts/ui-catalog/sources.mjs apps/web/scripts/ui-catalog/source-health.mjs docs/frontend/ui-assets/sources.md docs/frontend/ui-assets/source-health.json
git commit -m "feat: 接入官方UI资产源健康核验"
```

## Task 4: Sync full catalogs without vendoring all source

**Files:**

- Create: `apps/web/scripts/ui-catalog/sync.mjs`
- Create: `docs/frontend/ui-assets/catalogs/index.json`
- Create: `docs/frontend/ui-assets/catalogs/shadcn.json`
- Create: `docs/frontend/ui-assets/catalogs/coss.json`
- Create: `docs/frontend/ui-assets/catalogs/reui.json`
- Create: `docs/frontend/ui-assets/catalogs/tremor.json`
- Create: `docs/frontend/ui-assets/catalogs/aceternity.json`
- Create: `docs/frontend/ui-assets/catalogs/magic-ui.json`
- Create: `docs/frontend/ui-assets/catalogs/react-bits.json`
- Create: `docs/frontend/ui-assets/catalogs/tweakcn.json`

**Step 1: Write sync fixture tests**

Add fixtures for Registry JSON, docs indexes and repository indexes. Assert that item count and names match fixture inputs and that no current-PRD filter is applied.

**Step 2: Implement deterministic sync**

Requirements:

- sort by `source/kind/category/upstream_name`;
- include `fetched_at`, `upstream_ref` and source hash;
- preserve upstream metadata needed to reconstruct install commands;
- use atomic writes and leave the previous snapshot untouched on a failed source;
- produce an index with counts by source/kind/category and incomplete fields.

**Step 3: Run live sync**

Run: `node apps/web/scripts/ui-catalog/sync.mjs --all --write`  
Expected: all verified sources updated; partial sources retained with an explicit coverage note.

**Step 4: Validate completeness**

Run: `node apps/web/scripts/ui-catalog/sync.mjs --all --check`  
Expected: zero duplicate identities and zero unexplained item-count collapse versus previous snapshot.

**Step 5: Commit**

```bash
git add apps/web/scripts/ui-catalog docs/frontend/ui-assets/catalogs
git commit -m "feat: 生成官方UI能力完整目录"
```

## Task 5: Capture official usage, modification and adaptation rules

**Files:**

- Create: `docs/frontend/ui-assets/guides/shadcn.md`
- Create: `docs/frontend/ui-assets/guides/coss.md`
- Create: `docs/frontend/ui-assets/guides/reui.md`
- Create: `docs/frontend/ui-assets/guides/tremor.md`
- Create: `docs/frontend/ui-assets/guides/aceternity.md`
- Create: `docs/frontend/ui-assets/guides/magic-ui.md`
- Create: `docs/frontend/ui-assets/guides/react-bits.md`
- Create: `docs/frontend/ui-assets/guides/tweakcn.md`
- Create: `docs/frontend/ui-assets/licenses.md`
- Create: `docs/frontend/ui-assets/changelog-watch.md`

**Step 1: Build one guide per source**

Every guide contains only attributable facts and actionable project rules:

- official install/inspect/copy commands;
- composition API and common migration traps;
- token/font/dark-mode/portal/animation conventions;
- what may be modified and what behavior should be preserved;
- accessibility and responsive guidance explicitly provided upstream;
- free/Pro/copyleft/re-distribution boundaries;
- official docs, repository, `llms.txt`/Agent Skill, changelog and license URLs;
- `last_verified` and upstream ref.

Do not mirror full copyrighted documentation. Link official sources and retain only concise project-facing summaries or explicitly machine-readable source snapshots.

**Step 2: Add guide validation**

Extend `check-agent-entry.mjs` to fail if a selected source lacks install, adaptation, license, changelog and last-verified sections.

**Step 3: Run validation**

Run: `node apps/web/scripts/ui-catalog/check-agent-entry.mjs`  
Expected: PASS for all eight source guides.

**Step 4: Commit**

```bash
git add docs/frontend/ui-assets/guides docs/frontend/ui-assets/licenses.md docs/frontend/ui-assets/changelog-watch.md apps/web/scripts/ui-catalog/check-agent-entry.mjs
git commit -m "docs: 收录官方UI使用修改与迁移规范"
```

## Task 6: Build the cross-source capability index and visual comparison workflow

**Files:**

- Create: `apps/web/scripts/ui-catalog/build-capability-index.mjs`
- Create: `docs/frontend/ui-assets/capabilities.json`
- Create: `docs/frontend/ui-assets/visual-guide.md`
- Create: `docs/frontend/ui-assets/decisions/README.md`
- Create: `docs/frontend/ui-assets/decisions/date-picker.md`

**Step 1: Normalize capability tags**

Map aliases such as `date picker/date range/calendar filter`, `combobox/autocomplete/select`, `data table/data grid`, `dialog/modal/sheet/drawer`, while retaining original categories.

**Step 2: Generate candidate groups**

For each capability output all qualified sources, official preview URL, foundation, dependency cost, license, theme readiness and local status.

**Step 3: Create a date-picker comparison as the first real decision artifact**

Compare at least shadcn and coss using official previews and source facts. Do not select the final visual variant without the boss's review; record coss as the current priority direction, not as an unchangeable universal winner.

**Step 4: Create the visual guide**

Reference the captured official screenshots under `output/playwright/ui-libraries/` and group libraries by visual style and product fit. Mark screenshots as selection evidence, not vendored UI.

**Step 5: Commit**

```bash
git add apps/web/scripts/ui-catalog/build-capability-index.mjs docs/frontend/ui-assets/capabilities.json docs/frontend/ui-assets/visual-guide.md docs/frontend/ui-assets/decisions
git commit -m "feat: 建立跨组件库能力对比索引"
```

## Task 7: Vendor the coss date-filter sample in an isolated path

**Files:**

- Create: `apps/web/components/coss/button.tsx`
- Create: `apps/web/components/coss/calendar.tsx`
- Create: `apps/web/components/coss/popover.tsx`
- Create: `apps/web/components/coss/date-picker.tsx`
- Create: `apps/web/components/business/filters/date-range-filter.tsx`
- Create: `apps/web/lib/ui-assets/manifest.ts`
- Create: `apps/web/lib/ui-assets/manifest.test.ts`
- Modify: `apps/web/app/globals.css`
- Modify: `apps/web/package.json`

**Step 1: Inspect, do not add**

Run:

```bash
npx shadcn@latest view @coss/calendar --cwd apps/web
npx shadcn@latest view @coss/popover --cwd apps/web
npx shadcn@latest view @coss/button --cwd apps/web
npx shadcn@latest view @coss/p-date-picker-2 --cwd apps/web
```

Record exact dependencies/upstream hashes. coss does not expose a `@coss/date-picker` primitive, but its official Registry currently exposes `@coss/p-date-picker-1` through `@coss/p-date-picker-9`; use `p-date-picker-2` as the date-range sample and preserve its Calendar + Popover + Button composition.

**Step 2: Generate in a temporary clean app or worktree**

Run the three `add` commands only in the clean UI-assets worktree. Review the diff before relocation; never accept overwrite prompts for existing shadcn files.

**Step 3: Relocate and repair imports**

Move generated coss files to `components/coss/`, change internal imports to the same namespace, add coss semantic token mappings and Base UI isolation, and retain upstream provenance comments/manifest records.

**Step 4: Add the business adapter**

`DateRangeFilter` owns product semantics only: preset ranges, timezone/business-day input, Chinese labels, controlled value, loading/disabled state and analytics callback. Calendar focus/range behavior remains in vendored coss source.

**Step 5: Test**

Run:

```bash
node --test apps/web/lib/ui-assets/manifest.test.ts
npm run lint --prefix apps/web
npm run build --prefix apps/web
```

Use Playwright for mouse/keyboard/range/close/focus/mobile/light/dark checks.

**Step 6: Commit**

```bash
git add apps/web/components/coss apps/web/components/business/filters apps/web/lib/ui-assets apps/web/app/globals.css apps/web/package.json apps/web/package-lock.json docs/frontend/ui-assets/decisions/date-picker.md
git commit -m "feat: 接入coss日期筛选源码样板"
```

## Task 8: Implement tweakcn-based runtime theme packs

**Files:**

- Create: `apps/web/styles/themes/new-york-neutral.css`
- Create: `apps/web/styles/themes/data-dense.css`
- Create: `apps/web/styles/themes/coss-minimal.css`
- Create: `apps/web/styles/themes/warm-operations.css`
- Create: `apps/web/styles/themes/dark-command.css`
- Create: `apps/web/styles/themes/bento-soft.css`
- Create: `apps/web/lib/themes.ts`
- Create: `apps/web/components/theme/theme-switcher.tsx`
- Create: `apps/web/components/theme/theme-provider.tsx`
- Create: `apps/web/lib/echarts-theme.ts`
- Modify: `apps/web/app/layout.tsx`

**Step 1: Add token contract tests**

Assert every theme defines the required semantic color, typography, radius, shadow, density and chart variables; ensure reduced-motion can disable decorative animations.

**Step 2: Import six reviewed tweakcn-derived presets**

Record each preset's tweakcn source/share URL and local modifications. Do not hardcode preset colors inside UI components.

**Step 3: Add runtime switching**

Persist `data-theme`, `data-density`, `data-motion`; prevent hydration flash; ensure dark presets correctly set `color-scheme`.

**Step 4: Bridge ECharts**

Create chart theme objects from semantic CSS variables so axes, grid, series, tooltip and states follow the active preset.

**Step 5: Verify and commit**

Run lint/build plus screenshot comparison for six themes on one unchanged page.

```bash
git add apps/web/styles/themes apps/web/lib/themes.ts apps/web/lib/echarts-theme.ts apps/web/components/theme apps/web/app/layout.tsx
git commit -m "feat: 接入tweakcn多风格运行时切换"
```

## Task 9: Build the UI asset showroom

**Files:**

- Create: `apps/web/app/dev/ui-lab/page.tsx`
- Create: `apps/web/app/dev/ui-lab/catalog-client.tsx`
- Create: `apps/web/components/ui-lab/source-badge.tsx`
- Create: `apps/web/components/ui-lab/state-matrix.tsx`
- Create: `apps/web/components/ui-lab/comparison-panel.tsx`

**Step 1: Copy suitable shadcn/coss primitives for the lab UI**

Do not handwrite tabs, cards, command search or dialog if approved source components already exist.

**Step 2: Show catalog and local assets**

Support search by capability/source/kind/status. Each asset shows official preview, install command, foundation, license, local path, last verified date and guide link.

**Step 3: Show state and theme matrices**

For vendored components render default/hover/focus/disabled/loading/empty/error where applicable and all six themes.

**Step 4: Restrict production exposure**

UI lab is development-only or access-controlled; it must not expose internal source metadata publicly by default.

**Step 5: Verify and commit**

Run lint/build and Playwright desktop/mobile screenshots.

```bash
git add apps/web/app/dev/ui-lab apps/web/components/ui-lab
git commit -m "feat: 建立UI资产展厅与对比面板"
```

## Task 10: Add ongoing drift, license and no-handwrite gates

**Files:**

- Create: `apps/web/scripts/ui-catalog/audit.mjs`
- Create: `docs/frontend/ui-assets/audit-report.md`
- Modify: `apps/web/package.json`
- Modify: `docs/plans/工作台账.md`

**Step 1: Add audit checks**

- registry item-count collapse or deleted preferred asset;
- upstream changelog newer than `last_verified`;
- missing/changed license;
- vendored asset without manifest/local path;
- coss source accidentally placed in `components/ui/`;
- business component containing copied primitive behavior instead of a thin adapter;
- direct hardcoded theme colors in vendored/business components;
- asset request implemented without catalog lookup/comparison record.

**Step 2: Add scripts**

```json
{
  "ui:catalog:check": "node scripts/ui-catalog/sync.mjs --all --check",
  "ui:catalog:audit": "node scripts/ui-catalog/audit.mjs",
  "ui:catalog:refresh": "node scripts/ui-catalog/sync.mjs --all --write"
}
```

**Step 3: Run full gate**

```bash
npm run ui:catalog:check --prefix apps/web
npm run ui:catalog:audit --prefix apps/web
npm run lint --prefix apps/web
npm run build --prefix apps/web
```

**Step 4: Update the ledger and commit**

```bash
git add apps/web/scripts/ui-catalog/audit.mjs apps/web/package.json docs/frontend/ui-assets/audit-report.md docs/plans/工作台账.md
git commit -m "chore: 加入UI资产来源与许可证审计"
git show --stat HEAD
```

## Final acceptance

- Official catalogs are complete to the maximum machine-verifiable coverage and explicitly mark partial sources.
- Frontend agents can discover all selected-source capabilities and official rules without relying on conversation memory.
- Multi-source capabilities have a repeatable visual comparison/approval record.
- The coss date-filter sample proves source vendoring, Base UI/Radix isolation and thin business adaptation.
- Six tweakcn-derived themes switch on the same component tree and also recolor ECharts.
- Every vendored source is traceable to an official URL, upstream ref, license and local modifications.
