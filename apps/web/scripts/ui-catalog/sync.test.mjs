import assert from "node:assert/strict";
import test from "node:test";

import {
  buildSnapshot,
  parseAceternityHtml,
  parseReactBitsTree,
  parseTweakcnPresets,
} from "./sync.mjs";

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
  assert.equal(items[1].install_command, "npx shadcn@latest add @react-bits/BlurText-TS-TW");
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
