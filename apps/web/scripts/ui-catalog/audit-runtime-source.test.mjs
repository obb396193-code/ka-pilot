import assert from "node:assert/strict";
import test from "node:test";

import { buildRuntimeManifest, runtimeManifestMarkdown } from "./audit-runtime-source.mjs";

test("runtime audit never equates catalog metadata with downloaded source", () => {
  const manifest = buildRuntimeManifest({
    generatedAt: "2026-08-19T00:00:00.000Z",
    catalogIndex: {
      total_items: 100,
      counts: { by_source_cache_status: { "not-cached": 100 } },
    },
    componentsConfig: { style: "new-york-v4", registries: {} },
    packageJson: { dependencies: { shadcn: "1.0.0" } },
    componentFiles: [{ name: "button", path: "components/ui/button.tsx", sha256: "sha256:test" }],
    sourceTexts: ['import { Button } from "@/components/ui/button"'],
    thirdPartyFiles: { coss: [], reui: [] },
    shadcnNames: new Set(["button"]),
    starterCacheManifest: {
      cached_entry_count: 12,
      cached_root_count: 8,
      cached_dependency_count: 4,
      cached_file_count: 15,
      failures: [],
      by_source: { coss: { entries: 12, files: 15, roots: 8, dependencies: 4 } },
    },
  });

  assert.equal(manifest.catalog_snapshot.source_cached_item_count, 0);
  assert.equal(manifest.summary.runtime_local_ui_source_files, 1);
  assert.equal(manifest.summary.selected_third_party_source_files, 0);
  assert.equal(manifest.summary.starter_cached_entries, 12);
  assert.equal(manifest.summary.starter_cached_files, 15);
  assert.equal(manifest.conclusion.starter_source_cache_present, true);
  assert.equal(manifest.local_ui_components[0].provenance_status, "inferred-from-components.json-and-path");
  assert.match(runtimeManifestMarkdown(manifest), /不能说“所有目录源码已下载”/);
  assert.match(runtimeManifestMarkdown(manifest), /8 个根资产、4 个依赖、12 个缓存条目、15 份源码文件/);
});
