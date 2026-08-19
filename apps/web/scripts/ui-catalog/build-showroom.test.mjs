import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { buildShowroomData, safeCssLength } from "./build-showroom.mjs";

const ROOT = new URL("../../../../", import.meta.url);
const HTML_URL = new URL("docs/frontend/ui-assets/showroom.html", ROOT);
const DATA_URL = new URL("docs/frontend/ui-assets/showroom-data.json", ROOT);

test("rejects theme radius values that could escape a CSS custom property", () => {
  assert.equal(safeCssLength("0.75rem"), "0.75rem");
  assert.throws(
    () => safeCssLength("0; background-image:url(https://example.com/x)"),
    /Unsafe theme radius token/,
  );
});

test("builds a complete offline browsing model with current/legacy distinctions", () => {
  const input = {
    catalogIndex: {
      total_items: 2,
      counts: {
        by_access_status: { "public-source": 2 },
      },
      sources: [
        { id: "coss", count: 1, coverage: "complete-current-registry" },
        { id: "coss-origin", count: 1, coverage: "complete-legacy-registry" },
      ],
    },
    capabilities: {
      assets: [
        {
          id: "coss:p-button-1",
          source: "coss",
          upstream_name: "p-button-1",
          display_name: "Current button",
          description: "",
          kind: "particle",
          category: "button",
          capability_ids: ["kind/particle", "category/button"],
          preview_url: "https://coss.com/current",
          source_url: "https://coss.com/current.json",
          license: "MIT",
          access_status: "public-source",
          access_tier: "free",
          foundation: "Base UI",
          maintenance_status: "current",
          adaptation_cost: "medium",
        },
        {
          id: "coss-origin:comp-1",
          source: "coss-origin",
          upstream_name: "comp-1",
          display_name: "Origin button",
          description: "",
          kind: "particle",
          category: "button",
          capability_ids: ["kind/particle", "category/button"],
          preview_url: "https://coss.com/origin",
          source_url: "https://coss.com/origin.json",
          license: "MIT",
          access_status: "public-source",
          access_tier: "free",
          foundation: "Legacy",
          maintenance_status: "maintenance-stale",
          adaptation_cost: "high",
        },
      ],
    },
    alternatives: {
      mappings: [],
      summary: {
        paid_metadata_records: 0,
        concrete_paid_items: 0,
        provider_group_records: 0,
        mapped_items: 0,
        unresolved_items: 0,
        by_resolution_status: {},
      },
    },
    discovery: { sources: [] },
    cacheManifest: {
      cached_root_count: 1,
      cached_entry_count: 1,
      cached_dependency_count: 0,
      cached_file_count: 1,
      entries: [
        {
          asset_id: "coss:p-button-1",
          source: "coss",
          root_or_dependency: "root",
          local_path: "coss/p-button-1.json",
          files_in_payload: 2,
          cached_files: [],
          cache_status: "cached",
        },
      ],
    },
    starterPack: { roots: [{ asset_id: "coss:p-button-1", use_cases: ["button"] }] },
    tweakcnCatalog: { items: [] },
    reuiCatalog: {
      variant_matrix: {
        variants: ["base-nova", "radix-nova"],
        foundation_count: 2,
        style_count: 1,
        icon_style_count: 4,
        icon_render_variant_count: 8,
      },
    },
  };

  const output = buildShowroomData(input);
  assert.equal(output.summary.total_assets, 2);
  assert.equal(output.assets.length, 2);
  assert.equal(output.sources.find((item) => item.id === "coss").generation, "current");
  assert.equal(output.sources.find((item) => item.id === "coss-origin").generation, "legacy");
  assert.equal(
    output.assets.find((item) => item.id === "coss:p-button-1").cache.status,
    "source-cached",
  );
  assert.equal(output.assets.find((item) => item.id === "coss-origin:comp-1").access_tier, "free");
  assert.deepEqual(output.sources.find((item) => item.id === "coss").counts.by_source_cache_status, {
    "source-cached": 1,
    "not-cached": 0,
  });
  assert.deepEqual(output.sources.find((item) => item.id === "coss").counts.by_kind, {
    particle: 1,
  });
  assert.equal(output.cache.entries[0].physical_files, 1);
  assert.equal(output.cache.entries[0].payload_source_files, 2);
});

test("generated showroom is self-contained and carries every catalog and paid mapping", async () => {
  const [html, dataText] = await Promise.all([
    readFile(HTML_URL, "utf8"),
    readFile(DATA_URL, "utf8"),
  ]);
  const data = JSON.parse(dataText);

  assert.equal(data.summary.total_assets, 5996);
  assert.equal(data.assets.length, 5996);
  assert.equal(data.sources.length, 12);
  assert.equal(data.summary.paid_items, 2176);
  assert.equal(data.summary.provider_group_records, 23);
  assert.equal(data.summary.concrete_paid_items, 2153);
  assert.equal(data.summary.mapped_paid_items, 2153);
  assert.equal(data.summary.cached_roots, 48);
  assert.equal(data.summary.cached_files, 93);
  assert.equal(data.discovery.length, 5);
  assert.equal(
    data.discovery.filter((item) => item.decision_status === "approved-for-catalog-and-contextual-use").length,
    3,
  );
  assert.equal(
    data.discovery.filter((item) => item.decision_status === "approved-for-selective-comparison").length,
    2,
  );
  assert.equal(data.themes.length, 42);
  assert.equal(new Set(data.assets.map((item) => item.id)).size, 5996);
  assert.equal(data.assets.filter((item) => item.alternatives.length > 0).length, 2153);

  const sourceCount = data.sources.reduce((sum, source) => sum + source.count, 0);
  assert.equal(sourceCount, data.assets.length);
  for (const source of data.sources) {
    const cacheCounts = source.counts.by_source_cache_status;
    assert.equal(cacheCounts["source-cached"] + cacheCounts["not-cached"], source.count);
  }

  const origin = data.sources.find((source) => source.id === "coss-origin");
  assert.equal(origin.count, 646);
  assert.equal(origin.counts.by_kind.particle, 599);
  assert.equal(origin.counts.by_access_status["paid-source-after-license"] ?? 0, 0);
  const current = data.sources.find((source) => source.id === "coss");
  assert.equal(current.count, 577);
  assert.equal(current.counts.by_kind.particle, 508);

  const reui = data.sources.find((source) => source.id === "reui");
  assert.deepEqual(reui.counts.by_access_tier, { free: 1149, pro: 518, ultimate: 648 });
  assert.equal(data.variants.reui.variants.length, 16);
  assert.equal(data.variants.reui.icon_style_count, 4);
  assert.equal(data.variants.reui.icon_render_variant_count, 2552);

  assert.equal(
    data.cache.entries.reduce((sum, entry) => sum + entry.physical_files, 0),
    data.summary.cached_files,
  );
  assert.ok(
    data.cache.entries.reduce((sum, entry) => sum + entry.payload_source_files, 0) >
      data.summary.cached_files,
  );
  assert.equal(
    data.assets.filter((asset) => asset.cache.status === "source-cached").length,
    data.summary.cached_entries,
  );

  assert.match(html, /<script id="showroom-data" type="application\/json">/);
  assert.match(html, /data-view="catalog"/);
  assert.match(html, /data-view="alternatives"/);
  assert.match(html, /data-view="themes"/);
  assert.doesNotMatch(html, /<script[^>]+src=/);
  assert.doesNotMatch(html, /<link[^>]+rel="stylesheet"/);
  assert.doesNotMatch(html, /fetch\(/);
  assert.match(html, /id="catalog-tier"/);
  assert.match(html, /id="alt-status"/);
  assert.doesNotMatch(html, /class="toolbar" style="grid-template-columns/);
  assert.match(html, /\.toolbar-alternatives/);
  assert.match(html, /\.asset-card:focus-visible/);
  assert.match(html, /discovery-component-selection-required/);
  assert.match(html, /id="nav-sources">—/);
  assert.ok(html.length > 1_000_000, "full offline data should be embedded in the HTML");

  const embeddedText = html.match(
    /<script id="showroom-data" type="application\/json">([\s\S]*?)<\/script>/,
  )?.[1];
  assert.ok(embeddedText, "embedded JSON must exist");
  assert.deepEqual(JSON.parse(embeddedText), data);
});
