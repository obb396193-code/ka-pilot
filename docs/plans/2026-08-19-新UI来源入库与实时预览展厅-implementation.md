# New UI Intake and Live Preview Showroom Implementation Plan

> **For Codex:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add five approved official UI sources to the searchable asset system, cache a legal high-frequency subset, and render curated official components as interactive offline previews inside the showroom.

**Architecture:** Phase 1 extends the existing deterministic catalog/sync/cache pipeline without touching product runtime files. Phase 2 builds curated official-source previews in an isolated build workspace, emits classic offline bundles under `docs/frontend/ui-assets/live-previews/`, and loads them through sandboxed relative-path iframes in the existing generated showroom.

**Tech Stack:** Node.js 22, existing catalog schema and generators, official Registry/GitHub/docs inputs, React 19, esbuild or equivalent local bundler, Tailwind CSS v4, static HTML/IIFE/CSS, Playwright CLI.

---

### Task 1: Establish official source endpoints and reproducible intake fixtures

**Files:**
- Modify: `apps/web/scripts/ui-catalog/sources.mjs`
- Modify: `apps/web/scripts/ui-catalog/source-health.test.mjs`
- Create: `docs/frontend/ui-assets/reviews/2026-08-19-new-source-evidence.md`
- Modify: `docs/plans/工作台账.md`

**Step 1: Write the failing test**

Extend the source-health test to require five new unique source IDs, official docs/repository/license URLs, catalog mode, and at least one concrete catalog URL per source. Require exactly three `approved-for-catalog-and-contextual-use` and two `approved-for-selective-comparison` records when joined with `discovery.json`.

**Step 2: Run the test to verify it fails**

Run: `node --test apps/web/scripts/ui-catalog/source-health.test.mjs`

Expected: FAIL because `UI_SOURCES` still contains only the existing twelve product lines.

**Step 3: Discover and record official evidence**

Use official Registry/docs/repository surfaces only. Map/crawl scoped docs sections; probe Registry and GitHub tree endpoints; record URL, response type, coverage claim, license, auth requirement, and whether the source is finite/dynamic. Do not derive completeness from homepage marketing counts.

**Step 4: Add source definitions**

Add `ai-elements`, `kibo-ui`, `dice-ui`, `animate-ui`, and `motion-primitives` to `UI_SOURCES`. Keep Animate/Motion source definitions formally searchable but selection-limited through decision metadata.

**Step 5: Run the test to verify it passes**

Run: `node --test apps/web/scripts/ui-catalog/source-health.test.mjs`

Expected: PASS; source IDs are unique and all official evidence fields exist.

**Step 6: Commit**

Commit only source/evidence/test/ledger files with message `[arch] 登记五个新UI官方来源`.

### Task 2: Parse five official inventories into catalog schema

**Files:**
- Modify: `apps/web/scripts/ui-catalog/sync.mjs`
- Modify: `apps/web/scripts/ui-catalog/sync.test.mjs`
- Create: `docs/frontend/ui-assets/catalogs/ai-elements.json`
- Create: `docs/frontend/ui-assets/catalogs/kibo-ui.json`
- Create: `docs/frontend/ui-assets/catalogs/dice-ui.json`
- Create: `docs/frontend/ui-assets/catalogs/animate-ui.json`
- Create: `docs/frontend/ui-assets/catalogs/motion-primitives.json`
- Modify: `docs/frontend/ui-assets/catalogs/index.json`
- Modify: `docs/frontend/ui-assets/catalogs/README.md`

**Step 1: Write parser contract tests**

Add minimal official-shaped samples for Registry, docs index, sitemap, and GitHub tree inputs. Assert stable identity, full names/categories, preview/source URLs, dependencies, access/license state, foundation, maintenance state, and exact item counts for each sample. Add count-drift coverage for additions and removals.

**Step 2: Run targeted tests to verify failure**

Run: `node --test apps/web/scripts/ui-catalog/sync.test.mjs`

Expected: FAIL because the five parsers and source switch cases do not exist.

**Step 3: Implement parsers and load rules**

Implement dedicated parsers instead of a generic name scraper. Prefer Registry JSON where present; union docs/repository leaves only when they represent additional logical capabilities. Deduplicate code variants and examples without losing category membership. Do not count headings, provider nodes, or marketing cards as assets.

**Step 4: Generate targeted snapshots**

Run live sync for each new source using `--source <id> --write`; preserve existing local state. If an upstream has no finite public total, set coverage to partial/dynamic and state the unresolved boundary instead of claiming completeness.

**Step 5: Validate and run tests**

Run:

```bash
node --test apps/web/scripts/ui-catalog/sync.test.mjs apps/web/scripts/ui-catalog/catalog.test.mjs
node apps/web/scripts/ui-catalog/sync.mjs --check
```

Expected: PASS; index total equals the sum of all 17 source snapshots and every asset validates.

**Step 6: Commit**

Commit parser/tests/catalog snapshots with message `[arch] 收录五个新UI完整目录`.

### Task 3: Add official guides, coverage, capability index, and source health

**Files:**
- Create: `docs/frontend/ui-assets/guides/ai-elements.md`
- Create: `docs/frontend/ui-assets/guides/kibo-ui.md`
- Create: `docs/frontend/ui-assets/guides/dice-ui.md`
- Create: `docs/frontend/ui-assets/guides/animate-ui.md`
- Create: `docs/frontend/ui-assets/guides/motion-primitives.md`
- Modify: `docs/frontend/ui-assets/licenses.md`
- Modify: `docs/frontend/ui-assets/sources.md`
- Modify: `docs/frontend/ui-assets/coverage-audit.json`
- Modify: `docs/frontend/ui-assets/coverage-audit.md`
- Modify: `docs/frontend/ui-assets/source-health.json`
- Modify: `docs/frontend/ui-assets/capabilities.json`
- Modify: `apps/web/scripts/ui-catalog/build-coverage-audit.mjs`
- Modify: `apps/web/scripts/ui-catalog/build-capability-index.mjs`
- Modify: corresponding `*.test.mjs` files

**Step 1: Write failing coverage/index tests**

Require all five sources in coverage and capabilities; assert approved/selective decision state remains separate from cache/runtime state; require Animate UI Commons Clause and Motion license filename handling.

**Step 2: Run tests and confirm failure**

Run: `node --test apps/web/scripts/ui-catalog/coverage-audit.test.mjs apps/web/scripts/ui-catalog/capability-index.test.mjs`

**Step 3: Implement generators and guides**

Document installation, composition, theme/token adaptation, accessibility, modification boundaries, update strategy, license, and project use policy. Add capability mappings for Agent chat/tool/source, Gantt/Kanban/editor/dropzone, Data Grid/upload/time picker, and micro-motion families.

**Step 4: Generate and validate**

Run coverage/capability builders with `--write`, then `--check`; run source health for the five sources and merge results without dropping existing sources.

**Step 5: Commit**

Commit guides/generators/generated outputs with message `[arch] 补齐新UI规范与能力索引`.

### Task 4: Expand curated legal source cache

**Files:**
- Modify: `docs/frontend/ui-assets/starter-pack.json`
- Modify: `apps/web/scripts/ui-catalog/cache-starter-sources.mjs`
- Modify: `apps/web/scripts/ui-catalog/cache-starter-sources.test.mjs`
- Modify: `docs/frontend/ui-assets/source-cache/manifest.json`
- Add: `docs/frontend/ui-assets/source-cache/{ai-elements,kibo-ui,dice-ui,animate-ui,motion-primitives}/...`
- Modify: `docs/frontend/ui-assets/source-download-status.md`

**Step 1: Write failing cache policy tests**

Require roots for AI conversation/message/prompt/reasoning/tool/sources; Kibo Gantt/Kanban/Dropzone/Calendar or the nearest stable public set; Dice Data Grid/File Upload/Time Picker or nearest stable set; and only 1–3 representative Animate/Motion roots. Reject metadata-only, paid, restricted redistribution, missing exact hash, and any source outside official endpoints.

**Step 2: Run tests to confirm failure**

Run: `node --test apps/web/scripts/ui-catalog/starter-pack.test.mjs apps/web/scripts/ui-catalog/cache-starter-sources.test.mjs`

**Step 3: Extend resolver and starter spec**

Add Registry/GitHub raw resolution for the five sources. Preserve all explicit same-source dependencies and exact upstream refs. Cache remains isolated and never imports into `apps/web` runtime.

**Step 4: Download and verify**

Run cache builder `--write`, then `--check`; verify every file hash and failure list. If a preferred representative has an incompatible or non-public source, replace it with the next official public representative and record why.

**Step 5: Commit**

Commit spec/cache/manifest/status with message `[arch] 缓存新UI高频官方源码`.

### Task 5: Freeze phase-one asset totals and handoff truth

**Files:**
- Modify: `docs/frontend/ui-assets/README.md`
- Modify: `docs/frontend/ui-assets/discovery.json`
- Modify: `docs/frontend/ui-assets/discovery.md`
- Modify: `docs/frontend/ui-assets/obsidian/投放Agent-前端UI资产库.md`
- Modify: `docs/relay/F-004-前端UI资产与质量门禁.md`
- Modify: `docs/plans/工作台账.md`

**Step 1: Add a stale-state test**

Require `discovery` to report catalogued/cached state from generated outputs instead of a hand-written claim. Keep runtime status `not-installed`.

**Step 2: Update truth documents**

Replace “five discovery-only sources” with exact per-source counts, coverage boundary, cached roots/files, and formal/selective use policy. Do not mark any product runtime source installed.

**Step 3: Run phase-one gate**

Run all UI catalog tests, all generator `--check` commands, target ESLint, JSON parsing, and `git diff --check`.

**Step 4: Commit**

Commit phase-one truth/handoff docs with message `[arch] 完成五个新UI资产入库`.

### Task 6: Define live-preview manifest and deterministic builder

**Files:**
- Create: `docs/frontend/ui-assets/live-previews/manifest.schema.json`
- Create: `docs/frontend/ui-assets/live-previews/manifest.json`
- Create: `docs/frontend/ui-assets/live-previews/README.md`
- Create: `apps/web/scripts/ui-catalog/build-live-previews.mjs`
- Create: `apps/web/scripts/ui-catalog/build-live-previews.test.mjs`
- Create: `apps/web/scripts/ui-catalog/live-preview-spec.json`

**Step 1: Write failing manifest/builder tests**

Test unique IDs, official asset references, license/source paths, `live|blocked-*` states, output path containment, exact input/build hashes, zero remote URLs in emitted HTML/CSS/JS, no module imports/fetch, and at least one selected representative for each approved existing/new source family.

**Step 2: Run test and confirm failure**

Run: `node --test apps/web/scripts/ui-catalog/build-live-previews.test.mjs`

**Step 3: Implement minimal deterministic builder**

Use an isolated temporary workspace. Resolve only committed source-cache inputs, generate preview harnesses with fake local data, bundle React/components/dependencies to classic IIFE, compile local CSS, and atomically write frames. Never write `node_modules` or build intermediates into committed docs.

**Step 4: Verify reproducibility**

Run builder `--write`, then `--check`; rebuild twice and compare manifest/build hashes.

**Step 5: Commit**

Commit schema/spec/builder/tests with message `[arch] 建立离线组件预览构建器`.

### Task 7: Build curated official interactive frames

**Files:**
- Add: `docs/frontend/ui-assets/live-previews/frames/**`
- Modify: `apps/web/scripts/ui-catalog/live-preview-spec.json`
- Modify: `docs/frontend/ui-assets/live-previews/manifest.json`

**Step 1: Add one failing source-family fixture at a time**

For each source, first add a spec entry and a test assertion for an expected visible label and one interaction (open, type, sort, toggle, expand, drag fallback, or theme switch).

**Step 2: Build minimal official-source harness**

Use the official component source unchanged where practical. Harness code may provide fake data, width, labels, callbacks, and a small event/result panel; it must not reproduce the component implementation.

**Step 3: Verify each frame before adding the next**

Run the builder check and open the frame through Playwright CLI. Capture console and interaction evidence. Mark incompatible items blocked with exact reason rather than substituting hand-written lookalikes.

**Step 4: Complete the curated set**

Target 25–40 live frames or representative tabs across existing and new sources, with at least one live representative for every source that has legal public source and a buildable browser component.

**Step 5: Commit in small source-family batches**

Use messages such as `[arch] 增加数据组件实时预览` and `[arch] 增加Agent与动效实时预览`.

### Task 8: Integrate live frames into the generated showroom

**Files:**
- Modify: `apps/web/scripts/ui-catalog/build-showroom.mjs`
- Modify: `apps/web/scripts/ui-catalog/build-showroom.test.mjs`
- Modify: `apps/web/scripts/ui-catalog/showroom-template.html`
- Modify: `docs/frontend/ui-assets/showroom-data.json`
- Modify: `docs/frontend/ui-assets/showroom.html`

**Step 1: Write failing showroom tests**

Require live-preview summary/counts, source and capability filters, a preview drawer/modal with sandboxed iframe, `allow-scripts` without `allow-same-origin`, relative local frame paths only, explicit blocked reasons, keyboard close/focus return, and graceful rendering when a frame is missing.

**Step 2: Run test and confirm failure**

Run: `node --test apps/web/scripts/ui-catalog/build-showroom.test.mjs`

**Step 3: Implement integration**

Join the preview manifest into showroom data. Add “实时预览” actions to eligible source/asset cards and a dedicated representative-preview view. Keep screenshots only as historical visual evidence, not as the live-preview content.

**Step 4: Generate and check**

Run showroom builder `--write`, then `--check`; ensure embedded JSON equals `showroom-data.json` and main HTML has no external resource load.

**Step 5: Commit**

Commit generator/template/output with message `[arch] 在离线展厅接入实时组件预览`.

### Task 9: Browser, offline, accessibility, and security validation

**Files:**
- Create: `docs/frontend/ui-assets/reviews/2026-08-19-live-preview-qa.md`
- Modify: `apps/web/scripts/ui-catalog/build-live-previews.test.mjs`
- Modify: `apps/web/scripts/ui-catalog/build-showroom.test.mjs`

**Step 1: Verify Playwright prerequisite**

Run: `command -v npx >/dev/null 2>&1`

Expected: exit 0.

**Step 2: Test real file URLs**

Using the Playwright wrapper, open `file:///Users/aik/Desktop/投放agent/docs/frontend/ui-assets/showroom.html`, snapshot, open at least one preview per source family, perform a real interaction, and re-snapshot.

**Step 3: Test responsive and keyboard behavior**

Check 1440×900, 1024×500, and 390×844; verify no horizontal overflow, visible focus, Escape close/focus return, reduced motion, and preview isolation.

**Step 4: Test offline/security invariants**

Verify zero external runtime requests, zero console errors/warnings, no top navigation, no parent DOM/data access, and no fetch/module/CDN strings in emitted frames.

**Step 5: Record evidence and rerun full gates**

Run 49+ UI catalog tests plus new preview tests, all stale checks, target ESLint, JSON parsing, and `git diff --check`. Record exact counts, failures/blocked previews, viewport results, and hashes.

**Step 6: Commit**

Commit QA/test evidence with message `[arch] 验收离线实时组件展厅`.

### Task 10: Sync desktop, Obsidian, ledger, and frontend handoff

**Files:**
- Modify: `docs/frontend/ui-assets/obsidian/投放Agent-前端UI资产库.md`
- Modify: `docs/relay/F-004-前端UI资产与质量门禁.md`
- Modify: `docs/plans/工作台账.md`
- External sync: `/Users/aik/Desktop/投放Agent-UI资产展厅/`
- External sync: `/Users/aik/Documents/Obsidian Vault/raw/创作/vibemotion/投放Agent-前端UI资产库.md`

**Step 1: Update canonical handoff truth**

Record final source counts, cache counts, live/blocked preview counts, how to open the showroom, and the strict difference between catalog/cache/live-preview/runtime-install states.

**Step 2: Copy the complete offline artifact folder**

Copy showroom HTML plus `live-previews/frames` into the desktop showroom folder. Verify relative paths and SHA-256; do not copy a naked HTML that loses frames.

**Step 3: Sync Obsidian and verify hashes**

Copy the canonical note to `vibemotion` and compare line count/SHA-256.

**Step 4: Final full gate and commit**

Run all tests/checks again, confirm only unrelated frontend work remains dirty, commit docs/ledger/handoff with message `[arch] 完成UI资产实时展厅并交接前端`.

**Step 5: Handoff**

Tell the frontend Agent to finish F-001R first, then read `apps/web/AGENTS.md` and execute `docs/relay/F-004-前端UI资产与质量门禁.md`. Do not instruct it to re-crawl or rebuild the asset knowledge layer unless a stale check fails.
