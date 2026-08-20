import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const ROOT = new URL("../../../../", import.meta.url);

async function json(path) {
  return JSON.parse(await readFile(new URL(path, ROOT), "utf8"));
}

test("preview spec covers the 17 catalog product lines in canonical order", async () => {
  const spec = await json("apps/web/scripts/ui-catalog/live-preview-spec.json");
  const catalogIndex = await json("docs/frontend/ui-assets/catalogs/index.json");

  assert.equal(spec.schema_version, 2);
  assert.deepEqual(
    spec.previews.map((item) => item.source),
    catalogIndex.sources.map((item) => item.id),
  );
  assert.equal(new Set(spec.previews.map((item) => item.id)).size, 17);
  assert.equal(spec.previews.filter((item) => item.target_status === "live").length, 16);
  assert.deepEqual(
    spec.previews
      .filter((item) => item.target_status === "blocked-paid")
      .map((item) => item.source),
    ["react-bits-pro"],
  );
});

test("live selections have official evidence and never point at paid catalog assets", async () => {
  const spec = await json("apps/web/scripts/ui-catalog/live-preview-spec.json");
  const catalogIndex = await json("docs/frontend/ui-assets/catalogs/index.json");
  const items = new Map();

  for (const source of catalogIndex.sources) {
    const catalog = await json(`docs/frontend/ui-assets/catalogs/${source.file}`);
    for (const item of catalog.items) {
      items.set(`${item.source}:${item.upstream_name}`, item);
    }
  }

  for (const preview of spec.previews) {
    assert.ok(["foundation", "data", "motion", "agent", "theme"].includes(preview.group));
    assert.ok(preview.official_url.startsWith("https://"));
    assert.ok(preview.license.trim());
    assert.ok(preview.purpose.trim());
    assert.ok(preview.style_summary.trim());
    assert.ok(preview.best_for.trim());
    assert.ok(preview.overlap.trim());
    assert.ok(preview.official_assets.length > 0);

    if (preview.target_status !== "live") {
      assert.ok(preview.blocked_reason?.trim());
      assert.equal(preview.source_cache_paths, undefined);
      continue;
    }

    assert.ok(preview.cache_required || preview.source_cache_paths?.length > 0);
    const catalogAsset = items.get(`${preview.source}:${preview.official_assets[0]}`);
    assert.ok(catalogAsset, `missing catalog asset ${preview.source}:${preview.official_assets[0]}`);
    assert.equal(catalogAsset.access_status, "public-source");
  }
});

test("React Bits Pro has no cached source or generated frame", async () => {
  const cache = await json("docs/frontend/ui-assets/source-cache/manifest.json");
  const manifest = await json("docs/frontend/ui-assets/live-previews/manifest.json");

  assert.equal(cache.entries.some((item) => item.source === "react-bits-pro"), false);
  assert.equal(manifest.previews.some((item) => item.source === "react-bits-pro"), false);
});
