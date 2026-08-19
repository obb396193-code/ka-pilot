import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import process from "node:process";
import { pathToFileURL } from "node:url";

const CATALOG_ROOT = new URL(
  "../../../../docs/frontend/ui-assets/catalogs/",
  import.meta.url,
);
const OUTPUT_URL = new URL(
  "../../../../docs/frontend/ui-assets/capabilities.json",
  import.meta.url,
);

const CANONICAL_CAPABILITIES = [
  {
    id: "date-picker",
    label: "日期与日期范围选择",
    keywords: ["date picker", "date range", "日期选择", "日期范围"],
    match: /\bdate[- ]?picker\b|\bdate[- ]?range\b/i,
  },
  {
    id: "calendar",
    label: "日历与排期",
    keywords: ["calendar", "schedule", "日历", "排期"],
    match: /\bcalendar\b|\bschedule\b/i,
  },
  {
    id: "data-grid",
    label: "复杂数据表格",
    keywords: ["data grid", "virtual table", "列配置", "虚拟表格"],
    match: /\bdata[- ]?grid\b|\bvirtual(?:ized)?[- ]?table\b/i,
  },
  {
    id: "table",
    label: "表格与数据表",
    keywords: ["table", "data table", "表格"],
    match: /\btable\b|\bdata[- ]?table\b/i,
  },
  {
    id: "filters",
    label: "筛选器与筛选面板",
    keywords: ["filter", "faceted", "筛选"],
    match: /\bfilter(?:ing|s)?\b|\bfaceted\b/i,
  },
  {
    id: "combobox-autocomplete",
    label: "组合框与自动补全",
    keywords: ["combobox", "autocomplete", "组合框", "自动补全"],
    match: /\bcombo[- ]?box\b|\bauto[- ]?complete\b/i,
  },
  {
    id: "command-palette",
    label: "命令面板与快捷搜索",
    keywords: ["command", "command palette", "命令面板", "快捷搜索"],
    match: /\bcommand(?:[- ]?palette)?\b/i,
  },
  {
    id: "search",
    label: "搜索",
    keywords: ["search", "搜索"],
    match: /\bsearch\b/i,
  },
  {
    id: "dialog-modal",
    label: "对话框与模态层",
    keywords: ["dialog", "modal", "alert dialog", "对话框"],
    match: /\bdialog\b|\bmodal\b/i,
  },
  {
    id: "sheet-drawer",
    label: "抽屉与侧滑面板",
    keywords: ["sheet", "drawer", "抽屉", "侧滑"],
    match: /\bsheet\b|\bdrawer\b/i,
  },
  {
    id: "popover-tooltip",
    label: "气泡层与提示",
    keywords: ["popover", "tooltip", "hover card", "提示"],
    match: /\bpopover\b|\btooltip\b|\bhover[- ]?card\b/i,
  },
  {
    id: "empty-state",
    label: "空状态",
    keywords: ["empty state", "empty", "空状态"],
    match: /\bempty(?:[- ]?state)?\b/i,
  },
  {
    id: "forms-input",
    label: "表单与输入",
    keywords: ["form", "field", "input", "textarea", "表单", "输入"],
    match: /\bform\b|\bfield(?:set)?\b|\binput(?:[- ]?group)?\b|\btextarea\b/i,
  },
  {
    id: "select-menu",
    label: "选择器与菜单",
    keywords: ["select", "dropdown", "menu", "选择器", "菜单"],
    match: /\bselect\b|\bdropdown\b|\bmenu\b/i,
  },
  {
    id: "navigation-sidebar",
    label: "侧栏与应用导航",
    keywords: ["sidebar", "app shell", "navigation", "侧栏", "导航"],
    match: /\bside[- ]?bar\b|\bapp[- ]?shell\b|\bnavigation\b/i,
  },
  {
    id: "tabs-segmented",
    label: "标签页与分段控制",
    keywords: ["tabs", "segmented", "标签页"],
    match: /\btabs?\b|\bsegmented\b/i,
  },
  {
    id: "cards",
    label: "卡片",
    keywords: ["card", "卡片"],
    match: /\bcard\b/i,
  },
  {
    id: "dashboard-kpi",
    label: "看板、KPI 与指标卡",
    keywords: ["dashboard", "kpi", "metric", "stats", "看板", "指标"],
    match: /\bdashboard\b|\bkpi\b|\bmetric(?:s)?\b|\bstats?\b/i,
  },
  {
    id: "charts-visualization",
    label: "图表与数据可视化",
    keywords: ["chart", "sparkline", "visualization", "图表", "可视化"],
    match: /\bchart\b|\bspark[- ]?line\b|\bvisuali[sz]ation\b/i,
  },
  {
    id: "bento-layout",
    label: "Bento 与展示布局",
    keywords: ["bento", "feature grid", "Bento 布局"],
    match: /\bbento\b|\bfeature[- ]?grid\b/i,
  },
  {
    id: "background-effects",
    label: "背景与氛围效果",
    keywords: ["background", "aurora", "beam", "grid pattern", "背景效果"],
    match: /\bbackground\b|\baurora\b|\bbeams?\b|\bgrid[- ]?pattern\b/i,
  },
  {
    id: "text-animation",
    label: "文字动效",
    keywords: ["text animation", "animated text", "文字动效"],
    match: /\btext[- ]?(?:animation|effect)\b|\banimated[- ]?text\b/i,
  },
  {
    id: "motion-animation",
    label: "交互动效",
    keywords: ["motion", "animation", "animated", "动效", "动画"],
    match: /\bmotion\b|\banimat(?:e|ed|ion)\b/i,
  },
  {
    id: "themes",
    label: "主题与多风格",
    keywords: ["theme", "style preset", "主题", "风格"],
    match: /\bthemes?\b|\bstyle[- ]?preset\b/i,
    matchItem: (item) => ["theme", "style"].includes(item.kind),
  },
  {
    id: "file-upload",
    label: "文件上传",
    keywords: ["file upload", "dropzone", "上传"],
    match: /\bfile[- ]?upload\b|\bdrop[- ]?zone\b/i,
  },
  {
    id: "pagination",
    label: "分页",
    keywords: ["pagination", "分页"],
    match: /\bpagination\b/i,
  },
  {
    id: "notifications",
    label: "通知、Toast 与提醒",
    keywords: ["notification", "toast", "sonner", "通知", "提醒"],
    match: /\bnotification\b|\btoast\b|\bsonner\b/i,
  },
  {
    id: "kanban-gantt",
    label: "看板流与甘特图",
    keywords: ["kanban", "gantt", "看板流", "甘特图"],
    match: /\bkanban\b|\bgantt\b/i,
  },
  {
    id: "timeline-activity",
    label: "时间线与活动记录",
    keywords: ["timeline", "activity", "时间线", "活动记录"],
    match: /\btimeline\b|\bactivity[- ]?(?:feed|log)?\b/i,
  },
  {
    id: "auth-login",
    label: "登录与身份页面",
    keywords: ["auth", "login", "sign in", "登录"],
    match: /\bauth\b|\blog[- ]?in\b|\bsign[- ]?in\b/i,
  },
  {
    id: "ai-chat",
    label: "AI 对话与助手界面",
    keywords: ["ai chat", "chatbot", "assistant", "AI 对话", "助手"],
    match: /\bai[- ]?chat\b|\bchat[- ]?bot\b|\bassistant\b/i,
  },
];

const INTEGRATION_PROFILES = {
  shadcn: {
    adaptation_cost: "low",
    note: "当前全站基础；优先复用 New York v4 源码并通过 CSS variables/cva 适配。",
  },
  coss: {
    adaptation_cost: "medium",
    note: "细节组件优先；Base UI 与现有 Radix 并存，须隔离目录、portal root 和同名 primitive。",
  },
  "coss-origin": {
    adaptation_cost: "high",
    note: "仅作 legacy 缺口参考；优先选 current coss，使用前核对维护状态与依赖。",
  },
  reui: {
    adaptation_cost: "medium-high",
    note: "复杂 Data Grid/筛选优先；先核对 Registry style、TanStack 依赖和数据量边界。",
  },
  tremor: {
    adaptation_cost: "medium",
    note: "KPI/报告版式优先；图表运行时默认改接项目 ECharts，避免双图表体系。",
  },
  "tremor-legacy": {
    adaptation_cost: "high",
    note: "旧 @tremor/react 仅作能力/迁移参考；新代码优先 Tremor Raw。",
  },
  aceternity: {
    adaptation_cost: "medium-high",
    note: "高级展示与动效；先分清 Free/Pro 许可证，并验证后台场景下的性能与克制度。",
  },
  "magic-ui": {
    adaptation_cost: "medium",
    note: "Bento/局部动效；按需复制，接项目 token 并补 reduced-motion。",
  },
  "magic-ui-pro": {
    adaptation_cost: "medium-high",
    note: "公开预览仅是下限目录；购买并取得 Registry token 后才能检查源码和真实依赖。",
  },
  "react-bits": {
    adaptation_cost: "medium-high",
    note: "偶尔使用的强视觉动效；选择 TS+Tailwind 变体，验证性能并遵守 Commons Clause。",
  },
  "react-bits-pro": {
    adaptation_cost: "medium-high",
    note: "公开目录可选型；源码需对应 Starter/Pro/Ultimate 许可证，禁止镜像或再分发。",
  },
  tweakcn: {
    adaptation_cost: "medium",
    note: "运行时多风格核心；主题值需映射到稳定语义 token，不能把编辑器状态直接当业务契约。",
  },
};

const GUIDE_ALIASES = {
  "coss-origin": "coss",
  "tremor-legacy": "tremor",
  "magic-ui-pro": "magic-ui",
  "react-bits-pro": "react-bits",
};

function slugify(value) {
  return value
    .normalize("NFKD")
    .replace(/([a-z0-9])([A-Z])/g, "$1-$2")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "uncategorized";
}

function searchableText(item) {
  return [
    item.upstream_name,
    item.display_name,
    item.description,
    item.category,
    item.kind,
    ...(Array.isArray(item.upstream_meta?.categories) ? item.upstream_meta.categories : []),
    item.upstream_meta?.category,
  ].filter(Boolean).join(" ");
}

export function canonicalCapabilityIds(item) {
  const haystack = searchableText(item);
  return CANONICAL_CAPABILITIES
    .filter((definition) =>
      definition.match.test(haystack) || definition.matchItem?.(item),
    )
    .map((definition) => definition.id);
}

function summaryForAsset(item) {
  const capabilityIds = [
    ...canonicalCapabilityIds(item),
    `kind/${slugify(item.kind)}`,
    `category/${slugify(item.category)}`,
  ];
  const profile = INTEGRATION_PROFILES[item.source] ?? {
    adaptation_cost: "review-required",
    note: "首次使用前按官方指南评估。",
  };

  return {
    id: `${item.source}:${item.upstream_name}`,
    source: item.source,
    upstream_name: item.upstream_name,
    display_name: item.display_name,
    description: item.description,
    kind: item.kind,
    category: item.category,
    capability_ids: [...new Set(capabilityIds)].sort(),
    preview_url: item.preview_url,
    source_url: item.source_url,
    guide_path: `guides/${GUIDE_ALIASES[item.source] ?? item.source}.md`,
    install_command: item.install_command,
    foundation: item.foundation,
    dependencies: item.dependencies,
    license: item.license,
    project_fit: item.project_fit,
    theme_ready: item.theme_ready,
    adaptation_cost: profile.adaptation_cost,
    adaptation_note: profile.note,
    upstream_ref: item.upstream_ref,
    last_verified: item.last_verified,
    local_status: item.local_status,
    local_path: item.local_path,
    access_status: item.access_status,
    access_tier: item.access_tier,
    auth_requirement: item.auth_requirement,
    license_scope: item.license_scope,
    source_cache_status: item.source_cache_status,
    maintenance_status: item.maintenance_status,
    related_or_duplicate_of: item.related_or_duplicate_of,
    decision_record: item.decision_record,
    comparison_record: item.comparison_record,
  };
}

function capabilityMetadata(id) {
  const canonical = CANONICAL_CAPABILITIES.find((item) => item.id === id);
  if (canonical) {
    return {
      label: canonical.label,
      keywords: canonical.keywords,
      scope: "canonical",
    };
  }
  const [scope, slug] = id.split("/");
  return {
    label: `${scope === "kind" ? "类型" : "官方分类"}：${slug}`,
    keywords: [slug],
    scope,
  };
}

export function buildCapabilityIndex(catalogs, options = {}) {
  const assets = [];
  const identities = new Set();
  const sourceSummary = [];

  for (const catalog of catalogs) {
    sourceSummary.push({
      id: catalog.source,
      coverage: catalog.coverage,
      item_count: catalog.items.length,
    });
    for (const item of catalog.items) {
      const identity = `${item.source}:${item.upstream_name}`;
      if (identities.has(identity)) {
        throw new Error(`duplicate asset identity: ${identity}`);
      }
      identities.add(identity);
      assets.push(summaryForAsset(item));
    }
  }

  assets.sort((a, b) => a.id.localeCompare(b.id));
  sourceSummary.sort((a, b) => a.id.localeCompare(b.id));

  const groups = new Map();
  for (const asset of assets) {
    for (const id of asset.capability_ids) {
      if (!groups.has(id)) groups.set(id, []);
      groups.get(id).push(asset);
    }
  }

  const capabilities = [...groups.entries()]
    .map(([id, candidates]) => ({
      id,
      ...capabilityMetadata(id),
      candidate_count: candidates.length,
      sources: [...new Set(candidates.map((item) => item.source))].sort(),
      asset_ids: candidates.map((item) => item.id).sort(),
    }))
    .sort((a, b) => a.id.localeCompare(b.id));

  return {
    schema_version: 1,
    generated_at: options.generatedAt ?? null,
    selection_rule: "同一 canonical capability 有多个来源时，先按 comparison-template.md 展示真实预览和工程对比；已有 preferred 且场景相同则直接复用。",
    total_items: assets.length,
    indexed_items: assets.filter((item) => item.capability_ids.length > 0).length,
    capability_count: capabilities.length,
    canonical_capability_count: capabilities.filter((item) => item.scope === "canonical").length,
    multi_source_canonical_count: capabilities.filter(
      (item) => item.scope === "canonical" && item.sources.length > 1,
    ).length,
    source_summary: sourceSummary,
    capabilities,
    assets,
  };
}

export function queryCapabilityIndex(index, query, options = {}) {
  const normalized = query.trim().toLowerCase();
  const source = options.source ?? "";
  const limit = Number.isFinite(options.limit) ? options.limit : 50;
  const exactCapability = index.capabilities.find((item) => item.id === normalized);
  const exactIds = new Set(exactCapability?.asset_ids ?? []);

  const matches = index.assets.filter((asset) => {
    if (source && asset.source !== source) return false;
    if (exactIds.has(asset.id)) return true;
    return [
      asset.id,
      asset.display_name,
      asset.description,
      asset.kind,
      asset.category,
      ...asset.capability_ids,
    ].filter(Boolean).join(" ").toLowerCase().includes(normalized);
  });

  return {
    query,
    source: source || "all",
    capability: exactCapability ?? null,
    total_matches: matches.length,
    returned: Math.min(matches.length, limit),
    candidates: matches.slice(0, limit),
  };
}

async function readCatalogs() {
  const catalogIndex = JSON.parse(await readFile(new URL("index.json", CATALOG_ROOT), "utf8"));
  const catalogs = await Promise.all(catalogIndex.sources.map(async (source) => {
    const catalog = JSON.parse(await readFile(new URL(source.file, CATALOG_ROOT), "utf8"));
    return catalog;
  }));
  return { catalogIndex, catalogs };
}

async function atomicWrite(url, value) {
  await mkdir(new URL(".", url), { recursive: true });
  const temporary = new URL(`${url.pathname}.tmp`, "file://");
  await writeFile(temporary, value, "utf8");
  await rename(temporary, url);
}

async function main() {
  const rawArgs = process.argv.slice(2);
  const args = new Set(rawArgs);
  const argValue = (flag, fallback = "") => {
    const index = rawArgs.indexOf(flag);
    return index >= 0 ? rawArgs[index + 1] ?? fallback : fallback;
  };
  if (args.has("--help")) {
    console.log("Usage: node build-capability-index.mjs [--write|--check|--query <term> [--source <id>] [--limit <n>]]");
    return;
  }

  const { catalogIndex, catalogs } = await readCatalogs();
  const result = buildCapabilityIndex(catalogs, {
    generatedAt: catalogIndex.fetched_at,
  });
  if (result.total_items !== catalogIndex.total_items) {
    throw new Error(
      `catalog/index mismatch: expected ${catalogIndex.total_items}, indexed ${result.total_items}`,
    );
  }

  const serialized = `${JSON.stringify(result, null, 2)}\n`;
  const query = argValue("--query");
  if (query) {
    const limit = Number.parseInt(argValue("--limit", "50"), 10);
    console.log(JSON.stringify(queryCapabilityIndex(result, query, {
      source: argValue("--source"),
      limit: Number.isFinite(limit) && limit > 0 ? limit : 50,
    }), null, 2));
    return;
  }

  if (args.has("--check")) {
    const current = await readFile(OUTPUT_URL, "utf8");
    if (current !== serialized) throw new Error("capabilities.json is stale; run with --write");
  } else if (args.has("--write")) {
    await atomicWrite(OUTPUT_URL, serialized);
  }

  console.log(JSON.stringify({
    total_items: result.total_items,
    capability_count: result.capability_count,
    canonical_capability_count: result.canonical_capability_count,
    multi_source_canonical_count: result.multi_source_canonical_count,
    wrote: args.has("--write"),
    checked: args.has("--check"),
  }));
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
