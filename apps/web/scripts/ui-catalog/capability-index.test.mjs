import assert from "node:assert/strict";
import test from "node:test";

import {
  buildCapabilityIndex,
  canonicalCapabilityIds,
  queryCapabilityIndex,
} from "./build-capability-index.mjs";

function asset(source, name, overrides = {}) {
  return {
    source,
    upstream_name: name,
    display_name: name,
    description: "",
    kind: "particle",
    category: "uncategorized",
    preview_url: `https://example.com/${source}/${name}`,
    source_url: `https://example.com/${source}/${name}.json`,
    install_command: `add ${source}/${name}`,
    foundation: "test foundation",
    license: "test license",
    dependencies: [],
    project_fit: "review-required",
    theme_ready: "unknown",
    last_verified: "2026-08-19",
    upstream_ref: "sha256:test",
    local_status: "catalogued",
    local_path: "",
    decision_record: "",
    comparison_record: "",
    ...overrides,
  };
}

test("assigns canonical capability ids from names, categories and descriptions", () => {
  assert(canonicalCapabilityIds(asset("coss", "p-date-picker-2")).includes("date-picker"));
  assert(canonicalCapabilityIds(asset("reui", "data-grid-filtering-1")).includes("data-grid"));
  assert(canonicalCapabilityIds(asset("tweakcn", "modern-minimal", {
    kind: "theme",
    category: "theme",
  })).includes("themes"));
});

test("preserves every catalog item and indexes every asset", () => {
  const catalogs = [
    {
      source: "shadcn",
      coverage: "partial",
      items: [asset("shadcn", "date-picker-with-range")],
    },
    {
      source: "coss",
      coverage: "complete",
      items: [asset("coss", "p-date-picker-2", { category: "date picker" })],
    },
    {
      source: "tremor",
      coverage: "partial",
      items: [asset("tremor", "DatePicker", { category: "input" })],
    },
  ];

  const index = buildCapabilityIndex(catalogs, {
    generatedAt: "2026-08-19T00:00:00.000Z",
  });

  assert.equal(index.total_items, 3);
  assert.equal(index.indexed_items, 3);
  assert.equal(index.assets.length, 3);
  assert(index.assets.every((item) => item.capability_ids.length >= 3));

  const datePicker = index.capabilities.find((item) => item.id === "date-picker");
  assert.deepEqual(datePicker.sources, ["coss", "shadcn", "tremor"]);
  assert.equal(datePicker.candidate_count, 3);
});

test("sorts output deterministically and rejects duplicate identities", () => {
  const first = asset("reui", "z-last");
  const second = asset("coss", "a-first");
  const index = buildCapabilityIndex([
    { source: "mixed", coverage: "partial", items: [first, second] },
  ]);

  assert.deepEqual(index.assets.map((item) => item.id), ["coss:a-first", "reui:z-last"]);

  assert.throws(
    () => buildCapabilityIndex([
      { source: "coss", coverage: "complete", items: [second, second] },
    ]),
    /duplicate asset identity/,
  );
});

test("queries an exact capability and can narrow candidates by source", () => {
  const index = buildCapabilityIndex([
    {
      source: "mixed",
      coverage: "partial",
      items: [
        asset("shadcn", "date-picker-with-range"),
        asset("coss", "p-date-picker-2"),
        asset("reui", "data-grid-base-1"),
      ],
    },
  ]);

  assert.equal(queryCapabilityIndex(index, "date-picker").total_matches, 2);
  const cossOnly = queryCapabilityIndex(index, "date-picker", { source: "coss" });
  assert.deepEqual(cossOnly.candidates.map((item) => item.id), ["coss:p-date-picker-2"]);
});
