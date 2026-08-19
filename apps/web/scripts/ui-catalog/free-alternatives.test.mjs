import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { buildFreeAlternatives } from "./build-free-alternatives.mjs";

const ROOT = new URL("../../../../", import.meta.url);
const OUTPUT = new URL("docs/frontend/ui-assets/free-alternatives.json", ROOT);
const DISCOVERY = new URL("docs/frontend/ui-assets/discovery.json", ROOT);

function asset(id, overrides = {}) {
  const separator = id.indexOf(":");
  return {
    id,
    source: id.slice(0, separator),
    upstream_name: id.slice(separator + 1),
    display_name: id.slice(separator + 1),
    description: "",
    kind: "block",
    category: "hero",
    capability_ids: ["background-effects", "kind/block", "category/hero"],
    preview_url: `https://example.com/${id}`,
    source_url: `https://example.com/${id}.json`,
    license: "MIT",
    access_status: "public-source",
    maintenance_status: "current",
    adaptation_cost: "medium",
    ...overrides,
  };
}

test("prefers a same-brand free source before a cross-library match", () => {
  const paid = asset("magic-ui-pro:block/hero-1", {
    access_status: "paid-source-after-license",
    license: "Magic UI Pro commercial license",
  });
  const sameBrand = asset("magic-ui:aurora-text");
  const crossLibrary = asset("aceternity:aurora-background");

  const output = buildFreeAlternatives({ assets: [paid, crossLibrary, sameBrand] });
  assert.equal(output.mappings.length, 1);
  assert.equal(output.mappings[0].closest_free_alternatives[0].id, sameBrand.id);
  assert.equal(
    output.mappings[0].closest_free_alternatives[0].match_level,
    "same-brand-free",
  );
});

test("maps paid icon concepts to legal open icon libraries", () => {
  const paidIcon = asset("reui:icon/arrow-up", {
    kind: "icon",
    category: "arrow",
    capability_ids: ["kind/icon", "category/arrow"],
    access_status: "paid-source-after-license",
    license: "ReUI commercial license",
  });

  const output = buildFreeAlternatives({ assets: [paidIcon] });
  const alternatives = output.mappings[0].closest_free_alternatives;
  assert.equal(alternatives[0].id, "external:lucide-icons");
  assert.equal(alternatives[0].license, "ISC");
  assert(alternatives.some((candidate) => candidate.id === "external:tabler-icons"));
});

test("generated discovery shortlist is official, open-source and explicitly not cached", async () => {
  const discovery = JSON.parse(await readFile(DISCOVERY, "utf8"));
  assert.equal(discovery.schema_version, 1);
  assert.ok(discovery.sources.length >= 5);
  assert.equal(new Set(discovery.sources.map((item) => item.id)).size, discovery.sources.length);

  for (const source of discovery.sources) {
    assert.match(source.license, /MIT|Apache-2\.0/);
    assert.match(source.official_url, /^https:\/\//);
    assert.match(source.repository_url, /^https:\/\/github\.com\//);
    assert.equal(source.catalog_status, "discovery-only");
    assert.equal(source.source_cache_status, "not-cached");
    assert.ok(source.visual_style?.trim());
    assert.ok(source.best_for?.length > 0);
  }
});

test("generated mapping covers every paid catalog asset without recommending paid source", async () => {
  const output = JSON.parse(await readFile(OUTPUT, "utf8"));

  assert.equal(output.schema_version, 1);
  assert.equal(output.summary.paid_items, 2160);
  assert.equal(output.mappings.length, 2160);
  assert.deepEqual(output.summary.by_paid_source, {
    aceternity: 207,
    "magic-ui-pro": 101,
    "react-bits-pro": 702,
    reui: 1150,
  });
  assert.equal(new Set(output.mappings.map((item) => item.paid_asset.id)).size, 2160);

  for (const mapping of output.mappings) {
    assert.equal(mapping.paid_asset.access_status, "paid-source-after-license");
    assert.ok(mapping.closest_free_alternatives.length >= 1, `${mapping.paid_asset.id} has no replacement`);
    assert.ok(mapping.closest_free_alternatives.length <= 3);
    for (const candidate of mapping.closest_free_alternatives) {
      assert.ok(
        ["catalog-asset", "external-oss", "composition"].includes(candidate.type),
        `${mapping.paid_asset.id} has unknown candidate type`,
      );
      assert.notEqual(candidate.access_status, "paid-source-after-license");
      assert.ok(candidate.reason?.trim());
      assert.ok(candidate.tradeoff?.trim());
    }
  }
});
