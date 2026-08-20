import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import process from "node:process";
import { pathToFileURL } from "node:url";

const ROOT = new URL("../../../../", import.meta.url);
const UI_ASSETS_ROOT = new URL("docs/frontend/ui-assets/", ROOT);
const CATALOG_INDEX_URL = new URL("catalogs/index.json", UI_ASSETS_ROOT);
const TWEAKCN_CATALOG_URL = new URL("catalogs/tweakcn.json", UI_ASSETS_ROOT);
const REUI_CATALOG_URL = new URL("catalogs/reui.json", UI_ASSETS_ROOT);
const CAPABILITIES_URL = new URL("capabilities.json", UI_ASSETS_ROOT);
const ALTERNATIVES_URL = new URL("free-alternatives.json", UI_ASSETS_ROOT);
const DISCOVERY_URL = new URL("discovery.json", UI_ASSETS_ROOT);
const CACHE_MANIFEST_URL = new URL("source-cache/manifest.json", UI_ASSETS_ROOT);
const STARTER_PACK_URL = new URL("starter-pack.json", UI_ASSETS_ROOT);
const LIVE_PREVIEW_MANIFEST_URL = new URL(
  "live-previews/manifest.json",
  UI_ASSETS_ROOT,
);
const DATA_OUTPUT_URL = new URL("showroom-data.json", UI_ASSETS_ROOT);
const HTML_OUTPUT_URL = new URL("showroom.html", UI_ASSETS_ROOT);
const TEMPLATE_URL = new URL("showroom-template.html", import.meta.url);

const SOURCE_PROFILES = {
  shadcn: {
    name: "shadcn/ui",
    family: "Product foundation",
    generation: "current",
    visual_style: "中性、克制、结构稳定；像成熟 B 端产品底座。",
    best_for: "全站壳、Sidebar、基础表单、弹层、页面 Blocks",
    caution: "默认样式不是最终品牌；preset 矩阵是实现变体，不是多倍的逻辑组件。",
    foundation: "React + Tailwind + Radix/Base UI/React Aria variants",
    accent: "#202020",
    screenshot: "",
  },
  coss: {
    name: "coss/ui",
    family: "Fine-grained controls",
    generation: "current",
    visual_style: "极简、细密、比例精确；工具型产品细节完成度高。",
    best_for: "日期、Command、Combobox、Field、Drawer、空态、表格工具栏",
    caution: "Base UI 与 shadcn/Radix 共存时必须隔离目录，禁止同名覆盖。",
    foundation: "React + Tailwind + Base UI",
    accent: "#ef4b23",
    screenshot: "screenshots/coss-date-picker.png",
  },
  "coss-origin": {
    name: "coss Origin",
    family: "Legacy particle archive",
    generation: "legacy",
    visual_style: "旧版大颗粒案例库，类型多、覆盖广，但体系和维护状态不如 current。",
    best_for: "current coss 没有的旧交互缺口、历史参考",
    caution: "组件案例和支持资产已分开计数；有限维护，新代码默认不先选。",
    foundation: "Legacy React + Tailwind copy-owned source",
    accent: "#8f8578",
    screenshot: "",
  },
  reui: {
    name: "ReUI",
    family: "Enterprise patterns",
    generation: "current",
    visual_style: "数据密集、企业后台感强，复杂状态和操作模式成熟。",
    best_for: "Data Grid、复杂筛选、列配置、虚拟滚动、Gantt/Kanban 参考",
    caution: "Free/Pro/Ultimate 必须分开；当前只缓存选定 Free 源码。",
    foundation: "React + Tailwind + Base UI/Radix style variants",
    accent: "#3767ff",
    screenshot: "screenshots/reui-data-grid.png",
  },
  tremor: {
    name: "Tremor",
    family: "Analytics layouts",
    generation: "current",
    visual_style: "现代 SaaS/金融驾驶舱，指标、趋势、报告节奏成熟。",
    best_for: "KPI、报告、驾驶舱、筛选栏、分析页面壳",
    caution: "借布局和组件源码；业务图表运行时仍统一项目 ECharts。",
    foundation: "Tremor Raw + open-source Blocks/Templates",
    accent: "#00a36c",
    screenshot: "screenshots/tremor-blocks.png",
  },
  "tremor-legacy": {
    name: "Tremor React legacy",
    family: "Legacy package",
    generation: "legacy",
    visual_style: "旧 @tremor/react 组件包，仍有在线文档但维护节奏已慢。",
    best_for: "Scatter/Funnel/Data Bars 等 Raw 未单列能力的迁移参考",
    caution: "不能擅自叫 deprecated；新代码默认先用 Tremor Raw。",
    foundation: "@tremor/react + Tailwind v3 + Headless UI",
    accent: "#557c70",
    screenshot: "",
  },
  aceternity: {
    name: "Aceternity UI",
    family: "Cinematic motion",
    generation: "current",
    visual_style: "戏剧化、空间感强、光效与交互动势明显。",
    best_for: "Agent 欢迎区、关键空态、Hero、少量高光展示",
    caution: "高频数据页要克制；Free 与 Pro 许可证逐项核对。",
    foundation: "React + Tailwind + Motion",
    accent: "#7c4dff",
    screenshot: "",
  },
  "magic-ui": {
    name: "Magic UI Free",
    family: "Friendly motion",
    generation: "current",
    visual_style: "明亮、圆润、精致，Bento 与轻动效亲和度高。",
    best_for: "能力总览、成果陈列、局部高光卡、轻量 KPI 动效",
    caution: "不要让每张业务卡都动；统一 reduced-motion。",
    foundation: "React + Tailwind + Motion",
    accent: "#d946ef",
    screenshot: "screenshots/magic-bento.png",
  },
  "magic-ui-pro": {
    name: "Magic UI Pro",
    family: "Paid marketing sections",
    generation: "current",
    visual_style: "完整营销区块和模板，视觉成品度高。",
    best_for: "Hero、Feature、Pricing、Social Proof、营销模板预览",
    caution: "当前目录只是公开可复现下限；付费源码需合法 license key。",
    foundation: "Authenticated React/Tailwind/Motion Registry",
    accent: "#a21caf",
    screenshot: "screenshots/magic-bento.png",
  },
  "react-bits": {
    name: "React Bits Free",
    family: "Expressive motion",
    generation: "current",
    visual_style: "创意、强动效、辨识度高，偏暗色科技感。",
    best_for: "欢迎页、Agent 入口、少数背景、文字和数字动效",
    caution: "不作表格或长列表底座；遵守 MIT + Commons Clause。",
    foundation: "React variants + Tailwind/CSS + motion engines",
    accent: "#ffb800",
    screenshot: "screenshots/react-bits-home.png",
  },
  "react-bits-pro": {
    name: "React Bits Pro",
    family: "Paid page and app UI",
    generation: "current",
    visual_style: "延续强视觉，同时加入营销页、后台和 Agent Kit 成品区块。",
    best_for: "只看公开预览做方向对比和替代映射",
    caution: "Pro 源码均需对应付费许可证，未下载也不得绕过。",
    foundation: "Commercial React component/block distribution",
    accent: "#d28c00",
    screenshot: "screenshots/react-bits-home.png",
  },
  tweakcn: {
    name: "tweakcn",
    family: "Runtime themes",
    generation: "current",
    visual_style: "不是单一组件库，而是让同一 shadcn 结构切换多种视觉气质。",
    best_for: "运行时主题切换、token 种子、风格展厅",
    caution: "社区主题动态无稳定总量；最终持久化项目自己的语义 token。",
    foundation: "shadcn CSS variables + Tailwind theme tokens",
    accent: "#0f766e",
    screenshot: "screenshots/tweakcn-themes.png",
  },
  "ai-elements": {
    name: "Vercel AI Elements",
    family: "Agent interaction",
    generation: "current",
    visual_style: "克制、产品化、接近 Vercel/shadcn 的 AI 工作台气质。",
    best_for: "Agent 对话、消息、推理折叠、工具调用、来源引用、Prompt 输入",
    caution: "只作 UI 组件来源，不替代 Agent runtime；当前未安装进产品运行时。",
    foundation: "React + shadcn Registry + AI SDK UI conventions",
    accent: "#111111",
    screenshot: "",
  },
  "kibo-ui": {
    name: "Kibo UI",
    family: "Business-grade controls",
    generation: "current",
    visual_style: "现代、克制、功能密度高，接近成熟 SaaS 的复杂业务控件。",
    best_for: "Gantt、Kanban、Editor、Dropzone、Color Picker、复杂 Calendar",
    caution: "官网颜色只是示例；接入时必须映射项目语义 token。",
    foundation: "React + shadcn + Tailwind",
    accent: "#6558d3",
    screenshot: "",
  },
  "dice-ui": {
    name: "Dice UI",
    family: "Accessible complex interactions",
    generation: "current",
    visual_style: "中性、细致、工具型，强调高频复杂交互和无障碍状态。",
    best_for: "Data Grid、File Upload、Kanban、Time Picker、Tour、Media Player",
    caution: "首次使用复杂组件时，与 ReUI/coss/TanStack 在同一业务容器比较。",
    foundation: "React + TypeScript + Tailwind + shadcn pattern",
    accent: "#2563eb",
    screenshot: "",
  },
  "animate-ui": {
    name: "Animate UI",
    family: "Controlled product motion",
    generation: "current",
    visual_style: "保留 shadcn 产品感的流畅微动效，比强视觉动效库更克制。",
    best_for: "按钮反馈、交互过渡、动画图标、轻背景、局部高光",
    caution: "MIT + Commons Clause；按具体微交互选择，禁止整库默认安装或再分发。",
    foundation: "React + shadcn Registry + Motion",
    accent: "#f43f5e",
    screenshot: "",
  },
  "motion-primitives": {
    name: "Motion Primitives",
    family: "Refined micro-interactions",
    generation: "current",
    visual_style: "极简、细腻，适合给成熟产品补文字、数字和布局过渡。",
    best_for: "Animated Number、Disclosure、Dock、Tabs、文字与局部布局动画",
    caution: "不是业务组件底座；只在局部需要时复制并接入 reduced-motion。",
    foundation: "React + Tailwind + Motion",
    accent: "#db2777",
    screenshot: "",
  },
};

function candidateSummary(candidate) {
  return {
    id: candidate.id,
    label: candidate.label,
    type: candidate.type,
    source: candidate.source,
    license: candidate.license,
    access_status: candidate.access_status,
    source_cache_status: candidate.source_cache_status,
    local_path: candidate.local_path,
    match_level: candidate.match_level,
    confidence: candidate.confidence,
    review_status: candidate.review_status,
    license_verified: candidate.license_verified,
    redistribution_restricted: candidate.redistribution_restricted,
    url: candidate.url,
    source_url: candidate.source_url,
    reason: candidate.reason,
    tradeoff: candidate.tradeoff,
  };
}

export function safeCssLength(value) {
  const normalized = String(value ?? "").trim();
  if (/^(?:0|(?:\d+(?:\.\d+)?|\.\d+)(?:px|rem|em|%)?)$/i.test(normalized)) {
    return normalized;
  }
  throw new Error(`Unsafe theme radius token: ${normalized || "<empty>"}`);
}

function readToken(tokenSource, key, fallback) {
  const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const pattern = key.includes("-")
    ? new RegExp(`"${escaped}"\\s*:\\s*"([^"]+)"`)
    : new RegExp(`(?:^|\\s)${escaped}\\s*:\\s*"([^"]+)"`);
  return tokenSource.match(pattern)?.[1] ?? fallback;
}

function themeSummary(asset) {
  const tokenSource = asset.upstream_meta?.token_source ?? "";
  return {
    id: asset.upstream_name,
    label: asset.display_name,
    preview_url: asset.preview_url,
    colors: {
      background: readToken(tokenSource, "background", "#ffffff"),
      foreground: readToken(tokenSource, "foreground", "#171717"),
      primary: readToken(tokenSource, "primary", "#171717"),
      secondary: readToken(tokenSource, "secondary", "#f1f1f1"),
      accent: readToken(tokenSource, "accent", "#f5f5f5"),
      border: readToken(tokenSource, "border", "#dddddd"),
    },
    radius: safeCssLength(readToken(tokenSource, "radius", "0.5rem")),
  };
}

export function buildShowroomData({
  catalogIndex,
  capabilities,
  alternatives,
  discovery,
  cacheManifest,
  starterPack,
  tweakcnCatalog,
  reuiCatalog,
  livePreviewManifest = {
    preview_count: 0,
    live_count: 0,
    blocked_count: 0,
    represented_official_assets: 0,
    previews: [],
  },
}) {
  const alternativeById = new Map(
    alternatives.mappings.map((mapping) => [
      mapping.paid_asset.id,
      {
        resolution_status: mapping.resolution_status,
        role: mapping.paid_asset.role,
        candidates: mapping.closest_free_alternatives.map(candidateSummary),
      },
    ]),
  );
  const cacheById = new Map(
    cacheManifest.entries.map((entry) => [entry.asset_id, entry]),
  );
  const starterById = new Map(
    starterPack.roots.map((root) => [root.asset_id, root]),
  );
  const catalogAssetIds = new Set(capabilities.assets.map((asset) => asset.id));
  const cacheCountsBySource = {};
  for (const entry of cacheManifest.entries) {
    if (!catalogAssetIds.has(entry.asset_id)) continue;
    cacheCountsBySource[entry.source] = (cacheCountsBySource[entry.source] ?? 0) + 1;
  }

  const tierCountsBySource = {};
  const kindCountsBySource = {};
  for (const asset of capabilities.assets) {
    tierCountsBySource[asset.source] ??= {};
    kindCountsBySource[asset.source] ??= {};
    const tier = asset.access_tier || "unknown";
    const kind = asset.kind || "unknown";
    tierCountsBySource[asset.source][tier] =
      (tierCountsBySource[asset.source][tier] ?? 0) + 1;
    kindCountsBySource[asset.source][kind] =
      (kindCountsBySource[asset.source][kind] ?? 0) + 1;
  }

  const sources = catalogIndex.sources.map((source) => {
    const cachedEntries = cacheCountsBySource[source.id] ?? 0;
    return {
      ...source,
      counts: {
        ...source.counts,
        by_source_cache_status: {
          "source-cached": cachedEntries,
          "not-cached": source.count - cachedEntries,
        },
        by_access_tier: tierCountsBySource[source.id] ?? {},
        by_kind: kindCountsBySource[source.id] ?? {},
      },
      ...(SOURCE_PROFILES[source.id] ?? {
      name: source.id,
      family: "Catalog source",
      generation: source.id.includes("legacy") ? "legacy" : "current",
      visual_style: "待补充风格描述。",
      best_for: "按目录和官方预览选择",
      caution: "首次使用前核对官方指南。",
      foundation: "See catalog",
      accent: "#555555",
      screenshot: "",
      }),
      cached_entries: cachedEntries,
      variant_matrix: source.id === "reui" ? reuiCatalog?.variant_matrix ?? null : null,
    };
  });

  const assets = capabilities.assets
    .map((asset) => {
      const cached = cacheById.get(asset.id);
      const starter = starterById.get(asset.id);
      const alternative = alternativeById.get(asset.id);
      return {
        id: asset.id,
        source: asset.source,
        upstream_name: asset.upstream_name,
        name: asset.display_name || asset.upstream_name,
        description: asset.description,
        kind: asset.kind,
        category: asset.category,
        capabilities: asset.capability_ids,
        preview_url: asset.preview_url,
        source_url: asset.source_url,
        license: asset.license,
        access_status: asset.access_status,
        access_tier: asset.access_tier,
        foundation: asset.foundation,
        maintenance_status: asset.maintenance_status,
        adaptation_cost: asset.adaptation_cost,
        related_or_duplicate_of: asset.related_or_duplicate_of,
        cache: cached
          ? {
              status: "source-cached",
              role: cached.root_or_dependency,
              local_path: `source-cache/${cached.local_path}`,
              files: cached.files_in_payload ?? cached.cached_files?.length ?? 1,
            }
          : { status: "not-cached", role: "", local_path: "", files: 0 },
        starter: starter
          ? { selected: true, use_cases: starter.use_cases, reason: starter.reason ?? "" }
          : { selected: false, use_cases: [], reason: "" },
        alternative_resolution_status: alternative?.resolution_status ?? "",
        alternative_role: alternative?.role ?? "",
        alternatives: alternative?.candidates ?? [],
      };
    })
    .sort((left, right) => left.id.localeCompare(right.id));

  const themeAssets = tweakcnCatalog?.items ?? capabilities.assets;
  const themes = themeAssets
    .filter((asset) => asset.source === "tweakcn" && asset.kind === "theme")
    .map(themeSummary)
    .sort((left, right) => left.label.localeCompare(right.label));

  return {
    schema_version: 2,
    generated_at: cacheManifest.generated_at ?? catalogIndex.fetched_at ?? null,
    catalog_fetched_at: catalogIndex.fetched_at ?? null,
    cache_generated_at: cacheManifest.generated_at ?? null,
    summary: {
      total_assets: catalogIndex.total_items,
      public_source: catalogIndex.counts?.by_access_status?.["public-source"] ?? 0,
      public_metadata:
        catalogIndex.counts?.by_access_status?.["public-metadata-only"] ?? 0,
      paid_items: alternatives.summary.paid_metadata_records,
      concrete_paid_items: alternatives.summary.concrete_paid_items,
      provider_group_records: alternatives.summary.provider_group_records,
      mapped_paid_items: alternatives.summary.mapped_items,
      unresolved_paid_items: alternatives.summary.unresolved_items,
      paid_by_resolution_status: alternatives.summary.by_resolution_status,
      cached_roots: cacheManifest.cached_root_count,
      cached_dependencies: cacheManifest.cached_dependency_count,
      cached_entries: cacheManifest.cached_entry_count,
      cached_support_entries: cacheManifest.entries.filter(
        (entry) => !catalogAssetIds.has(entry.asset_id),
      ).length,
      cached_files: cacheManifest.cached_file_count,
      discovery_sources: discovery.sources.length,
      theme_presets: themes.length,
      live_preview_positions: livePreviewManifest.preview_count,
      live_preview_frames: livePreviewManifest.live_count ?? livePreviewManifest.preview_count,
      blocked_preview_positions: livePreviewManifest.blocked_count ?? 0,
      live_preview_assets: livePreviewManifest.represented_official_assets,
    },
    source_order: catalogIndex.sources.map((source) => source.id),
    sources,
    assets,
    themes,
    discovery: discovery.sources,
    live_previews: livePreviewManifest.previews.map((preview) => ({
      ...preview,
      ...(preview.frame_path
        ? { frame_path: `live-previews/${preview.frame_path}` }
        : {}),
    })),
    variants: {
      reui: reuiCatalog?.variant_matrix ?? null,
    },
    cache: {
      entries: cacheManifest.entries.map((entry) => ({
        asset_id: entry.asset_id,
        source: entry.source,
        role: entry.root_or_dependency,
        local_path: `source-cache/${entry.local_path}`,
        physical_files: entry.cached_files?.length || 1,
        payload_source_files:
          entry.files_in_payload ?? entry.cached_files?.length ?? 1,
        sha256: entry.sha256,
        cache_status: entry.cache_status,
      })),
      by_source: cacheManifest.by_source,
      runtime_installation: cacheManifest.runtime_installation,
      strategy: cacheManifest.strategy,
    },
  };
}

async function readJson(url) {
  return JSON.parse(await readFile(url, "utf8"));
}

async function atomicWrite(url, value) {
  await mkdir(new URL(".", url), { recursive: true });
  const temporary = new URL(`${url.pathname}.tmp`, "file://");
  await writeFile(temporary, value, "utf8");
  await rename(temporary, url);
}

async function renderHtml(data) {
  const template = await readFile(TEMPLATE_URL, "utf8");
  const embedded = JSON.stringify(data).replaceAll("<", "\\u003c");
  return template.replace("__SHOWROOM_DATA__", embedded);
}

async function main() {
  const args = new Set(process.argv.slice(2));
  if (args.has("--help")) {
    console.log("Usage: node build-showroom.mjs [--write|--check]");
    return;
  }

  const [
    catalogIndex,
    capabilities,
    alternatives,
    discovery,
    cacheManifest,
    starterPack,
    tweakcnCatalog,
    reuiCatalog,
    livePreviewManifest,
  ] = await Promise.all([
    readJson(CATALOG_INDEX_URL),
    readJson(CAPABILITIES_URL),
    readJson(ALTERNATIVES_URL),
    readJson(DISCOVERY_URL),
    readJson(CACHE_MANIFEST_URL),
    readJson(STARTER_PACK_URL),
    readJson(TWEAKCN_CATALOG_URL),
    readJson(REUI_CATALOG_URL),
    readJson(LIVE_PREVIEW_MANIFEST_URL),
  ]);
  const data = buildShowroomData({
    catalogIndex,
    capabilities,
    alternatives,
    discovery,
    cacheManifest,
    starterPack,
    tweakcnCatalog,
    reuiCatalog,
    livePreviewManifest,
  });
  const json = `${JSON.stringify(data, null, 2)}\n`;
  const html = await renderHtml(data);

  if (args.has("--check")) {
    const [currentData, currentHtml] = await Promise.all([
      readFile(DATA_OUTPUT_URL, "utf8"),
      readFile(HTML_OUTPUT_URL, "utf8"),
    ]);
    if (currentData !== json) {
      throw new Error("showroom-data.json is stale; run with --write");
    }
    if (currentHtml !== html) {
      throw new Error("showroom.html is stale; run with --write");
    }
  } else if (args.has("--write")) {
    await Promise.all([
      atomicWrite(DATA_OUTPUT_URL, json),
      atomicWrite(HTML_OUTPUT_URL, html),
    ]);
  }

  console.log(
    JSON.stringify({
      total_assets: data.summary.total_assets,
      paid_items: data.summary.paid_items,
      cached_files: data.summary.cached_files,
      themes: data.themes.length,
      wrote: args.has("--write"),
      checked: args.has("--check"),
    }),
  );
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
