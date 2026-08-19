import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import process from "node:process";
import { pathToFileURL } from "node:url";

const CATALOG_ROOT = new URL("../../../../docs/frontend/ui-assets/catalogs/", import.meta.url);
const JSON_OUTPUT = new URL("../../../../docs/frontend/ui-assets/coverage-audit.json", import.meta.url);
const MARKDOWN_OUTPUT = new URL("../../../../docs/frontend/ui-assets/coverage-audit.md", import.meta.url);

const EXPECTED_COUNTS = {
  shadcn: 473,
  coss: 577,
  "coss-origin": 646,
  reui: 2315,
  tremor: 375,
  "tremor-legacy": 30,
  aceternity: 319,
  "magic-ui": 247,
  "magic-ui-pro": 104,
  "react-bits": 166,
  "react-bits-pro": 702,
  tweakcn: 42,
  "ai-elements": 136,
  "kibo-ui": 69,
  "dice-ui": 242,
  "animate-ui": 580,
  "motion-primitives": 33,
};

const SOURCE_NOTES = {
  shadcn: {
    official_scope: "New York v4 complete Registry plus current logical UI index",
    evidence: [
      "https://ui.shadcn.com/r/styles/new-york-v4/registry.json",
      "https://ui.shadcn.com/r/index.json",
      "https://ui.shadcn.com/r/config.json",
    ],
    outside_catalog: [
      "24 preset variants contain 5,120 implementation/config records but only 216 deduplicated names; stored as a variant matrix, not unique assets.",
      "Registry Directory lists 280 third-party providers; their internal counts, prices and authentication are not supplied by shadcn.",
      "Official Figma page lists 3 free and 7 paid third-party kits; these are discovery metadata, not first-party code items.",
    ],
    unresolved: ["Third-party Registry Directory provider inventories require per-provider audits."],
  },
  coss: {
    official_scope: "Complete current coss/ui Registry",
    evidence: ["https://coss.com/ui/r/registry.json", "https://coss.com/ui/docs/roadmap"],
    outside_catalog: ["Deprecated orphan p-input-group-25 remains publicly reachable but is excluded from the current 577."],
    unresolved: ["Future atoms mentioned on the roadmap have no published count or Registry."],
  },
  "coss-origin": {
    official_scope: "Complete preserved Origin public Registry snapshot",
    evidence: [
      "https://github.com/cosscom/coss/tree/main/apps/origin",
      "https://github.com/cosscom/coss/blob/main/apps/origin/config/components.ts",
    ],
    outside_catalog: ["Two repo-only internal sources, resizable and toaster, have no public item JSON and are not counted in the 646 Registry items."],
    unresolved: [],
  },
  reui: {
    official_scope: "Official Registry plus llms.txt product index",
    evidence: ["https://reui.io/llms.txt", "https://reui.io/r/registry.json", "https://reui.io/pricing"],
    outside_catalog: [
      "16 Base/Radix style variants are stored as a matrix.",
      "638 icon concepts produce 2,552 style variants; the catalog counts concepts once.",
    ],
    unresolved: [],
  },
  tremor: {
    official_scope: "Current Raw, Blocks and Templates public surfaces",
    evidence: ["https://www.tremor.so/docs", "https://blocks.tremor.so/blocks", "https://blocks.tremor.so/templates"],
    outside_catalog: ["Dashboard OSS is recorded as a related variant, not a seventh unique current template."],
    unresolved: ["The template-dashboard README retains old commercial wording while its current LICENSE.md is MIT."],
  },
  "tremor-legacy": {
    official_scope: "Still-live @tremor/react 3.18.7 documentation",
    evidence: ["https://npm.tremor.so/sitemap.xml", "https://www.npmjs.com/package/@tremor/react/v/3.18.7"],
    outside_catalog: [],
    unresolved: ["No official deprecated declaration was found; maintenance-stale is an evidence-based status, not a deprecation claim."],
  },
  aceternity: {
    official_scope: "Complete to the official AI recommendations index",
    evidence: ["https://ui.aceternity.com/ai-recommendations", "https://ui.aceternity.com/pricing", "https://ui.aceternity.com/licence"],
    outside_catalog: [],
    unresolved: ["Pricing says 200+ premium blocks while the public AI index enumerates 167 leaf blocks; a paid account would be needed to reconcile the product pack."],
  },
  "magic-ui": {
    official_scope: "Complete free Registry",
    evidence: ["https://magicui.design/r/registry.json", "https://github.com/magicuidesign/magicui"],
    outside_catalog: [],
    unresolved: [],
  },
  "magic-ui-pro": {
    official_scope: "Public documentation lower bound, not a complete Pro manifest",
    evidence: ["https://pro.magicui.design/", "https://pro.magicui.design/sitemap.xml", "https://pro.magicui.design/docs/installation"],
    outside_catalog: ["95 exact public block slugs and 9 observed template names are catalogued; 3 templates have public official repositories."],
    unresolved: ["Official copy says 50+ sections and 9+ templates but exposes no total Registry; unknown additional assets remain outside the lower-bound catalog."],
  },
  "react-bits": {
    official_scope: "Complete free repository capability set, four code variants deduplicated",
    evidence: ["https://github.com/DavidHDev/react-bits", "https://reactbits.dev/get-started/installation"],
    outside_catalog: [],
    unresolved: [],
  },
  "react-bits-pro": {
    official_scope: "Complete public Pro documentation asset index",
    evidence: ["https://pro.reactbits.dev/", "https://pro.reactbits.dev/sitemap.xml", "https://pro.reactbits.dev/docs/installation"],
    outside_catalog: [],
    unresolved: [],
  },
  tweakcn: {
    official_scope: "Complete 42 defaultPresets; dynamic community is a separate discovery surface",
    evidence: ["https://github.com/jnsahaj/tweakcn/blob/main/utils/theme-presets.ts", "https://tweakcn.com/community", "https://tweakcn.com/pricing"],
    outside_catalog: ["Anonymous community themes are cursor-paginated and continuously growing; no stable finite total or promised public Registry API exists."],
    unresolved: ["A community snapshot can be taken for a dated design review but cannot be called permanent full coverage."],
  },
  "ai-elements": {
    official_scope: "Complete deployed runtime Registry: components and examples",
    evidence: ["https://elements.ai-sdk.dev/api/registry/registry.json", "https://github.com/vercel/ai-elements"],
    outside_catalog: ["Documentation headings and prose recipes are not counted as installable assets."],
    unresolved: [],
  },
  "kibo-ui": {
    official_scope: "Current Registry plus finite official block documentation leaves",
    evidence: ["https://www.kibo-ui.com/r/registry.json", "https://www.kibo-ui.com/", "https://github.com/shadcnblocks/kibo"],
    outside_catalog: ["Shadcnblocks patterns are a separate product and are not Kibo Registry assets."],
    unresolved: ["Twenty-eight documented blocks currently return HTTP 500 at sampled /r endpoints, so they remain public-metadata-only."],
  },
  "dice-ui": {
    official_scope: "Complete current Radix Registry",
    evidence: ["https://diceui.com/r/registry.json", "https://github.com/sadmann7/diceui"],
    outside_catalog: ["Base/Radix and Nova/Vega distributions are a variant matrix, not separate logical products."],
    unresolved: [],
  },
  "animate-ui": {
    official_scope: "Complete current Registry including demos, hooks, styles and icons",
    evidence: ["https://animate-ui.com/r/registry.json", "https://github.com/imskyleen/animate-ui"],
    outside_catalog: [],
    unresolved: ["Commons Clause permits application use but prohibits selling or redistributing the component library itself."],
  },
  "motion-primitives": {
    official_scope: "Complete Registry committed in the official repository",
    evidence: ["https://raw.githubusercontent.com/ibelick/motion-primitives/main/public/c/registry.json", "https://github.com/ibelick/motion-primitives"],
    outside_catalog: [],
    unresolved: ["The deployed Registry endpoint rate-limits some automated clients; refreshes use the official repository copy."],
  },
};

function sumValues(object = {}) {
  return Object.values(object).reduce((sum, value) => sum + value, 0);
}

export function buildCoverageAudit(index, catalogs) {
  const catalogBySource = new Map(catalogs.map((catalog) => [catalog.source, catalog]));
  const errors = [];
  const sources = [];

  for (const [id, expected] of Object.entries(EXPECTED_COUNTS)) {
    const catalog = catalogBySource.get(id);
    if (!catalog) {
      errors.push(`${id}: catalog missing`);
      continue;
    }
    if (catalog.counts.total !== expected) {
      errors.push(`${id}: expected ${expected}, got ${catalog.counts.total}`);
    }
    const accessTotal = sumValues(catalog.counts.by_access_status);
    if (accessTotal !== catalog.counts.total) {
      errors.push(`${id}: access summary ${accessTotal} does not equal ${catalog.counts.total}`);
    }
    sources.push({
      id,
      catalog_count: catalog.counts.total,
      coverage: catalog.coverage,
      access: catalog.counts.by_access_status,
      source_cache: catalog.counts.by_source_cache_status,
      maintenance: catalog.counts.by_maintenance_status,
      variant_matrix: catalog.variant_matrix,
      ...SOURCE_NOTES[id],
    });
  }

  if (index.total_items !== sources.reduce((sum, source) => sum + source.catalog_count, 0)) {
    errors.push("catalog index total does not equal audited source total");
  }
  if (errors.length) throw new Error(errors.join("\n"));

  return {
    schema_version: 1,
    generated_at: index.fetched_at,
    terminology: {
      catalog_item: "Discoverable normalized metadata record; does not mean source is downloaded.",
      public_source: "Official source/item endpoint is available without a paid license.",
      public_metadata_only: "Official name/configuration is public but no source file is attached to this record.",
      paid_source_after_license: "Public metadata/preview is known; source requires the stated paid tier or license key.",
      source_cached: "An exact upstream source payload is cached with a path and hash; catalogued alone is not cached.",
    },
    summary: {
      catalog_items: index.total_items,
      source_count: sources.length,
      by_access_status: index.counts.by_access_status,
      by_source_cache_status: index.counts.by_source_cache_status,
      fully_cached_catalog_items: index.counts.by_source_cache_status["source-cached"] ?? 0,
    },
    sources,
  };
}

export function coverageAuditMarkdown(audit) {
  const lines = [
    "# UI 资产官方覆盖与访问边界审计",
    "",
    `> 核验快照：${audit.generated_at}`,
    `> 目录总量：${audit.summary.catalog_items.toLocaleString("en-US")}；全量源码缓存：${audit.summary.fully_cached_catalog_items}`,
    "",
    "目录项是可搜索元数据，不等于源码已下载。付费资产只记录公开名称、预览、产品层级和官方获取入口；未绕过登录、401 或会员限制。",
    "",
    "## 总表",
    "",
    "| 来源 | 目录项 | 公开源码 | 公开元数据 | 购买后源码 | 覆盖口径 |",
    "|---|---:|---:|---:|---:|---|",
  ];
  for (const source of audit.sources) {
    lines.push(`| ${source.id} | ${source.catalog_count} | ${source.access["public-source"] ?? 0} | ${source.access["public-metadata-only"] ?? 0} | ${source.access["paid-source-after-license"] ?? 0} | ${source.coverage} |`);
  }
  lines.push(
    "",
    "## 不能混算的数量",
    "",
    "- shadcn 的 5,120 是 24 套 preset 的 variant records，不是 5,120 个不同组件；逻辑目录与 variant 矩阵分开保存。",
    "- ReUI 的 2,552 是 638 个图标 × 4 种样式的渲染变体；目录按 638 个图标概念计数。",
    "- Magic UI Pro 的 104 是公开可复现下限（95 blocks + 9 observed templates），不是官方 Pro 总量。",
    "- tweakcn 社区主题是动态集合，没有稳定有限总数；42 仅指官方 defaultPresets。",
    "",
    "## 逐库边界",
    "",
  );
  for (const source of audit.sources) {
    lines.push(`### ${source.id}`, "", source.official_scope, "");
    if (source.outside_catalog.length) {
      lines.push("已知目录外/另算：", "", ...source.outside_catalog.map((item) => `- ${item}`), "");
    }
    if (source.unresolved.length) {
      lines.push("未消解：", "", ...source.unresolved.map((item) => `- ${item}`), "");
    }
    lines.push("官方证据：", "", ...source.evidence.map((url) => `- <${url}>`), "");
  }
  while (lines.at(-1) === "") lines.pop();
  return `${lines.join("\n")}\n`;
}

async function atomicWrite(url, value) {
  await mkdir(new URL("./", url), { recursive: true });
  const temporary = new URL(url);
  temporary.pathname = `${temporary.pathname}.tmp`;
  await writeFile(temporary, value, "utf8");
  await rename(temporary, url);
}

async function readInputs() {
  const index = JSON.parse(await readFile(new URL("index.json", CATALOG_ROOT), "utf8"));
  const catalogs = await Promise.all(index.sources.map(async (source) =>
    JSON.parse(await readFile(new URL(source.file, CATALOG_ROOT), "utf8"))));
  return { index, catalogs };
}

async function main() {
  const { index, catalogs } = await readInputs();
  const audit = buildCoverageAudit(index, catalogs);
  const json = `${JSON.stringify(audit, null, 2)}\n`;
  const markdown = coverageAuditMarkdown(audit);
  if (process.argv.includes("--write")) {
    await atomicWrite(JSON_OUTPUT, json);
    await atomicWrite(MARKDOWN_OUTPUT, markdown);
  } else if (process.argv.includes("--check")) {
    if (await readFile(JSON_OUTPUT, "utf8") !== json) throw new Error("coverage-audit.json is stale");
    if (await readFile(MARKDOWN_OUTPUT, "utf8") !== markdown) throw new Error("coverage-audit.md is stale");
  }
  console.log(JSON.stringify(audit.summary));
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
