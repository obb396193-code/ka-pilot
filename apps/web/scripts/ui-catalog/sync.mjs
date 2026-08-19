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
  "source_cache_status",
  "decision_record",
  "comparison_record",
];

const FIXTURE_FILES = {
  shadcn: [
    "ui-shadcn-new-york-v4-registry.json",
    "ui-shadcn-index.json",
    "ui-shadcn-config.json",
  ],
  coss: ["ui-coss-registry.json"],
  "coss-origin": ["ui-coss-tree.json", "ui-coss-origin-components.ts"],
  reui: [
    "ui-reui-registry.json",
    "ui-reui-llms.txt",
    "ui-reui-styles-index.json",
    "ui-reui-icon-pages.json",
  ],
  tremor: [
    "ui-tremor-tree.json",
    "ui-tremor-blocks-tree.json",
    "ui-tremor-templates.html",
  ],
  "tremor-legacy": ["ui-tremor-legacy-sitemap.xml"],
  aceternity: ["ui-aceternity.html"],
  "magic-ui": ["ui-magic-registry.json"],
  "magic-ui-pro": ["ui-magic-pro-sitemap.xml", "ui-magic-pro-pages.json"],
  "react-bits": ["ui-react-bits-tree.json"],
  "react-bits-pro": ["ui-react-bits-pro-sitemap.xml"],
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
  accessStatus = "public-source",
  accessTier = "free",
  authRequirement = "none",
  licenseScope = license,
  sourceCacheStatus = "not-cached",
  maintenanceStatus = "current",
  relatedOrDuplicateOf = "",
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
    access_status: accessStatus,
    access_tier: accessTier,
    auth_requirement: authRequirement,
    license_scope: licenseScope,
    source_cache_status: sourceCacheStatus,
    maintenance_status: maintenanceStatus,
    related_or_duplicate_of: relatedOrDuplicateOf,
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

function fullCategoryFromNumberedName(name) {
  return name.replace(/^c-/, "").replace(/^p-/, "").replace(/-\d+$/, "") || "uncategorized";
}

export function shadcnExamplePreviewUrl(name) {
  const category = categoryFromName(name);
  const slug = category === "date" ? "date-picker" : category;
  return `https://ui.shadcn.com/docs/components/${slug}`;
}

const TREMOR_INPUTS = new Set([
  "Calendar",
  "Checkbox",
  "DatePicker",
  "DropdownMenu",
  "Input",
  "Label",
  "RadioCardGroup",
  "RadioGroup",
  "Select",
  "SelectNative",
  "Slider",
  "Switch",
  "Textarea",
  "Toggle",
]);

const TREMOR_VISUALIZATIONS = new Set([
  "AreaChart",
  "BarChart",
  "BarList",
  "CategoryBar",
  "ComboChart",
  "DonutChart",
  "LineChart",
  "ProgressBar",
  "ProgressCircle",
  "SparkChart",
  "Tracker",
]);

export function tremorComponentPreviewUrl(name) {
  const section = TREMOR_INPUTS.has(name)
    ? "inputs"
    : TREMOR_VISUALIZATIONS.has(name)
      ? "visualizations"
      : "ui";
  return `https://www.tremor.so/docs/${section}/${slugify(name)}`;
}

function parseRegistry(text) {
  const registry = JSON.parse(text);
  if (!Array.isArray(registry.items)) throw new Error("Registry does not include items[]");
  return registry;
}

function shadcnRelatedComponent(item, uiNames) {
  return ["date-picker", ...uiNames]
    .sort((a, b) => b.length - a.length)
    .find((name) => item.name === name || item.name.startsWith(`${name}-`));
}

function shadcnPreviewUrl(item, uiNames) {
  const metaDocs = Object.values(item.meta?.links ?? {})
    .map((entry) => entry?.docs)
    .find(Boolean);
  if (metaDocs) return metaDocs;
  if (item.type === "registry:block") {
    return `https://ui.shadcn.com/view/new-york-v4/${item.name}`;
  }
  if (item.type === "registry:ui") {
    return `https://ui.shadcn.com/docs/components/${item.name}`;
  }
  if (item.type === "registry:example") {
    const known = shadcnRelatedComponent(item, uiNames);
    return `https://ui.shadcn.com/docs/components/${known ?? "index"}`;
  }
  return "https://ui.shadcn.com/docs";
}

export function parseShadcnRegistries(newYorkRegistry, logicalIndex, context) {
  if (!Array.isArray(logicalIndex)) throw new Error("shadcn r/index.json must be an array");
  const uiNames = logicalIndex.map((item) => item.name);
  const itemsByName = new Map();

  const normalize = (item, origin) => {
    const variant = origin === "new-york-v4" ? "new-york-v4" : "base-nova";
    const hasFiles = Array.isArray(item.files) && item.files.length > 0;
    const normalized = normalizeRegistryItem(
      item,
      registryContext("shadcn", context.upstreamRef, {
        catalogUrl: `https://ui.shadcn.com/r/styles/${variant}/registry.json`,
        itemUrlTemplate: `https://ui.shadcn.com/r/styles/${variant}/{name}.json`,
        previewUrlTemplate: "https://ui.shadcn.com/docs",
        installCommandTemplate: "npx shadcn@latest add {name} --cwd apps/web",
        foundation: origin === "new-york-v4"
          ? "shadcn New York v4 / Radix"
          : "shadcn current Base/Radix/React Aria variants",
        license: "MIT",
        licenseScope: "shadcn first-party Registry asset under MIT",
        accessStatus: hasFiles ? "public-source" : "public-metadata-only",
        projectFit: item.type === "registry:block" ? "page-shell-or-block" : "global-base-or-reference",
        themeReady: "yes",
      }),
    );
    normalized.preview_url = shadcnPreviewUrl(item, uiNames);
    const type = item.type.replace("registry:", "");
    normalized.category = type === "example"
      ? shadcnRelatedComponent(item, uiNames) ?? fullCategoryFromNumberedName(item.name)
      : type === "block"
        ? item.name.startsWith("chart-") ? "chart" : fullCategoryFromNumberedName(item.name)
        : type === "font" ? "font"
          : ["style", "theme"].includes(type) ? "theme"
            : type === "internal" && item.name.startsWith("sidebar") ? "sidebar"
              : type === "hook" ? "hook"
                : type === "lib" ? "utility"
                  : item.meta?.category ?? item.name;
    normalized.upstream_meta = { ...item, catalog_origin: origin, source_variant: variant };
    return normalized;
  };

  for (const item of newYorkRegistry.items) {
    itemsByName.set(item.name, normalize(item, "new-york-v4"));
  }
  for (const item of logicalIndex) {
    if (!itemsByName.has(item.name)) itemsByName.set(item.name, normalize(item, "current-logical-index"));
  }
  return [...itemsByName.values()];
}

function parseCossRegistry(registry, context) {
  return registry.items.map((item) => {
    const hasFiles = Array.isArray(item.files) && item.files.length > 0;
    const normalized = normalizeRegistryItem(
      item,
      registryContext("coss", context.upstreamRef, {
        catalogUrl: "https://coss.com/ui/r/registry.json",
        itemUrlTemplate: "https://coss.com/ui/r/{name}.json",
        previewUrlTemplate: "https://coss.com/ui/docs/components/{name}",
        installCommandTemplate: "npx shadcn@latest add @coss/{name} --cwd apps/web",
        foundation: "Base UI + Tailwind CSS v4",
        license: "MIT when sourced from coss apps/ui; verify file path",
        licenseScope: "MIT applies to coss apps/ui; root repository remains AGPL-3.0",
        accessStatus: hasFiles ? "public-source" : "public-metadata-only",
        projectFit: "micro-detail-first",
        themeReady: "yes",
      }),
    );
    if (item.name.startsWith("p-")) {
      normalized.kind = "particle";
      normalized.preview_url = `https://coss.com/ui/particles?search=${item.name}`;
    } else if (normalized.kind === "hook") {
      normalized.preview_url = `https://coss.com/ui/docs/hooks/${item.name}`;
    } else if (!["primitive", "component"].includes(normalized.kind)) {
      normalized.preview_url = "https://coss.com/ui/docs";
    }
    if (item.categories?.length) normalized.category = item.categories[0];
    else normalized.category = normalized.kind;
    return normalized;
  });
}

function parseOriginCategoryMap(source) {
  const categoriesByName = new Map();
  const categoryPattern = /\{\s*components:\s*\[([\s\S]*?)\],\s*name:\s*"[^"]+",\s*slug:\s*"([^"]+)"/g;
  for (const match of source.matchAll(categoryPattern)) {
    const [, componentSource, slug] = match;
    for (const nameMatch of componentSource.matchAll(/\{\s*name:\s*"([^"]+)"\s*\}/g)) {
      const categories = categoriesByName.get(nameMatch[1]) ?? [];
      categories.push(slug);
      categoriesByName.set(nameMatch[1], categories);
    }
  }
  return categoriesByName;
}

export function parseCossOrigin(tree, categorySource, context) {
  const categoriesByName = parseOriginCategoryMap(categorySource);
  const paths = (tree.tree ?? [])
    .map((entry) => entry.path)
    .filter((path) => /^apps\/origin\/public\/r\/[^/]+\.json$/.test(path));

  return paths.map((path) => {
    const name = basename(path, ".json");
    const categories = categoriesByName.get(name) ?? [];
    const isComponent = /^comp-\d+$/.test(name);
    const kind = isComponent
      ? "particle"
      : name.startsWith("use-")
        ? "hook"
        : name === "utils"
          ? "utility"
          : "primitive";
    return makeItem({
      source: "coss-origin",
      name,
      displayName: name,
      description: isComponent ? "Legacy Origin UI component snapshot" : "Origin support asset",
      kind,
      category: categories[0] ?? kind,
      previewUrl: isComponent
        ? `https://coss.com/origin?search=${name}`
        : "https://coss.com/origin",
      sourceUrl: `https://coss.com/origin/r/${name}.json`,
      installCommand: `npx shadcn@latest add https://coss.com/origin/r/${name}.json --cwd apps/web`,
      foundation: "Origin legacy React + Tailwind copy-owned source",
      license: "MIT for coss apps/origin",
      licenseScope: "MIT applies to coss apps/origin; root repository remains AGPL-3.0",
      projectFit: "legacy-reference-or-gap-filler",
      themeReady: "partial",
      upstreamRef: context.upstreamRef,
      maintenanceStatus: "maintenance-stale",
      upstreamMeta: {
        repository: "cosscom/coss",
        path,
        categories,
        support_status: "legacy-limited-support",
      },
    });
  });
}

function parseReuiRegistry(registry, context) {
  return registry.items.map((item) => {
    const isFreeExample = item.name.startsWith("c-");
    const isPaidBlock = item.type === "registry:block" && !isFreeExample;
    const normalized = normalizeRegistryItem(
      item,
      registryContext("reui", context.upstreamRef, {
        catalogUrl: "https://reui.io/r/registry.json",
        itemUrlTemplate: "https://reui.io/r/base-nova/{name}.json",
        previewUrlTemplate: "https://reui.io/components/{name}",
        installCommandTemplate: "npx shadcn@latest add @reui/{name} --cwd apps/web",
        foundation: "ReUI base-nova logical snapshot; 16 Base/Radix style variants upstream",
        license: isPaidBlock ? "ReUI commercial license" : "MIT",
        licenseScope: isPaidBlock
          ? "Pro/Ultimate license permits project use and modification but forbids source redistribution"
          : "Public ReUI Registry source under MIT",
        accessStatus: isPaidBlock ? "paid-source-after-license" : "public-source",
        accessTier: isPaidBlock ? "pro" : "free",
        authRequirement: isPaidBlock ? "license-key" : "none",
        projectFit: "complex-data-or-pattern",
        themeReady: "yes",
      }),
    );
    normalized.category = isFreeExample
      ? fullCategoryFromNumberedName(item.name)
      : item.meta?.group ?? fullCategoryFromNumberedName(item.name);
    normalized.preview_url = isFreeExample
      ? `https://reui.io/components/${normalized.category}`
      : isPaidBlock
        ? `https://reui.io/blocks/${item.meta?.group ?? "application"}/${fullCategoryFromNumberedName(item.name)}/${item.name}`
        : `https://reui.io/docs/components/base/${item.name}`;
    normalized.upstream_meta = {
      ...item,
      access_product: isPaidBlock ? "ReUI Pro" : "ReUI Free",
      source_variant: "base-nova",
    };
    return normalized;
  });
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function parseReuiIconCategories(llmsText) {
  return [...llmsText.matchAll(/^- \[[^\]]+ \((\d+)\)\]\(https:\/\/reui\.io\/icons\/([^\)]+)\)$/gm)]
    .map((match) => ({ count: Number(match[1]), slug: match[2] }));
}

function parseReuiIcons(llmsText, iconPages, context) {
  const items = [];
  for (const category of parseReuiIconCategories(llmsText)) {
    const html = iconPages[category.slug];
    if (!html) throw new Error(`Missing ReUI icon page: ${category.slug}`);
    const normalizedHtml = html.replaceAll('\\"', '"');
    const itemPattern = new RegExp(
      `\\{"name":"([^"]+)","slug":"[^"]+","category":"${escapeRegExp(category.slug)}"`,
      "g",
    );
    const names = [...normalizedHtml.matchAll(itemPattern)].map((match) => match[1]);
    const uniqueNames = [...new Set(names)].sort((a, b) => a.localeCompare(b));
    if (uniqueNames.length !== category.count) {
      throw new Error(`ReUI icon count mismatch for ${category.slug}: expected ${category.count}, got ${uniqueNames.length}`);
    }
    for (const name of uniqueNames) {
      items.push(makeItem({
        source: "reui",
        name: `icon/${name}`,
        displayName: name,
        description: `${category.slug} icon available in duotone, filled, outline and solid styles`,
        kind: "icon",
        category: category.slug,
        previewUrl: `https://reui.io/icons/${category.slug}`,
        sourceUrl: `https://reui.io/r/icons/default/filled/${name}.json`,
        installCommand: `npx shadcn@latest add @reui/icons/default/filled/${name} --cwd apps/web`,
        foundation: "ReUI SVG icon Registry / four styles",
        license: "ReUI Ultimate commercial license",
        licenseScope: "Ultimate license permits project use and modification but forbids source redistribution",
        accessStatus: "paid-source-after-license",
        accessTier: "ultimate",
        authRequirement: "license-key",
        projectFit: "icon-option",
        themeReady: "yes",
        upstreamRef: context.upstreamRef,
        upstreamMeta: { icon_name: name, category: category.slug, styles: ["duotone", "filled", "outline", "solid"] },
      }));
    }
  }
  return items;
}

function parseReuiTemplates(llmsText, context) {
  return [...llmsText.matchAll(/^- \[([^\]]+)\]\(https:\/\/reui\.io\/template\/([^\)]+)\)$/gm)]
    .map((match) => makeItem({
      source: "reui",
      name: `template/${match[2]}`,
      displayName: match[1],
      description: "Full-page ReUI Ultimate template",
      kind: "template",
      category: "template",
      previewUrl: `https://reui.io/template/${match[2]}`,
      sourceUrl: `https://reui.io/template/${match[2]}`,
      installCommand: "Requires ReUI Ultimate license; follow the official template download flow",
      foundation: "React + Tailwind CSS v4 + ReUI",
      license: "ReUI Ultimate commercial license",
      licenseScope: "Ultimate license permits project use and modification but forbids source redistribution",
      accessStatus: "paid-source-after-license",
      accessTier: "ultimate",
      authRequirement: "license-key",
      projectFit: "full-page-reference",
      themeReady: "yes",
      upstreamRef: context.upstreamRef,
      upstreamMeta: { template_slug: match[2] },
    }));
}

export function parseReui(registry, llmsText, iconPages, context) {
  return [
    ...parseReuiRegistry(registry, context),
    ...parseReuiIcons(llmsText, iconPages, context),
    ...parseReuiTemplates(llmsText, context),
  ];
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
      previewUrl: tremorComponentPreviewUrl(name),
      sourceUrl: `https://github.com/tremorlabs/tremor/tree/main/${entry.path}`,
      foundation: "Tremor Raw copy/paste source",
      license: "Apache-2.0",
      licenseScope: "Apache-2.0 applies to tremorlabs/tremor Raw source",
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
      previewUrl: `https://blocks.tremor.so/blocks/${category}`,
      sourceUrl: `https://github.com/tremorlabs/tremor-blocks/blob/main/${entry.path}`,
      foundation: "React + Tailwind dashboard block",
      license: "MIT",
      licenseScope: "MIT applies to tremorlabs/tremor-blocks",
      projectFit: "kpi-dashboard-or-report-layout",
      themeReady: "partial",
      upstreamRef: context.upstreamRef,
      upstreamMeta: { repository: "tremorlabs/tremor-blocks", path: entry.path },
    }));
  }

  items.push(makeItem({
    source: "tremor",
    name: "component/DateRangePicker",
    displayName: "DateRangePicker",
    description: "Independent documented range-picker capability exported by the DatePicker source directory",
    kind: "component",
    category: "date-picker",
    previewUrl: "https://www.tremor.so/docs/inputs/date-range-picker",
    sourceUrl: "https://github.com/tremorlabs/tremor/blob/main/src/components/DatePicker/DatePicker.tsx",
    foundation: "Tremor Raw copy/paste source",
    license: "Apache-2.0",
    projectFit: "dashboard-component-reference",
    themeReady: "partial",
    upstreamRef: context.upstreamRef,
    relatedOrDuplicateOf: "tremor:component/DatePicker",
    upstreamMeta: { repository: "tremorlabs/tremor", source_directory: "src/components/DatePicker" },
  }));

  const utilities = [
    ["chartUtils", "chartUtils", "src/utils/chartColors.ts"],
    ["cx", "cx", "src/utils/cx.ts"],
    ["focusInput", "focusInput", "src/utils/focusInput.ts"],
    ["hasErrorInput", "hasErrorInput", "src/utils/hasErrorInput.ts"],
    ["focusRing", "focusRing", "src/utils/focusRing.ts"],
  ];
  for (const [name, slug, path] of utilities) {
    items.push(makeItem({
      source: "tremor",
      name: `utility/${name}`,
      displayName: name,
      description: "Documented Tremor Raw utility",
      kind: "utility",
      category: "utility",
      previewUrl: `https://www.tremor.so/docs/utilities/${slug}`,
      sourceUrl: `https://github.com/tremorlabs/tremor/blob/main/${path}`,
      foundation: "Tremor Raw utility",
      license: "Apache-2.0",
      projectFit: "utility-reference",
      themeReady: "yes",
      upstreamRef: context.upstreamRef,
      upstreamMeta: { repository: "tremorlabs/tremor", path },
    }));
  }

  const templates = [
    ["planner", "Planner"],
    ["solar", "Solar"],
    ["overview", "Overview"],
    ["insights", "Insights"],
    ["dashboard", "Dashboard"],
    ["database", "Database"],
  ];
  for (const [slug, title] of templates) {
    items.push(makeItem({
      source: "tremor",
      name: `template/${slug}`,
      displayName: title,
      description: "Current open-source Tremor template",
      kind: "template",
      category: "template",
      previewUrl: "https://blocks.tremor.so/templates",
      sourceUrl: `https://github.com/tremorlabs/template-${slug}`,
      installCommand: `git clone https://github.com/tremorlabs/template-${slug}.git`,
      foundation: "Next.js + Tailwind + Tremor",
      license: "MIT",
      licenseScope: "MIT license in the individual official template repository",
      projectFit: "dashboard-or-page-reference",
      themeReady: "partial",
      upstreamRef: context.upstreamRef,
      upstreamMeta: { repository: `tremorlabs/template-${slug}` },
    }));
  }

  items.push(makeItem({
    source: "tremor",
    name: "template/dashboard-oss",
    displayName: "Dashboard OSS",
    description: "Related open-source trimmed variant of the Dashboard template",
    kind: "template",
    category: "template",
    previewUrl: "https://github.com/tremorlabs/template-dashboard-oss",
    sourceUrl: "https://github.com/tremorlabs/template-dashboard-oss",
    installCommand: "git clone https://github.com/tremorlabs/template-dashboard-oss.git",
    foundation: "Next.js + Tailwind + Tremor",
    license: "Apache-2.0",
    projectFit: "dashboard-reference",
    themeReady: "partial",
    upstreamRef: context.upstreamRef,
    relatedOrDuplicateOf: "tremor:template/dashboard",
    upstreamMeta: { repository: "tremorlabs/template-dashboard-oss", relationship: "trimmed OSS variant" },
  }));

  return items;
}

export function parseTremorLegacySitemap(xml, context) {
  const paths = [...xml.matchAll(/<loc>(\/docs\/(?:layout|ui|visualizations)\/[^<]+)<\/loc>/g)]
    .map((match) => match[1]);
  return paths.map((path) => {
    const [, section, slug] = path.match(/^\/docs\/([^/]+)\/(.+)$/);
    return makeItem({
      source: "tremor-legacy",
      name: `${section}/${slug}`,
      displayName: slug.replaceAll("-", " "),
      description: "Still-live @tremor/react 3.18.7 documentation capability",
      kind: section === "visualizations" ? "component" : section === "layout" ? "style" : "component",
      category: section,
      previewUrl: `https://npm.tremor.so${path}`,
      sourceUrl: "https://www.npmjs.com/package/@tremor/react/v/3.18.7",
      installCommand: "npm install @tremor/react@3.18.7 --workspace apps/web",
      foundation: "@tremor/react 3.18.7 / Tailwind v3 / Headless UI",
      license: "Apache-2.0",
      projectFit: "legacy-reference-only",
      themeReady: "partial",
      upstreamRef: context.upstreamRef,
      maintenanceStatus: "maintenance-stale",
      upstreamMeta: { package: "@tremor/react", version: "3.18.7", docs_path: path },
    });
  });
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
      const isProCategory = access === "pro" && !upstream.slug && defaultKind === "block";
      const category = isProCategory ? "pro-category" : upstream.category ?? upstream.categories?.[0] ??
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
        licenseScope: access === "free"
          ? "Free Registry item; verify any embedded third-party asset terms"
          : "Pro license permits project use and modification but forbids source redistribution",
        accessStatus: access === "free" ? "public-source" : "paid-source-after-license",
        accessTier: access === "free" ? "free" : "pro",
        authRequirement: access === "free" ? "none" : "account",
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
      licenseScope: "Free Registry hook; verify Aceternity terms",
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
  return registry.items.map((item) => {
    const hasFiles = Array.isArray(item.files) && item.files.length > 0;
    const normalized = normalizeRegistryItem(
      item,
      registryContext("magic-ui", context.upstreamRef, {
        catalogUrl: "https://magicui.design/r/registry.json",
        itemUrlTemplate: "https://magicui.design/r/{name}.json",
        previewUrlTemplate: "https://magicui.design/docs/components/{name}",
        installCommandTemplate: "npx shadcn@latest add @magicui/{name} --cwd apps/web",
        foundation: "React + Tailwind; shadcn-compatible",
        license: "MIT",
        licenseScope: "Magic UI free Registry and repository under MIT",
        accessStatus: hasFiles ? "public-source" : "public-metadata-only",
        projectFit: "subtle-motion-or-bento",
        themeReady: "partial",
      }),
    );
    if (item.type === "registry:example") {
      const dependency = (item.registryDependencies ?? [])
        .find((value) => value.startsWith("@magicui/"));
      const parent = dependency?.replace("@magicui/", "") ?? item.name.replace(/-(?:demo.*|example.*)$/, "");
      normalized.preview_url = `https://magicui.design/docs/components/${parent}`;
      normalized.category = parent;
    } else if (item.type === "registry:ui") {
      normalized.category = item.name;
    } else {
      normalized.preview_url = "https://magicui.design/docs";
      normalized.category = normalized.kind;
    }
    return normalized;
  });
}

export function parseMagicPro(sitemap, sectionPages, context) {
  const blocksByName = new Map();
  for (const [section, html] of Object.entries(sectionPages)) {
    for (const match of html.matchAll(/block-viewer-(?:handle-)?([a-z][a-z-]*-\d+)/g)) {
      blocksByName.set(match[1], section);
    }
  }
  const items = [...blocksByName.entries()].map(([name, section]) => makeItem({
    source: "magic-ui-pro",
    name: `block/${name}`,
    displayName: name,
    description: "Magic UI Pro section observed in a public documentation page",
    kind: "block",
    category: section,
    previewUrl: `https://pro.magicui.design/docs/sections/${section}`,
    sourceUrl: `https://pro.magicui.design/registry/${name}`,
    installCommand: "Requires MAGICUI_PRO_REGISTRY_TOKEN; follow https://pro.magicui.design/docs/installation",
    foundation: "React + Tailwind + Motion; authenticated Registry",
    license: "Magic UI Pro commercial license",
    licenseScope: "Pro license permits project use and modification but forbids source redistribution",
    accessStatus: "paid-source-after-license",
    accessTier: "pro",
    authRequirement: "license-key",
    projectFit: "marketing-or-showcase-section",
    themeReady: "partial",
    upstreamRef: context.upstreamRef,
    upstreamMeta: { observed_public_docs: true, section, registry_without_token: 401 },
  }));

  const templates = [
    ["codeforge", "Codeforge Template", "paid", "https://pro.magicui.design/docs/templates/codeforge"],
    ["agent", "AI Agent Template", "paid", "https://pro.magicui.design/docs/templates/agent"],
    ["devtool", "Dev Tool Template", "paid", "https://pro.magicui.design/docs/templates/devtool"],
    ["mobile", "Mobile Template", "paid", "https://pro.magicui.design/docs/templates/mobile"],
    ["saas", "SaaS Template", "paid", "https://pro.magicui.design/docs/templates/saas"],
    ["startup", "Startup Template", "paid", "https://pro.magicui.design/docs/templates/startup"],
    ["portfolio", "Portfolio Template", "public", "https://github.com/magicuidesign/portfolio"],
    ["changelog", "Changelog Template", "public", "https://github.com/magicuidesign/changelog-template"],
    ["blog", "Blog Template", "public", "https://github.com/magicuidesign/blog-template"],
  ];
  for (const [slug, title, access, url] of templates) {
    const isPublic = access === "public";
    if (!isPublic && !sitemap.includes(`/docs/templates/${slug}`)) {
      throw new Error(`Magic UI Pro sitemap missing observed template: ${slug}`);
    }
    items.push(makeItem({
      source: "magic-ui-pro",
      name: `template/${slug}`,
      displayName: title,
      description: "Observed Magic UI template name; upstream advertises 9+ templates",
      kind: "template",
      category: "template",
      previewUrl: url,
      sourceUrl: url,
      installCommand: isPublic
        ? `git clone ${url}.git`
        : "Requires Magic UI Pro access; follow the official template download flow",
      foundation: "Next.js + Tailwind + Magic UI",
      license: isPublic
        ? "Public official repository; verify repository license before reuse"
        : "Magic UI Pro commercial license",
      licenseScope: isPublic
        ? "Public source availability does not replace per-repository license verification"
        : "Pro license permits project use and modification but forbids source redistribution",
      accessStatus: isPublic ? "public-source" : "paid-source-after-license",
      accessTier: isPublic ? "free" : "pro",
      authRequirement: isPublic ? "none" : "license-key",
      projectFit: "full-page-reference",
      themeReady: "partial",
      upstreamRef: context.upstreamRef,
      upstreamMeta: { observed_name: true, official_claim_is_lower_bound: true },
    }));
  }
  return items;
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
        installCommand: `npx shadcn@latest add @react-bits/${name}-TS-TW --cwd apps/web`,
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

export function parseReactBitsProSitemap(xml, context) {
  const urls = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((match) => match[1]);
  const records = [];
  for (const url of urls) {
    const segments = new URL(url).pathname.split("/").filter(Boolean);
    if (segments[0] !== "docs") continue;
    const product = segments[1];
    let record = null;
    if (product === "components" && segments.length === 3) {
      record = { name: `component/${segments[2]}`, kind: "motion", category: "component", tier: "starter" };
    } else if (product === "blocks" && segments.length === 4) {
      record = { name: `block/${segments[2]}/${segments[3]}`, kind: "block", category: `page-block/${segments[2]}`, tier: "pro" };
    } else if (product === "app-ui" && segments.length === 4) {
      record = { name: `app-ui/${segments[2]}/${segments[3]}`, kind: "block", category: `app-ui/${segments[2]}`, tier: "pro" };
    } else if (product === "templates" && segments.length === 3) {
      record = { name: `template/${segments[2]}`, kind: "template", category: "template", tier: "ultimate" };
    } else if (
      product === "agent-kit" &&
      segments.length === 4 &&
      ["skills", "prompts", "recipes"].includes(segments[2])
    ) {
      record = { name: `agent-kit/${segments[2]}/${segments[3]}`, kind: "utility", category: `agent-kit/${segments[2]}`, tier: "pro" };
    }
    if (!record) continue;
    records.push(makeItem({
      source: "react-bits-pro",
      name: record.name,
      displayName: record.name.split("/").at(-1).replaceAll("-", " "),
      description: "React Bits Pro asset publicly indexed in official documentation; source requires a paid license",
      kind: record.kind,
      category: record.category,
      previewUrl: url,
      sourceUrl: url,
      installCommand: "Requires a React Bits Pro license key; follow https://pro.reactbits.dev/docs/installation",
      foundation: "React source delivered through authenticated shadcn Registry",
      license: "React Bits Pro commercial license",
      licenseScope: "Paid license permits project use but forbids public source redistribution or Registry mirroring",
      accessStatus: "paid-source-after-license",
      accessTier: record.tier,
      authRequirement: "license-key",
      projectFit: record.kind === "utility" ? "agent-design-reference" : "visual-option",
      themeReady: "partial",
      upstreamRef: context.upstreamRef,
      upstreamMeta: { docs_url: url, product, tier: record.tier },
    }));
  }
  return records;
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
        upstreamMeta: {
          preset_key: name,
          label,
          token_source: block.trim(),
          includes_light_tokens: /\blight:\s*\{/.test(block),
          includes_dark_tokens: /\bdark:\s*\{/.test(block),
        },
      });
    })
    .sort((a, b) => a.upstream_name.localeCompare(b.upstream_name));
}

const SHADCN_VARIANTS = ["aria", "base", "radix"]
  .flatMap((foundation) => ["luma", "lyra", "maia", "mira", "nova", "rhea", "sera", "vega"]
    .map((style) => `${foundation}-${style}`));
const REUI_VARIANTS = ["base", "radix"]
  .flatMap((foundation) => ["luma", "lyra", "maia", "mira", "nova", "rhea", "sera", "vega"]
    .map((style) => `${foundation}-${style}`));

function snapshotVariantMatrix(source) {
  if (source === "shadcn") {
    return {
      variants: SHADCN_VARIANTS,
      foundation_count: 3,
      style_count: 8,
      upstream_variant_record_count: 5120,
      deduplicated_logical_name_count: 216,
      note: "Variant records are implementations/configuration records, not 5,120 unique components.",
    };
  }
  if (source === "reui") {
    return {
      variants: REUI_VARIANTS,
      foundation_count: 2,
      style_count: 8,
      icon_style_count: 4,
      icon_render_variant_count: 2552,
      note: "The catalog stores logical assets once; inspect the concrete style endpoint before copying source.",
    };
  }
  return null;
}

export function buildSnapshot(source, items, metadata) {
  const sortedItems = [...items].sort((a, b) =>
    [a.kind, a.category, a.upstream_name]
      .join("\u0000")
      .localeCompare([b.kind, b.category, b.upstream_name].join("\u0000")),
  );
  const byKind = {};
  const byCategory = {};
  const byAccessStatus = {};
  const bySourceCacheStatus = {};
  const byMaintenanceStatus = {};
  for (const item of sortedItems) {
    byKind[item.kind] = (byKind[item.kind] ?? 0) + 1;
    byCategory[item.category] = (byCategory[item.category] ?? 0) + 1;
    byAccessStatus[item.access_status] = (byAccessStatus[item.access_status] ?? 0) + 1;
    bySourceCacheStatus[item.source_cache_status] = (bySourceCacheStatus[item.source_cache_status] ?? 0) + 1;
    byMaintenanceStatus[item.maintenance_status] = (byMaintenanceStatus[item.maintenance_status] ?? 0) + 1;
  }

  return {
    schema_version: 2,
    source,
    fetched_at: metadata.fetchedAt,
    upstream_ref: metadata.upstreamRef,
    source_hash: metadata.sourceHash,
    coverage: metadata.coverage,
    coverage_note: metadata.coverageNote,
    variant_matrix: snapshotVariantMatrix(source),
    counts: {
      total: sortedItems.length,
      by_kind: Object.fromEntries(Object.entries(byKind).sort()),
      by_category: Object.fromEntries(Object.entries(byCategory).sort()),
      by_access_status: Object.fromEntries(Object.entries(byAccessStatus).sort()),
      by_source_cache_status: Object.fromEntries(Object.entries(bySourceCacheStatus).sort()),
      by_maintenance_status: Object.fromEntries(Object.entries(byMaintenanceStatus).sort()),
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
  if (source.id === "reui") {
    const baseParts = await Promise.all(source.catalogUrls.map(fetchText));
    const categories = parseReuiIconCategories(baseParts[1]);
    const pages = {};
    for (let start = 0; start < categories.length; start += 6) {
      const batch = categories.slice(start, start + 6);
      Object.assign(pages, Object.fromEntries(await Promise.all(batch.map(async ({ slug }) => [
        slug,
        await fetchText(`https://reui.io/icons/${slug}`),
      ]))));
    }
    return [...baseParts, JSON.stringify(pages)];
  }
  if (source.id === "magic-ui-pro") {
    const [sitemap, ...pages] = await Promise.all(source.catalogUrls.map(fetchText));
    const sectionPages = Object.fromEntries(
      source.catalogUrls.slice(1).map((url, index) => [url.split("/").at(-1), pages[index]]),
    );
    return [sitemap, JSON.stringify(sectionPages)];
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
      return parseShadcnRegistries(parseRegistry(parts[0]), JSON.parse(parts[1]), context);
    case "coss":
      return parseCossRegistry(parseRegistry(parts[0]), context);
    case "coss-origin":
      return parseCossOrigin(JSON.parse(parts[0]), parts[1], context);
    case "reui":
      return parseReui(parseRegistry(parts[0]), parts[1], JSON.parse(parts[3]), context);
    case "tremor":
      return parseTremorTrees(JSON.parse(parts[0]), JSON.parse(parts[1]), context);
    case "tremor-legacy":
      return parseTremorLegacySitemap(parts[0], context);
    case "aceternity":
      return parseAceternityHtml(parts[0], context);
    case "magic-ui":
      return parseMagicRegistry(parseRegistry(parts[0]), context);
    case "magic-ui-pro":
      return parseMagicPro(parts[0], JSON.parse(parts[1]), context);
    case "react-bits":
      return parseReactBitsTree(JSON.parse(parts[0]), context);
    case "react-bits-pro":
      return parseReactBitsProSitemap(parts[0], context);
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

export function assertStableItemCount(previousCount, currentCount) {
  if (previousCount !== currentCount) {
    throw new Error(
      `item-count drift ${previousCount} -> ${currentCount}; review upstream changes before refresh`,
    );
  }
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

      if (check && previous) assertStableItemCount(previous.counts.total, items.length);

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
    const accessSummary = {};
    const cacheSummary = {};
    for (const snapshot of snapshots) {
      for (const [status, count] of Object.entries(snapshot.counts.by_access_status)) {
        accessSummary[status] = (accessSummary[status] ?? 0) + count;
      }
      for (const [status, count] of Object.entries(snapshot.counts.by_source_cache_status)) {
        cacheSummary[status] = (cacheSummary[status] ?? 0) + count;
      }
    }
    const index = {
      schema_version: 2,
      fetched_at: fetchedAt,
      total_items: snapshots.reduce((sum, snapshot) => sum + snapshot.counts.total, 0),
      counts: {
        by_access_status: Object.fromEntries(Object.entries(accessSummary).sort()),
        by_source_cache_status: Object.fromEntries(Object.entries(cacheSummary).sort()),
      },
      sources: snapshots.map((snapshot) => ({
        id: snapshot.source,
        count: snapshot.counts.total,
        coverage: snapshot.coverage,
        coverage_note: snapshot.coverage_note,
        upstream_ref: snapshot.upstream_ref,
        counts: {
          by_access_status: snapshot.counts.by_access_status,
          by_source_cache_status: snapshot.counts.by_source_cache_status,
        },
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
