import assert from "node:assert/strict";
import test from "node:test";

import {
  normalizeRegistryItem,
  validateCatalog,
} from "./catalog.mjs";

const context = {
  source: "coss",
  catalogUrl: "https://coss.com/ui/r/registry.json",
  itemUrlTemplate: "https://coss.com/ui/r/{name}.json",
  previewUrlTemplate: "https://coss.com/ui/docs/components/{name}",
  installCommandTemplate: "npx shadcn@latest add @coss/{name}",
  foundation: "Base UI",
  license: "MIT (apps/ui only; verify file path)",
  lastVerified: "2026-08-19",
  upstreamRef: "etag:test",
};

test("normalizes a registry item without losing upstream metadata", () => {
  const upstream = {
    name: "calendar",
    type: "registry:ui",
    description: "A calendar with range support.",
    dependencies: ["@daypicker/react"],
    registryDependencies: ["@coss/button"],
    meta: { category: "date" },
  };

  const item = normalizeRegistryItem(upstream, context);

  assert.equal(item.source, "coss");
  assert.equal(item.upstream_name, "calendar");
  assert.equal(item.kind, "primitive");
  assert.equal(item.category, "date");
  assert.equal(item.preview_url, "https://coss.com/ui/docs/components/calendar");
  assert.equal(item.source_url, "https://coss.com/ui/r/calendar.json");
  assert.equal(item.install_command, "npx shadcn@latest add @coss/calendar");
  assert.deepEqual(item.dependencies, ["@coss/button", "@daypicker/react"]);
  assert.equal(item.local_status, "catalogued");
  assert.deepEqual(item.upstream_meta, upstream);
});

test("keeps items that are not currently recommended", () => {
  const items = [
    normalizeRegistryItem({ name: "button", type: "registry:ui" }, context),
    normalizeRegistryItem({ name: "p-toolbar-99", type: "registry:block" }, context),
  ];

  assert.equal(items.length, 2);
  assert.equal(items[1].upstream_name, "p-toolbar-99");
});

test("rejects duplicate identities and missing provenance", () => {
  const valid = normalizeRegistryItem(
    { name: "calendar", type: "registry:ui" },
    context,
  );
  const broken = { ...valid, source_url: "", license: "" };
  const result = validateCatalog([valid, broken]);

  assert.equal(result.ok, false);
  assert(result.errors.some((error) => error.includes("duplicate")));
  assert(result.errors.some((error) => error.includes("source_url")));
  assert(result.errors.some((error) => error.includes("license")));
});

test("preferred assets require a comparison and decision record", () => {
  const item = {
    ...normalizeRegistryItem({ name: "calendar", type: "registry:ui" }, context),
    local_status: "preferred",
  };
  const result = validateCatalog([item]);

  assert.equal(result.ok, false);
  assert(result.errors.some((error) => error.includes("decision_record")));
  assert(result.errors.some((error) => error.includes("comparison_record")));
});
