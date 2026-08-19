import assert from "node:assert/strict";
import test from "node:test";

import {
  assertStableItemCount,
  buildCatalogIndex,
  buildSnapshot,
  parseCossOrigin,
  parseAceternityHtml,
  parseApprovedRegistry,
  parseReactBitsProSitemap,
  parseReactBitsTree,
  parseReui,
  parseShadcnRegistries,
  parseTremorLegacySitemap,
  parseTweakcnPresets,
  parseKiboRegistryAndBlocks,
  shadcnExamplePreviewUrl,
  tremorComponentPreviewUrl,
} from "./sync.mjs";

const context = { upstreamRef: "test", lastVerified: "2026-08-19" };

test("stale checks reject both upstream additions and removals", () => {
  assert.doesNotThrow(() => assertStableItemCount(12, 12));
  assert.throws(() => assertStableItemCount(12, 13), /item-count drift 12 -> 13/);
  assert.throws(() => assertStableItemCount(12, 11), /item-count drift 12 -> 11/);
});

test("catalog index totals every snapshot after a targeted refresh", () => {
  const snapshots = [
    {
      source: "alpha",
      coverage: "complete",
      coverage_note: "alpha note",
      upstream_ref: "sha256:alpha",
      counts: {
        total: 2,
        by_access_status: { "public-source": 2 },
        by_source_cache_status: { "not-cached": 2 },
      },
    },
    {
      source: "beta",
      coverage: "partial",
      coverage_note: "beta note",
      upstream_ref: "sha256:beta",
      counts: {
        total: 3,
        by_access_status: { "public-metadata-only": 1, "public-source": 2 },
        by_source_cache_status: { cached: 1, "not-cached": 2 },
      },
    },
  ];

  const index = buildCatalogIndex(snapshots, {
    fetchedAt: "2026-08-19T00:00:00.000Z",
  });
  assert.equal(index.total_items, 5);
  assert.deepEqual(index.counts.by_access_status, {
    "public-metadata-only": 1,
    "public-source": 4,
  });
  assert.deepEqual(index.counts.by_source_cache_status, {
    cached: 1,
    "not-cached": 4,
  });
  assert.deepEqual(index.sources.map((source) => source.id), ["alpha", "beta"]);
});

test("routes shadcn and Tremor examples to their real documentation sections", () => {
  assert.equal(
    shadcnExamplePreviewUrl("date-picker-with-range"),
    "https://ui.shadcn.com/docs/components/date-picker",
  );
  assert.equal(
    tremorComponentPreviewUrl("DatePicker"),
    "https://www.tremor.so/docs/inputs/date-picker",
  );
  assert.equal(
    tremorComponentPreviewUrl("BarChart"),
    "https://www.tremor.so/docs/visualizations/bar-chart",
  );
  assert.equal(
    tremorComponentPreviewUrl("Accordion"),
    "https://www.tremor.so/docs/ui/accordion",
  );
});

test("parses all Aceternity raw JSON groups and keeps paid state", () => {
  const html = `
    Free Components JSON (1 components)</summary><pre>[{&quot;name&quot;:&quot;grid&quot;,&quot;title&quot;:&quot;Grid&quot;,&quot;documentationUrl&quot;:&quot;https://ui.aceternity.com/components/grid&quot;,&quot;installCommand&quot;:&quot;npx shadcn@latest add @aceternity/grid&quot;,&quot;isPro&quot;:false}]</pre>
    Pro Components JSON (1 components)</summary><pre>[{&quot;name&quot;:&quot;/blocks/navbars&quot;,&quot;title&quot;:&quot;Navbars&quot;,&quot;documentationUrl&quot;:&quot;https://ui.aceternity.com/blocks/navbars&quot;,&quot;installCommand&quot;:&quot;Available with Pro license&quot;,&quot;isPro&quot;:true}]</pre>
    Templates JSON (1 templates)</summary><pre>[{&quot;name&quot;:&quot;/templates/demo&quot;,&quot;title&quot;:&quot;Demo&quot;,&quot;documentationUrl&quot;:&quot;https://ui.aceternity.com/templates/demo&quot;,&quot;installCommand&quot;:&quot;Available with Pro license&quot;,&quot;isPro&quot;:true,&quot;isTemplate&quot;:true}]</pre>
    Pro Blocks JSON (1 blocks)</summary><pre>[{&quot;title&quot;:&quot;Stats&quot;,&quot;slug&quot;:&quot;/blocks/stats/stats-01&quot;,&quot;category&quot;:&quot;stats&quot;,&quot;documentationUrl&quot;:&quot;https://ui.aceternity.com/blocks/stats/stats-01&quot;}]</pre>
    use-outside-click
  `;

  const items = parseAceternityHtml(html, {
    upstreamRef: "test",
    lastVerified: "2026-08-19",
  });

  assert.equal(items.length, 5);
  assert.equal(items.find((item) => item.upstream_name === "grid").kind, "component");
  assert.equal(items.find((item) => item.upstream_name === "/templates/demo").kind, "template");
  assert.match(items.find((item) => item.upstream_name === "/blocks/navbars").license, /Pro/);
});

test("deduplicates React Bits code variants into one catalog capability", () => {
  const tree = {
    tree: [
      { path: "src/content/TextAnimations/BlurText/BlurText.jsx" },
      { path: "src/content/TextAnimations/BlurText/BlurText.css" },
      { path: "src/content/Backgrounds/Aurora/Aurora.jsx" },
    ],
  };

  const items = parseReactBitsTree(tree, {
    upstreamRef: "test",
    lastVerified: "2026-08-19",
  });

  assert.deepEqual(items.map((item) => item.upstream_name), ["Aurora", "BlurText"]);
  assert.equal(items[1].install_command, "npx shadcn@latest add @react-bits/BlurText-TS-TW --cwd apps/web");
});

test("extracts all top-level tweakcn default presets", () => {
  const source = `export const defaultPresets = {
  "modern-minimal": {
    label: "Modern Minimal",
    styles: { light: {}, dark: {} },
  },
  graphite: {
    label: "Graphite",
    styles: { light: {}, dark: {} },
  },
};`;

  const items = parseTweakcnPresets(source, {
    upstreamRef: "test",
    lastVerified: "2026-08-19",
  });

  assert.deepEqual(items.map((item) => item.upstream_name), ["graphite", "modern-minimal"]);
  assert.deepEqual(items.map((item) => item.display_name), ["Graphite", "Modern Minimal"]);
});

test("snapshot counts are deterministic and preserve every input item", () => {
  const items = [
    { source: "demo", upstream_name: "b", kind: "block", category: "z" },
    { source: "demo", upstream_name: "a", kind: "component", category: "a" },
  ];
  const snapshot = buildSnapshot("demo", items, {
    fetchedAt: "2026-08-19T00:00:00.000Z",
    upstreamRef: "test",
    coverage: "complete",
    coverageNote: "fixture",
    sourceHash: "sha256:test",
  });

  assert.equal(snapshot.counts.total, 2);
  assert.deepEqual(snapshot.items.map((item) => item.upstream_name), ["b", "a"]);
});

test("unions the complete New York registry with logical-index-only shadcn items", () => {
  const items = parseShadcnRegistries({
    items: [{ name: "button", type: "registry:ui", files: [{ path: "button.tsx" }] }],
  }, [
    { name: "button", type: "registry:ui", files: [{ path: "button.tsx" }] },
    { name: "toast", type: "registry:ui", files: [{ path: "toast.tsx" }] },
  ], context);

  assert.deepEqual(items.map((item) => item.upstream_name), ["button", "toast"]);
  assert.equal(items[1].source_url, "https://ui.shadcn.com/r/styles/base-nova/toast.json");
});

test("keeps Coss Origin components unique while retaining multiple categories", () => {
  const tree = { tree: [
    { path: "apps/origin/public/r/comp-1.json" },
    { path: "apps/origin/public/r/button.json" },
  ] };
  const categorySource = `export const categories = [
    { components: [{ name: "comp-1" }], name: "Button", slug: "button" },
    { components: [{ name: "comp-1" }], name: "Upload", slug: "file-upload" },
  ];`;
  const items = parseCossOrigin(tree, categorySource, context);

  assert.equal(items.length, 2);
  assert.deepEqual(items.find((item) => item.upstream_name === "comp-1").upstream_meta.categories, ["button", "file-upload"]);
});

test("separates free ReUI examples from Pro blocks and Ultimate icons/templates", () => {
  const registry = { items: [
    { name: "c-alert-dialog-1", type: "registry:block", files: [{ path: "a.tsx" }] },
    { name: "app-shell-1", type: "registry:block", meta: { group: "application" }, files: [{ path: "b.tsx" }] },
  ] };
  const llms = `- [Archive (2)](https://reui.io/icons/archive)\n- [Demo](https://reui.io/template/demo)`;
  const page = `{"name":"archive","slug":"archive","category":"archive","styles":["filled"]},{"name":"archive-tick","slug":"archive-tick","category":"archive","styles":["filled"]}`;
  const items = parseReui(registry, llms, { archive: page }, context);

  assert.equal(items.length, 5);
  assert.equal(items.find((item) => item.upstream_name === "c-alert-dialog-1").category, "alert-dialog");
  assert.equal(items.find((item) => item.upstream_name === "app-shell-1").access_tier, "pro");
  assert.equal(items.find((item) => item.kind === "icon").access_tier, "ultimate");
});

test("parses only asset leaves from React Bits Pro and live Tremor legacy sitemaps", () => {
  const pro = parseReactBitsProSitemap(`
    <loc>https://pro.reactbits.dev/docs/components/globe</loc>
    <loc>https://pro.reactbits.dev/docs/blocks/hero/hero-1</loc>
    <loc>https://pro.reactbits.dev/docs/agent-kit/agent-skill</loc>
    <loc>https://pro.reactbits.dev/docs/agent-kit/skills/editorial</loc>
  `, context);
  const legacy = parseTremorLegacySitemap(`
    <loc>/docs/ui/button</loc><loc>/docs/visualizations/bar-chart</loc><loc>/docs/getting-started/installation</loc>
  `, context);

  assert.deepEqual(pro.map((item) => item.upstream_name), ["component/globe", "block/hero/hero-1", "agent-kit/skills/editorial"]);
  assert.equal(legacy.length, 2);
  assert(legacy.every((item) => item.maintenance_status === "maintenance-stale"));
});

test("normalizes approved Registry sources without losing source and access boundaries", () => {
  const sample = { items: [
    { name: "message", title: "Message", type: "registry:component", files: [{ path: "message.tsx" }] },
    { name: "example-chatbot", type: "registry:block", files: [{ path: "chatbot.tsx" }] },
  ] };
  const items = parseApprovedRegistry("ai-elements", sample, context);

  assert.equal(items.length, 2);
  assert.equal(items[0].source, "ai-elements");
  assert.equal(items[0].category, "ai-element");
  assert.equal(items[0].source_url, "https://elements.ai-sdk.dev/api/registry/message.json");
  assert.equal(items[1].kind, "block");
  assert.equal(items[1].preview_url, "https://elements.ai-sdk.dev/examples/chatbot");
});

test("keeps Kibo Registry source separate from docs-only blocks", () => {
  const registry = { items: [
    { name: "gantt", type: "registry:ui", files: [{ path: "gantt.tsx" }] },
  ] };
  const homepage = `<a href="/blocks/codebase">Codebase</a><a href="/blocks/form">Form</a><a href="/components/gantt">Gantt</a>`;
  const items = parseKiboRegistryAndBlocks(registry, homepage, context);

  assert.deepEqual(items.map((item) => item.upstream_name), ["gantt", "block/codebase", "block/form"]);
  assert.equal(items[0].access_status, "public-source");
  assert(items.slice(1).every((item) => item.access_status === "public-metadata-only"));
});

test("routes Dice, Animate and Motion Registry items to official previews", () => {
  const registry = { items: [{ name: "text-effect", type: "registry:ui", files: [{ path: "text-effect.tsx" }] }] };
  const motion = parseApprovedRegistry("motion-primitives", registry, context)[0];
  assert.equal(motion.preview_url, "https://motion-primitives.com/docs/text-effect");

  const animate = parseApprovedRegistry("animate-ui", {
    items: [{ name: "components-buttons-button", type: "registry:ui", files: [{ path: "button.tsx" }] }],
  }, context)[0];
  assert.equal(animate.preview_url, "https://animate-ui.com/docs/components/buttons/button");

  const dice = parseApprovedRegistry("dice-ui", {
    items: [{ name: "data-grid-demo", type: "registry:example", files: [{ path: "data-grid-demo.tsx" }] }],
  }, context)[0];
  assert.equal(dice.preview_url, "https://diceui.com/docs/components/radix/data-grid");
  assert.equal(dice.source_url, "https://diceui.com/r/radix-vega/data-grid-demo.json");
});
