import { createHash } from "node:crypto";
import {
  mkdir,
  readFile,
  rename,
  writeFile,
} from "node:fs/promises";
import { basename } from "node:path";
import process from "node:process";
import { pathToFileURL } from "node:url";

import { normalizeRegistryItem, validateCatalog } from "./catalog.mjs";
import { UI_SOURCES } from "./sources.mjs";

const CATALOG_ROOT = new URL(
  "../../../../docs/frontend/ui-assets/catalogs/",
  import.meta.url,
);
const LAST_VERIFIED = "2026-08-19";
const LOCAL_FIELDS = [
  "local_status",
  "local_path",
  "decision_record",
  "comparison_record",
];

const FIXTURE_FILES = {
  shadcn: ["ui-shadcn-tree.json"],
  coss: ["ui-coss-registry.json"],
  reui: ["ui-reui-registry.json"],
  tremor: ["ui-tremor-tree.json", "ui-tremor-blocks-tree.json"],
  aceternity: ["ui-aceternity.html"],
  "magic-ui": ["ui-magic-registry.json"],
  "react-bits": ["ui-react-bits-tree.json"],
  tweakcn: ["ui-tweakcn-theme-presets.ts"],
};

function sha256(parts) {
  const hash = createHash("sha256");
  for (const part of parts) hash.update(part);
  return `sha256:${hash.digest("hex")}`;
}

function slugify(value) {
  return value
    .replace(/([a-z0-9])([A-Z])/g, "$1-$2")
    .replace(/[ _]+/g, "-")
    .replace(/-+/g, "-")
    .toLowerCase();
}

function makeItem({
  source,
  name,
  displayName = name,
  description = "",
  kind = "component",
  category = "uncategorized",
  previewUrl,
  sourceUrl,
  installCommand = "",
  foundation,
  license,
  dependencies = [],
  projectFit = "review-required",
  themeReady = "unknown",
  lastVerified = LAST_VERIFIED,
  upstreamRef,
  upstreamMeta = {},
}) {
  return {
    source,
    upstream_name: name,
    display_name: displayName,
    description,
    kind,
    category,
    preview_url: previewUrl,
    source_url: sourceUrl,
    install_command: installCommand,
    foundation,
    license,
    dependencies: [...new Set(dependencies)].sort((a, b) => a.localeCompare(b)),
    project_fit: projectFit,
    theme_ready: themeReady,
    last_verified: lastVerified,
    upstream_ref: upstreamRef,
    local_status: "catalogued",
    local_path: "",
    decision_record: "",
    comparison_record: "",
    upstream_meta: upstreamMeta,
  };
}

function registryContext(source, upstreamRef, overrides = {}) {
  return {
    source,
    lastVerified: LAST_VERIFIED,
    upstreamRef,
    ...overrides,
  };
}

function categoryFromName(name) {
  const withoutPrefix = name.replace(/^c-/, "").replace(/^p-/, "");
  return withoutPrefix.replace(/-\d+$/, "").split("-")[0] || "uncategorized";
}

function parseRegistry(text) {
  const registry = JSON.parse(text);
  if (!Array.isArray(registry.items)) throw new Error("Registry does not include items[]");
  return registry;
}

function parseShadcnTree(tree, context) {
  const paths = tree.tree?.map((entry) => entry.path) ?? [];
  const ref = context.upstreamRef;
  const items = [];

  for (const path of paths.filter((value) =>
    /^apps\/v4\/registry\/new-york-v4\/ui\/[^/]+\.tsx$/.test(value),
  )) {
    const name = basename(path, ".tsx");
    items.push(makeItem({
      source: "shadcn",
      name,
      kind: "primitive",
      category: categoryFromName(name),
      previewUrl: `https://ui.shadcn.com/docs/components/${name}`,
      sourceUrl: `https://github.com/shadcn-ui/ui/blob/main/${path}`,
      installCommand: `npx shadcn@latest add ${name} --cwd apps/web`,
      foundation: "shadcn New York v4 / Radix",
      license: "MIT",
      projectFit: "global-base",
      themeReady: "yes",
      upstreamRef: ref,
      upstreamMeta: { path },
    }));
  }

  for (const entry of tree.tree ?? []) {
    const match = entry.path.match(
      /^apps\/v4\/registry\/new-york-v4\/blocks\/([^/]+)$/,
    );
    if (!match || entry.type !== "tree") continue;
    const name = match[1];
    items.push(makeItem({
      source: "shadcn",
      name,
      displayName: name,
      kind: "block",
      category: name.split("-")[0],
      previewUrl: `https://ui.shadcn.com/blocks#${name}`,
      sourceUrl: `https://github.com/shadcn-ui/ui/tree/main/${entry.path}`,
      installCommand: `npx shadcn@latest add ${name} --cwd apps/web`,
      foundation: "shadcn New York v4 / Radix",
      license: "MIT",
      projectFit: "page-shell-or-block",
      themeReady: "yes",
      upstreamRef: ref,
      upstreamMeta: { path: entry.path },
    }));
  }

  for (const path of paths.filter((value) =>
    /^apps\/v4\/registry\/new-york-v4\/examples\/[^/]+\.tsx$/.test(value),
  )) {
    const name = basename(path, ".tsx");
    items.push(makeItem({
      source: "shadcn",
      name,
      kind: "particle",
      category: categoryFromName(name),
      previewUrl: `https://ui.shadcn.com/docs/components/${categoryFromName(name)}`,
      sourceUrl: `https://github.com/shadcn-ui/ui/blob/main/${path}`,
      installCommand: `npx shadcn@latest add ${name} --cwd apps/web`,
      foundation: "shadcn New York v4 / Radix",
      license: "MIT",
      projectFit: "composition-reference",
      themeReady: "yes",
      upstreamRef: ref,
      upstreamMeta: { path },
    }));
  }

  for (const path of paths.filter((value) =>
    /^apps\/v4\/registry\/styles\/style-[^/]+\.css$/.test(value),
  )) {
    const name = basename(path, ".css").replace(/^style-/, "");
    items.push(makeItem({
      source: "shadcn",
      name: `style-${name}`,
      displayName: name,
      kind: "style",
      category: "style",
      previewUrl: "https://ui.shadcn.com/docs/installation",
      sourceUrl: `https://github.com/shadcn-ui/ui/blob/main/${path}`,
      foundation: "shadcn CSS variables / Tailwind v4",
      license: "MIT",
      projectFit: "theme-foundation-reference",
      themeReady: "yes",
      upstreamRef: ref,
      upstreamMeta: { path },
    }));
  }

  for (const foundation of ["aria", "base", "radix"]) {
    const path = `apps/v4/registry/bases/${foundation}`;
    if (!paths.includes(path)) continue;
    items.push(makeItem({
      source: "shadcn",
      name: `foundation-${foundation}`,
      displayName: `${foundation} foundation`,
      kind: "style",
      category: "foundation",
      previewUrl: "https://ui.shadcn.com/docs",
      sourceUrl: `https://github.com/shadcn-ui/ui/tree/main/${path}`,
      foundation,
      license: "MIT",
      projectFit: foundation === "radix" ? "current-base" : "alternative-base",
      themeReady: "yes",
      upstreamRef: ref,
      upstreamMeta: { path },
    }));
  }

  return items;
}

function parseCossRegistry(registry, context) {
  return registry.items.map((item) => {
    const normalized = normalizeRegistryItem(
      item,
      registryContext("coss", context.upstreamRef, {
        catalogUrl: "https://coss.com/ui/r/registry.json",
        itemUrlTemplate: "https://coss.com/ui/r/{name}.json",
        previewUrlTemplate: "https://coss.com/ui/docs/components/{name}",
        installCommandTemplate: "npx shadcn@latest add @coss/{name} --cwd apps/web",
        foundation: "Base UI + Tailwind CSS v4",
        license: "MIT when sourced from coss apps/ui; verify file path",
        projectFit: "micro-detail-first",
        themeReady: "yes",
      }),
    );
    if (item.name.startsWith("p-")) {
      normalized.kind = "particle";
      normalized.preview_url = `https://coss.com/ui/particles?search=${item.name}`;
    }
    if (item.categories?.length) normalized.category = item.categories[0];
    return normalized;
  });
}

function parseReuiRegistry(registry, context) {
  return registry.items.map((item) => {
    const normalized = normalizeRegistryItem(
      item,
      registryContext("reui", context.upstreamRef, {
        catalogUrl: "https://reui.io/r/registry.json",
        itemUrlTemplate: "https://reui.io/r/registry.json",
        previewUrlTemplate: "https://reui.io/components/{name}",
        installCommandTemplate: "npx shadcn@latest add @reui/{name} --cwd apps/web",
        foundation: "Base UI base-nova snapshot; Radix variants upstream",
        license: "MIT",
        projectFit: "complex-data-or-pattern",
        themeReady: "yes",
      }),
    );
    normalized.category = item.meta?.group ?? categoryFromName(item.name);
    normalized.preview_url = item.name.startsWith("c-")
      ? `https://reui.io/components/${normalized.category}`
      : `https://reui.io/docs/${item.name}`;
    return normalized;
  });
}

function parseTremorTrees(componentTree, blockTree, context) {
  const items = [];
  const componentEntries = componentTree.tree ?? [];
  const blockEntries = blockTree.tree ?? [];

  for (const entry of componentEntries) {
    const match = entry.path.match(/^src\/components\/([^/]+)$/);
    if (!match || entry.type !== "tree") continue;
    const name = match[1];
    items.push(makeItem({
      source: "tremor",
      name: `component/${name}`,
      displayName: name,
      kind: "component",
      category: /chart|barlist|tracker/i.test(name) ? "visualization" : categoryFromName(name),
      previewUrl: `https://www.tremor.so/docs/visualizations/${slugify(name)}`,
      sourceUrl: `https://github.com/tremorlabs/tremor/tree/main/${entry.path}`,
      foundation: "Tremor React package",
      license: "Apache-2.0",
      projectFit: "dashboard-component-reference",
      themeReady: "partial",
      upstreamRef: context.upstreamRef,
      upstreamMeta: { repository: "tremorlabs/tremor", path: entry.path },
    }));
  }

  for (const entry of blockEntries) {
    const match = entry.path.match(
      /^src\/content\/components\/([^/]+)\/([^/]+\.tsx)$/,
    );
    if (!match || match[2] === "index.tsx") continue;
    const category = match[1];
    const name = basename(match[2], ".tsx");
    items.push(makeItem({
      source: "tremor",
      name: `block/${category}/${name}`,
      displayName: name,
      kind: "block",
      category,
      previewUrl: `https://www.tremor.so/blocks/${category}`,
      sourceUrl: `https://github.com/tremorlabs/tremor-blocks/blob/main/${entry.path}`,
      foundation: "React + Tailwind dashboard block",
      license: "MIT",
      projectFit: "kpi-dashboard-or-report-layout",
      themeReady: "partial",
      upstreamRef: context.upstreamRef,
      upstreamMeta: { repository: "tremorlabs/tremor-blocks", path: entry.path },
    }));
  }

  return items;
}

function decodeHtml(value) {
  return value
    .replaceAll("&quot;", '"')
    .replaceAll("&#x27;", "'")
    .replaceAll("&amp;", "&")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replace(/<!--\s*-->/g, "");
}

function extractHtmlJson(html, label) {
  const labelIndex = html.indexOf(label);
  if (labelIndex < 0) throw new Error(`Missing Aceternity group: ${label}`);
  const preStart = html.indexOf(">", html.indexOf("<pre", labelIndex)) + 1;
  const preEnd = html.indexOf("</pre>", preStart);
  if (preStart === 0 || preEnd < 0) throw new Error(`Malformed Aceternity group: ${label}`);
  return JSON.parse(decodeHtml(html.slice(preStart, preEnd)));
}

export function parseAceternityHtml(html, context) {
  const groups = [
    ["Free Components JSON", "component", "free"],
    ["Pro Components JSON", "block", "pro"],
    ["Templates JSON", "template", "pro"],
    ["Pro Blocks JSON", "block", "pro"],
  ];
  const items = [];

  for (const [label, defaultKind, access] of groups) {
    for (const upstream of extractHtmlJson(html, label)) {
      const name = upstream.name ?? upstream.slug;
      const documentationUrl = upstream.documentationUrl;
      const category = upstream.category ?? upstream.categories?.[0] ??
        (defaultKind === "template" ? "template" : categoryFromName(name));
      items.push(makeItem({
        source: "aceternity",
        name,
        displayName: upstream.title ?? name,
        description: upstream.description ?? "",
        kind: upstream.isTemplate ? "template" : defaultKind,
        category,
        previewUrl: documentationUrl,
        sourceUrl: access === "free"
          ? `https://ui.aceternity.com/registry/${name}.json`
          : documentationUrl,
        installCommand: upstream.installCommand ?? "Available with Pro license",
        foundation: "React + Tailwind CSS + Motion",
        license: access === "free"
          ? "Aceternity free item; verify per-item and third-party terms"
          : "Aceternity Pro license; no source redistribution",
        dependencies: [
          ...(upstream.dependencies ?? []),
          ...(upstream.registryDependencies ?? []),
        ],
        projectFit: access === "free" ? "visual-enhancement" : "catalog-only-until-licensed",
        themeReady: "partial",
        lastVerified: context.lastVerified,
        upstreamRef: context.upstreamRef,
        upstreamMeta: { ...upstream, access },
      }));
    }
  }

  if (html.includes("use-outside-click")) {
    items.push(makeItem({
      source: "aceternity",
      name: "use-outside-click",
      displayName: "useOutsideClick",
      description: "Custom hook for detecting clicks outside an element",
      kind: "hook",
      category: "hook",
      previewUrl: "https://ui.aceternity.com/ai-recommendations",
      sourceUrl: "https://ui.aceternity.com/registry/use-outside-click.json",
      installCommand: "npx shadcn@latest add @aceternity/use-outside-click --cwd apps/web",
      foundation: "React",
      license: "Aceternity free item; verify per-item terms",
      projectFit: "utility",
      themeReady: "yes",
      lastVerified: context.lastVerified,
      upstreamRef: context.upstreamRef,
      upstreamMeta: { access: "free" },
    }));
  }

  return items;
}

function parseMagicRegistry(registry, context) {
  return registry.items.map((item) => normalizeRegistryItem(
    item,
    registryContext("magic-ui", context.upstreamRef, {
      catalogUrl: "https://magicui.design/r/registry.json",
      itemUrlTemplate: "https://magicui.design/r/{name}",
      previewUrlTemplate: "https://magicui.design/docs/components/{name}",
      installCommandTemplate: "npx shadcn@latest add @magicui/{name} --cwd apps/web",
      foundation: "React + Tailwind; shadcn-compatible",
      license: "MIT",
      projectFit: "subtle-motion-or-bento",
      themeReady: "partial",
    }),
  ));
}

export function parseReactBitsTree(tree, context) {
  const capabilities = new Map();

  for (const entry of tree.tree ?? []) {
    const match = entry.path.match(/^src\/content\/([^/]+)\/([^/]+)\//);
    if (!match) continue;
    const [, categoryRaw, name] = match;
    capabilities.set(`${categoryRaw}/${name}`, { categoryRaw, name });
  }

  return [...capabilities.values()]
    .map(({ categoryRaw, name }) => {
      const category = slugify(categoryRaw);
      const slug = slugify(name);
      return makeItem({
        source: "react-bits",
        name,
        displayName: name.replace(/([a-z0-9])([A-Z])/g, "$1 $2"),
        kind: categoryRaw === "Components" ? "component" : "motion",
        category,
        previewUrl: `https://reactbits.dev/${category}/${slug}`,
        sourceUrl: `https://github.com/DavidHDev/react-bits/tree/main/src/content/${categoryRaw}/${name}`,
        installCommand: `npx shadcn@latest add @react-bits/${name}-TS-TW`,
        foundation: "React animation component; dependency varies by item",
        license: "MIT + Commons Clause; Pro is separate",
        projectFit: "occasional-motion",
        themeReady: "partial",
        lastVerified: context.lastVerified,
        upstreamRef: context.upstreamRef,
        upstreamMeta: { category: categoryRaw, variants: ["JS-CSS", "JS-TW", "TS-CSS", "TS-TW"] },
      });
    })
    .sort((a, b) => a.upstream_name.localeCompare(b.upstream_name));
}

export function parseTweakcnPresets(source, context) {
  const matches = [...source.matchAll(/^  (?:"([^"]+)"|([A-Za-z0-9_-]+)): \{/gm)];

  return matches
    .map((match, index) => {
      const name = match[1] ?? match[2];
      const end = matches[index + 1]?.index ?? source.length;
      const block = source.slice(match.index, end);
      const label = block.match(/\n\s+label:\s+"([^"]+)"/)?.[1] ?? name;
      return makeItem({
        source: "tweakcn",
        name,
        displayName: label,
        kind: "theme",
        category: "official-default-preset",
        previewUrl: "https://tweakcn.com/editor/theme",
        sourceUrl: "https://github.com/jnsahaj/tweakcn/blob/main/utils/theme-presets.ts",
        foundation: "shadcn CSS variables / Tailwind theme tokens",
        license: "Apache-2.0",
        projectFit: "runtime-theme-source",
        themeReady: "yes",
        lastVerified: context.lastVerified,
        upstreamRef: context.upstreamRef,
        upstreamMeta: { preset_key: name, label },
      });
    })
    .sort((a, b) => a.upstream_name.localeCompare(b.upstream_name));
}

export function buildSnapshot(source, items, metadata) {
  const sortedItems = [...items].sort((a, b) =>
    [a.kind, a.category, a.upstream_name]
      .join("\u0000")
      .localeCompare([b.kind, b.category, b.upstream_name].join("\u0000")),
  );
  const byKind = {};
  const byCategory = {};
  for (const item of sortedItems) {
    byKind[item.kind] = (byKind[item.kind] ?? 0) + 1;
    byCategory[item.category] = (byCategory[item.category] ?? 0) + 1;
  }

  return {
    schema_version: 1,
    source,
    fetched_at: metadata.fetchedAt,
    upstream_ref: metadata.upstreamRef,
    source_hash: metadata.sourceHash,
    coverage: metadata.coverage,
    coverage_note: metadata.coverageNote,
    counts: {
      total: sortedItems.length,
      by_kind: Object.fromEntries(Object.entries(byKind).sort()),
      by_category: Object.fromEntries(Object.entries(byCategory).sort()),
    },
    items: sortedItems,
  };
}

function mergeLocalState(items, previousSnapshot) {
  const previousByIdentity = new Map(
    (previousSnapshot?.items ?? []).map((item) => [
      `${item.source}\u0000${item.upstream_name}`,
      item,
    ]),
  );

  return items.map((item) => {
    const previous = previousByIdentity.get(`${item.source}\u0000${item.upstream_name}`);
    if (!previous) return item;
    return {
      ...item,
      ...Object.fromEntries(LOCAL_FIELDS.map((field) => [field, previous[field] ?? item[field]])),
    };
  });
}

async function fetchText(url) {
  const response = await fetch(url, {
    redirect: "follow",
    headers: { "User-Agent": "ka-pilot-ui-catalog/1.0" },
  });
  if (!response.ok) throw new Error(`${url}: HTTP ${response.status}`);
  return response.text();
}

async function loadParts(source, fixtureDir) {
  if (fixtureDir) {
    return Promise.all(
      FIXTURE_FILES[source.id].map((file) => readFile(`${fixtureDir}/${file}`, "utf8")),
    );
  }
  return Promise.all(source.catalogUrls.map(fetchText));
}

function parseSource(source, parts, sourceHash) {
  const context = {
    upstreamRef: sourceHash,
    lastVerified: LAST_VERIFIED,
  };
  switch (source.id) {
    case "shadcn":
      return parseShadcnTree(JSON.parse(parts[0]), context);
    case "coss":
      return parseCossRegistry(parseRegistry(parts[0]), context);
    case "reui":
      return parseReuiRegistry(parseRegistry(parts[0]), context);
    case "tremor":
      return parseTremorTrees(JSON.parse(parts[0]), JSON.parse(parts[1]), context);
    case "aceternity":
      return parseAceternityHtml(parts[0], context);
    case "magic-ui":
      return parseMagicRegistry(parseRegistry(parts[0]), context);
    case "react-bits":
      return parseReactBitsTree(JSON.parse(parts[0]), context);
    case "tweakcn":
      return parseTweakcnPresets(parts[0], context);
    default:
      throw new Error(`Unsupported source: ${source.id}`);
  }
}

async function readPrevious(sourceId) {
  try {
    return JSON.parse(await readFile(new URL(`${sourceId}.json`, CATALOG_ROOT), "utf8"));
  } catch {
    return null;
  }
}

async function atomicWrite(url, value) {
  await mkdir(new URL("./", url), { recursive: true });
  const temporaryUrl = new URL(url);
  temporaryUrl.pathname = `${temporaryUrl.pathname}.tmp`;
  await writeFile(temporaryUrl, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  await rename(temporaryUrl, url);
}

async function runCli() {
  const write = process.argv.includes("--write");
  const check = process.argv.includes("--check");
  const fixtureFlag = process.argv.indexOf("--fixture-dir");
  const fixtureDir = fixtureFlag >= 0 ? process.argv[fixtureFlag + 1] : "";
  const sourceFlag = process.argv.indexOf("--source");
  const requestedSource = sourceFlag >= 0 ? process.argv[sourceFlag + 1] : "";
  const selectedSources = requestedSource
    ? UI_SOURCES.filter((source) => source.id === requestedSource)
    : UI_SOURCES;

  if (requestedSource && selectedSources.length === 0) {
    throw new Error(`Unknown source: ${requestedSource}`);
  }

  const fetchedAt = new Date().toISOString();
  const snapshots = [];
  const failures = [];

  for (const source of selectedSources) {
    try {
      const parts = await loadParts(source, fixtureDir);
      const sourceHash = sha256(parts);
      const previous = await readPrevious(source.id);
      const parsed = parseSource(source, parts, sourceHash);
      const items = mergeLocalState(parsed, previous);
      const validation = validateCatalog(items);
      if (!validation.ok) throw new Error(validation.errors.join("\n"));

      if (check && previous && items.length < previous.counts.total) {
        throw new Error(
          `item-count collapse ${previous.counts.total} -> ${items.length}; review upstream deletion before refresh`,
        );
      }

      const snapshot = buildSnapshot(source.id, items, {
        fetchedAt,
        upstreamRef: sourceHash,
        sourceHash,
        coverage: source.coverage,
        coverageNote: source.coverageNote,
      });
      snapshots.push(snapshot);
      if (write) await atomicWrite(new URL(`${source.id}.json`, CATALOG_ROOT), snapshot);
      console.log(`${source.id}: ${snapshot.counts.total} items (${source.coverage})`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      failures.push({ source: source.id, error: message });
      console.error(`${source.id}: FAILED - ${message}`);
    }
  }

  if (write && failures.length === 0 && !requestedSource) {
    const index = {
      schema_version: 1,
      fetched_at: fetchedAt,
      total_items: snapshots.reduce((sum, snapshot) => sum + snapshot.counts.total, 0),
      sources: snapshots.map((snapshot) => ({
        id: snapshot.source,
        count: snapshot.counts.total,
        coverage: snapshot.coverage,
        coverage_note: snapshot.coverage_note,
        upstream_ref: snapshot.upstream_ref,
        file: `${snapshot.source}.json`,
      })),
      failures,
    };
    await atomicWrite(new URL("index.json", CATALOG_ROOT), index);
    console.log(`total: ${index.total_items} items`);
  }

  if (failures.length > 0) process.exitCode = 1;
}

const invokedPath = process.argv[1] ? pathToFileURL(process.argv[1]).href : "";
if (invokedPath === import.meta.url) {
  await runCli();
}
