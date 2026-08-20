# 17 Library Official-Source Comparison Wall Implementation Plan

> **For Codex:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Expand the offline UI showroom from five live previews to a 17-product-line comparison wall with 16 legal official-source previews and one explicit React Bits Pro paid lock card.

**Architecture:** Keep the existing isolated source-cache → temporary build workspace → IIFE/CSS → sandboxed inline `file://` frame pipeline. Add only the missing representative official sources, model live and blocked records in one deterministic manifest, and generate a filterable 17-card wall without touching the product runtime or the frontend Agent's current page files.

**Tech Stack:** Node.js 22, React 19, esbuild, Tailwind CSS v4, existing UI catalog/source-cache generators, static HTML/IIFE/CSS, Playwright CLI, SHA-256 manifests.

---

### Task 1: Freeze the 17 representative selections and legal evidence

**Files:**
- Create: `apps/web/scripts/ui-catalog/live-preview-spec.json`
- Create: `apps/web/scripts/ui-catalog/build-live-previews.test.mjs`
- Create: `docs/frontend/ui-assets/reviews/2026-08-20-17-library-preview-evidence.md`
- Modify: `docs/plans/工作台账.md`

**Step 1: Write the failing selection test**

Create a test that loads `catalogs/index.json`, the 17 catalogs, the preview spec, and source-cache manifest. Require the exact catalog source order, 17 unique preview IDs, 16 `target_status: "live"`, one `target_status: "blocked-paid"`, and exactly one blocked source named `react-bits-pro`.

```js
assert.deepEqual(spec.previews.map((item) => item.source), catalogIndex.sources.map((item) => item.id));
assert.equal(spec.previews.filter((item) => item.target_status === "live").length, 16);
assert.deepEqual(
  spec.previews.filter((item) => item.target_status === "blocked-paid").map((item) => item.source),
  ["react-bits-pro"],
);
```

For every live entry require `group`, `official_assets`, `official_url`, `license`, `purpose`, and either existing `source_cache_paths` or `cache_required: true`. Reject `paid-source-after-license` catalog items as live inputs.

**Step 2: Run the test to verify it fails**

Run: `node --test apps/web/scripts/ui-catalog/build-live-previews.test.mjs`

Expected: FAIL because the 17-source spec does not exist.

**Step 3: Record exact representatives**

Start with the already verified five records, then choose one compact official public representative for each missing source:

- shadcn: a current New York v4 primitive/composition such as Calendar or Command.
- coss current: cached `p-date-picker-2`.
- coss Origin: one current-registry-missing legacy `comp-*` whose JSON is public and MIT-scoped.
- ReUI: cached `c-data-grid-27` or a smaller cached Data Grid example if dependency cost is lower.
- Tremor current: cached `block/kpi-cards/kpi-card-01`.
- Tremor legacy: `@tremor/react@3.18.7` Metric/Card capability from the official Apache package.
- Aceternity: cached `card-spotlight` or `spotlight-new`.
- Magic UI Free: cached `number-ticker` or `marquee`.
- Magic UI Pro: one of the three public official template repositories only after its repository license is verified; otherwise emit a second legal block instead of guessing.
- React Bits Free: cached `Counter` or `SpotlightCard`.
- React Bits Pro: blocked paid record, no cache/bundle/frame.
- tweakcn: cached `modern-minimal` token source applied to a small KPI/filter surface.

Write the exact upstream name, source URL, preview URL, license URL/scope, access status, official ref and selection reason to the evidence note. If Magic UI Pro's public repo has no reusable license, change its record to `blocked-license`; the final acceptable invariant is 15–16 live plus explicit honest blocks, never a false live claim.

**Step 4: Implement the spec**

Add 17 ordered records matching catalog order. Preserve the old five official asset pairs. Add project-oriented style summaries and overlap notes for the comparison wall.

**Step 5: Run the test to verify it passes**

Run: `node --test apps/web/scripts/ui-catalog/build-live-previews.test.mjs`

Expected: PASS for structure and paid-boundary checks; missing source-cache entries may remain explicitly marked for Task 2.

**Step 6: Commit**

Commit spec/test/evidence/ledger only with message `[arch] 冻结17库实时预览代表项`.

### Task 2: Cache the four missing official representative source families

**Files:**
- Modify: `docs/frontend/ui-assets/starter-pack.json`
- Modify: `apps/web/scripts/ui-catalog/cache-starter-sources.mjs`
- Modify: `apps/web/scripts/ui-catalog/cache-starter-sources.test.mjs`
- Modify: `apps/web/scripts/ui-catalog/starter-pack.test.mjs`
- Modify: `docs/frontend/ui-assets/source-cache/manifest.json`
- Add: `docs/frontend/ui-assets/source-cache/{shadcn,coss-origin,tremor-legacy,magic-ui-pro}/**`
- Modify: `docs/frontend/ui-assets/source-download-status.md`

**Step 1: Write failing cache tests**

Require at least one legal root for shadcn, coss Origin, Tremor legacy, and Magic UI Pro only when the selected repository license permits reuse. Assert every added root resolves to a `public-source` catalog record, has a non-empty exact ref/hash, and is not React Bits Pro.

```js
assert.equal(manifest.entries.some((item) => item.source === "react-bits-pro"), false);
for (const source of ["shadcn", "coss-origin", "tremor-legacy"]) {
  assert.equal(manifest.entries.some((item) => item.source === source && item.role === "root"), true);
}
```

**Step 2: Run tests to verify failure**

Run: `node --test apps/web/scripts/ui-catalog/starter-pack.test.mjs apps/web/scripts/ui-catalog/cache-starter-sources.test.mjs`

Expected: FAIL because the current cache covers 12 sources and none of these four.

**Step 3: Extend official resolvers**

- Resolve shadcn from the official current Registry JSON, not the inferred local `apps/web/components/ui` copy.
- Resolve coss Origin from `https://coss.com/origin/r/<name>.json` and retain its Origin MIT scope plus root AGPL warning.
- Resolve Tremor legacy from the exact official `@tremor/react@3.18.7` package tarball/file set and retain Apache-2.0 plus version integrity.
- Resolve Magic UI Pro public templates only from `magicuidesign/*` official repos after LICENSE verification; never call private Pro Registry endpoints.

**Step 4: Download and verify**

Run the cache builder with `--write`, then `--check`. Require zero failed roots, exact per-file hashes and no unexpected source family.

**Step 5: Rebuild dependent truth outputs**

Run capability, coverage, runtime and showroom builders with `--write` so cached counts are generated rather than hand-edited.

**Step 6: Commit**

Commit cache spec/resolvers/tests/generated cache status with message `[arch] 缓存比较墙缺失官方源码`.

### Task 3: Upgrade the manifest and builder to live/blocked 17-source records

**Files:**
- Modify: `apps/web/scripts/ui-catalog/build-live-previews.mjs`
- Modify: `apps/web/scripts/ui-catalog/build-live-previews.test.mjs`
- Modify: `docs/frontend/ui-assets/live-previews/manifest.json`
- Modify: `docs/frontend/ui-assets/live-previews/README.md`

**Step 1: Add failing builder-contract tests**

Require schema v2 fields `group`, `style_summary`, `best_for`, `overlap`, `render_status`, `official_url`, `license`, and `source_cache_paths`. For `live`, require bundle/frame paths and hashes; for `blocked-*`, forbid them.

```js
for (const item of manifest.previews) {
  if (item.render_status === "live") {
    assert.ok(item.frame_path && item.frame_sha256 && item.bundle_sha256);
  } else {
    assert.equal("frame_path" in item, false);
    assert.equal("bundle_path" in item, false);
  }
}
```

**Step 2: Run the test to verify failure**

Run: `node --test apps/web/scripts/ui-catalog/build-live-previews.test.mjs`

Expected: FAIL because schema v1 assumes all five records are live.

**Step 3: Refactor the builder**

Load `live-preview-spec.json` instead of a hard-coded five-element array. Prepare sources only for `target_status: live`, build only live harnesses, emit explicit blocked records without artifacts, and preserve current inline CSS/JavaScript delivery for `file://`.

**Step 4: Strengthen `--check`**

Check spec/manifest order, 17 unique sources, catalog linkage, cache path containment, file hashes, sandbox, CSP, no child `src/href`, no remote URLs, no React Bits Pro artifact and generated status counts.

**Step 5: Verify the refactor keeps the five existing frames valid**

Run `--check` before adding new harnesses. Expected: the five old live frames still hash-validate; the new entries remain blocked-missing-harness until Task 4.

**Step 6: Commit**

Commit builder/schema/docs with message `[arch] 扩展17库离线预览构建契约`.

### Task 4: Build eleven additional official-source harnesses

**Files:**
- Create: `docs/frontend/ui-assets/live-previews/harness/shadcn.tsx`
- Create: `docs/frontend/ui-assets/live-previews/harness/coss.tsx`
- Create: `docs/frontend/ui-assets/live-previews/harness/coss-origin.tsx`
- Create: `docs/frontend/ui-assets/live-previews/harness/reui.tsx`
- Create: `docs/frontend/ui-assets/live-previews/harness/tremor.tsx`
- Create: `docs/frontend/ui-assets/live-previews/harness/tremor-legacy.tsx`
- Create: `docs/frontend/ui-assets/live-previews/harness/aceternity.tsx`
- Create: `docs/frontend/ui-assets/live-previews/harness/magic-ui.tsx`
- Create conditionally: `docs/frontend/ui-assets/live-previews/harness/magic-ui-pro.tsx`
- Create: `docs/frontend/ui-assets/live-previews/harness/react-bits.tsx`
- Create: `docs/frontend/ui-assets/live-previews/harness/tweakcn.tsx`
- Modify: `apps/web/scripts/ui-catalog/build-live-previews.mjs`
- Modify: `apps/web/scripts/ui-catalog/build-live-previews.test.mjs`
- Add/Modify generated: `docs/frontend/ui-assets/live-previews/assets/**`
- Add/Modify generated: `docs/frontend/ui-assets/live-previews/frames/**`
- Modify generated: `docs/frontend/ui-assets/live-previews/manifest.json`

**Step 1: Add one expected-label/interaction test per source**

Each harness gets a visible source-specific label and one behavior: open/select for controls, sort/filter for data, hover/toggle for visual effects, number/theme switch for motion/tokens. Tests must verify the harness imports the copied official source path, not a local reimplementation.

**Step 2: Implement foundation/data harnesses**

Build shadcn, coss current, coss Origin, ReUI, Tremor current, and Tremor legacy one at a time. Use only fake campaign/account/KPI data. After each addition run the preview builder and tests.

**Step 3: Implement visual/theme harnesses**

Build Aceternity, Magic UI Free, React Bits Free and tweakcn. Keep the source's own visual identity; project harness CSS may size the stage but must not flatten every library into the same editorial style.

**Step 4: Handle Magic UI Pro honestly**

If the selected public official template repository passes license and isolated-build checks, build one small official section unchanged. Otherwise leave `blocked-license` with exact reason and official preview. Do not substitute Magic UI Free while labeling it Pro.

**Step 5: Build all outputs**

Run: `node apps/web/scripts/ui-catalog/build-live-previews.mjs --write`

Expected: manifest has 17 records, 15–16 live depending on verified Magic UI Pro reuse, React Bits Pro blocked-paid, and no unexplained block.

**Step 6: Verify**

Run:

```bash
node --test apps/web/scripts/ui-catalog/build-live-previews.test.mjs
node apps/web/scripts/ui-catalog/build-live-previews.mjs --check
```

Expected: PASS; all live frame/bundle/source hashes match.

**Step 7: Commit**

Commit source-family harnesses and generated frames in small batches, ending with `[arch] 完成17库官方源码代表预览`.

### Task 5: Replace the five-library section with the 17-library comparison wall

**Files:**
- Modify: `apps/web/scripts/ui-catalog/build-showroom.mjs`
- Modify: `apps/web/scripts/ui-catalog/build-showroom.test.mjs`
- Modify: `apps/web/scripts/ui-catalog/showroom-template.html`
- Modify generated: `docs/frontend/ui-assets/showroom-data.json`
- Modify generated: `docs/frontend/ui-assets/showroom.html`

**Step 1: Write failing showroom tests**

Require 17 cards in catalog order, group/status filter controls, live/blocked counts derived from manifest, `sandbox="allow-scripts"` only on live frames, no iframe on blocked cards, official links and source IDs on every card, and copy that no longer says “five frames”.

**Step 2: Run the test to verify failure**

Run: `node --test apps/web/scripts/ui-catalog/build-showroom.test.mjs`

Expected: FAIL because the template still renders the five-library grid.

**Step 3: Generate comparison-wall data**

Join manifest records with catalog source metadata. Expose `preview_status_counts`, groups, live frame count and represented official asset count. Keep URL allow-listing limited to local frame paths and explicit official HTTPS links.

**Step 4: Build the wall UI**

Add compact filters, 17 independent cards, style/use/overlap/permit metadata, lazy live iframes, and an accessible blocked state. Keep the old five frames functional inside the new unified wall.

**Step 5: Generate and check**

Run showroom builder `--write`, then `--check`; assert external `showroom-data.json` deep-equals embedded JSON.

**Step 6: Commit**

Commit generator/template/generated showroom with message `[arch] 接入17库官方源码比较墙`.

### Task 6: Validate file URL, responsive behavior, keyboard, and security

**Files:**
- Modify: `apps/web/scripts/ui-catalog/build-live-previews.test.mjs`
- Modify: `apps/web/scripts/ui-catalog/build-showroom.test.mjs`
- Create: `docs/frontend/ui-assets/reviews/2026-08-20-17-library-showroom-qa.md`

**Step 1: Run all mechanical gates**

Run all UI catalog Node tests, live/showroom/cache/capability/coverage/runtime/free-alternative stale checks, target ESLint, JSON parsing and `git diff --check`.

**Step 2: Test the real repository `file://` artifact**

Open `file:///Users/aik/Desktop/投放agent/docs/frontend/ui-assets/showroom.html` with the Playwright wrapper. At 1440×900 and 390×844, filter each group, scroll every card into view, and confirm every live iframe body is non-empty.

**Step 3: Exercise interactions and accessibility**

Exercise at least one interaction per group, verify visible keyboard focus, blocked-card link access, reduced-motion behavior, and no horizontal overflow.

**Step 4: Verify security/offline invariants**

Require zero external runtime request, zero console error, all live sandbox values exactly `allow-scripts`, no parent DOM access, no top navigation, and no frame for React Bits Pro.

**Step 5: Record exact evidence**

Write viewports, live/blocked counts, interaction matrix, console/request counts, relevant SHA-256 values and any accepted blocked reason to the QA note.

**Step 6: Commit**

Commit tests/evidence with message `[arch] 验收17库离线比较墙`.

### Task 7: Sync desktop, Obsidian, ledger, and frontend handoff

**Files:**
- Modify: `docs/frontend/ui-assets/README.md`
- Modify: `docs/frontend/ui-assets/obsidian/投放Agent-前端UI资产库.md`
- Modify: `docs/relay/F-004-前端UI资产与质量门禁.md`
- Modify: `docs/plans/工作台账.md`
- External sync: `/Users/aik/Desktop/投放Agent-UI资产展厅/`
- External sync: `/Users/aik/Documents/Obsidian Vault/raw/创作/vibemotion/投放Agent-前端UI资产库.md`

**Step 1: Update canonical truth**

Record 17 card positions, exact live/blocked totals, representative items, cache totals and the difference between catalogued/source-cached/live-preview/runtime-installed.

**Step 2: Copy the complete desktop artifact**

Copy `showroom.html` plus the complete `live-previews/` directory. Verify relative paths and compare hashes; do not copy a naked HTML.

**Step 3: Sync Obsidian**

Copy the canonical note to `vibemotion` and verify line count and SHA-256 equality.

**Step 4: Update F-004 and the ledger**

Tell the frontend Agent to use the 17-library wall for visual comparison, the full 7,056 catalog for capability lookup, and the source guides for adaptation. Preserve the rule that actual runtime installation is page-batch work and requires a comparison record.

**Step 5: Run the final full gate and commit**

Re-run all checks, confirm unrelated frontend changes remain untouched, commit only UI asset/docs paths with message `[arch] 完成17库比较墙并交接前端`.

**Step 6: Self-review**

Review source legality, manifest/card completeness, offline runtime, stale outputs, Desktop/Obsidian hashes and `git show --stat HEAD`. Any P0/P1 finding blocks the “收工” claim.
