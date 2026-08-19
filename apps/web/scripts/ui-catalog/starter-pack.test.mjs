import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const ROOT = new URL("../../../../", import.meta.url);
const STARTER = new URL("docs/frontend/ui-assets/starter-pack.json", ROOT);
const CATALOG_INDEX = new URL("docs/frontend/ui-assets/catalogs/index.json", ROOT);

async function readJson(url) {
  return JSON.parse(await readFile(url, "utf8"));
}

test("starter pack contains only real public-source assets across the approved non-shadcn sources", async () => {
  const starter = await readJson(STARTER);
  const index = await readJson(CATALOG_INDEX);
  const items = new Map();

  for (const source of index.sources) {
    const catalog = await readJson(new URL(`docs/frontend/ui-assets/catalogs/${source.file}`, ROOT));
    for (const item of catalog.items) items.set(`${item.source}:${item.upstream_name}`, item);
  }

  assert.equal(starter.schema_version, 1);
  assert.equal(starter.strategy, "curated-high-probability-public-source");
  assert.ok(starter.roots.length >= 35, "starter pack must contain at least 35 roots");
  assert.ok(starter.roots.length <= 70, "starter pack should stay curated instead of mirroring everything");

  const approvedSources = new Set([
    "coss",
    "reui",
    "tremor",
    "aceternity",
    "magic-ui",
    "react-bits",
    "tweakcn",
  ]);
  const seenSources = new Set();
  const seenIds = new Set();
  const useCases = new Set();

  for (const root of starter.roots) {
    assert.ok(!seenIds.has(root.asset_id), `duplicate root ${root.asset_id}`);
    seenIds.add(root.asset_id);

    const item = items.get(root.asset_id);
    assert.ok(item, `unknown catalog asset ${root.asset_id}`);
    assert.equal(item.access_status, "public-source", `${root.asset_id} is not public source`);
    assert.ok(approvedSources.has(item.source), `${root.asset_id} uses an unapproved source`);
    assert.notEqual(item.source, "shadcn", "starter cache must focus on non-shadcn sources");
    assert.ok(root.reason?.trim(), `${root.asset_id} needs a selection reason`);
    assert.ok(Array.isArray(root.use_cases) && root.use_cases.length > 0, `${root.asset_id} needs use cases`);

    seenSources.add(item.source);
    root.use_cases.forEach((useCase) => useCases.add(useCase));
  }

  assert.deepEqual([...seenSources].sort(), [...approvedSources].sort());
  for (const required of [
    "date-range",
    "filters",
    "data-grid",
    "feedback",
    "empty-state",
    "analytics-layout",
    "ai-accent",
    "runtime-theme",
  ]) {
    assert.ok(useCases.has(required), `missing required use case ${required}`);
  }
});
