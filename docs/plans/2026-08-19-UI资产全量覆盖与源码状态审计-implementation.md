# UI Asset Full-Coverage and Source-Status Audit Implementation Plan

> **For Codex:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Verify every selected UI source against current official indexes, expose Free/Pro/login/dynamic coverage gaps, distinguish catalog metadata from downloaded source, independently review the result, and publish a resumable Obsidian note.

**Architecture:** Keep the normalized catalog snapshots as the discovery layer, then add a separate coverage/access audit that records what is public source, public metadata only, paid metadata only, or not stably enumerable. Runtime source remains source-isolated and is downloaded only for assets actually used; a manifest proves what is or is not cached instead of inferring it from catalog presence.

**Tech Stack:** Node.js ESM, JSON snapshots, Markdown evidence notes, official Registry/GitHub/site maps, Node.js test runner, Obsidian Markdown.

---

## Task 1: Freeze terminology and storage contract

**Files:**

- Modify: `docs/frontend/ui-assets/README.md`
- Modify: `docs/frontend/ui-assets/catalog.schema.json`
- Create: `docs/frontend/ui-assets/storage-format.md`

**Steps:**

1. Define `catalogued`, `public-source`, `public-metadata-only`, `paid-source-after-license`, `paid-metadata-only`, `inaccessible-unknown`, `source-cached`, `vendored`, and `adapted`.
2. State exactly which JSON/Markdown/PNG files hold metadata, rules, evidence and runtime provenance.
3. Add schema fields without claiming source is cached when only metadata exists.
4. Validate all generated JSON.

## Task 2: Re-audit all official surfaces and paywalls

**Files:**

- Create: `docs/frontend/ui-assets/coverage-audit.json`
- Create: `docs/frontend/ui-assets/coverage-audit.md`
- Create: `apps/web/scripts/ui-catalog/build-coverage-audit.mjs`
- Create: `apps/web/scripts/ui-catalog/coverage-audit.test.mjs`

**Steps:**

1. Map Registry, docs, repository, Pro, template and community surfaces for all eight sources.
2. Compare live official counts with local snapshot counts; record exact missing/extra/unknown reasons.
3. Separate public source from paid metadata and login-gated/unstable catalogs.
4. Never bypass authentication or payment.
5. Add item-level access summaries where evidence supports them and source-level unknown buckets otherwise.

## Task 3: Audit actually used/downloaded source

**Files:**

- Create: `docs/frontend/ui-assets/source-download-manifest.json`
- Create: `docs/frontend/ui-assets/source-download-status.md`
- Create: `apps/web/scripts/ui-catalog/audit-runtime-source.mjs`
- Create: `apps/web/scripts/ui-catalog/audit-runtime-source.test.mjs`

**Steps:**

1. Scan runtime imports/components without modifying the dirty F-001 implementation.
2. Identify shadcn/dashboard source already present, third-party source present, and catalog-only assets.
3. Mark provenance as verified, inferred, or unknown; do not call local hand-written code downloaded source.
4. List the exact assets that still need official source inspection/download after the clean handoff.

## Task 4: Independent review and primary-agent audit

**Files:**

- Create: `docs/frontend/ui-assets/reviews/2026-08-19-independent-audit.md`

**Steps:**

1. Dispatch read-only subagents across shadcn/coss, ReUI/Tremor, and motion/theme sources.
2. Require official evidence, counts, access classes and suspected omissions.
3. Primary agent rechecks every reported discrepancy against local files and official endpoints.
4. Record accepted/rejected findings with reasons; run all tests and stale-data checks.

## Task 5: Publish resumable Obsidian handoff

**Files:**

- Create or update: `<Obsidian vault>/vibemotion/投放Agent-前端UI资产库.md`

**Steps:**

1. Discover the real Obsidian vault and exact `vibemotion` directory; do not guess a path.
2. Write current state, counts, missing/paid boundaries, storage format, query commands, source-download status, decisions and next steps.
3. Link back to the authoritative repository files and commit SHA.
4. Re-read the Obsidian note after writing and compare its counts/status with repository truth.
