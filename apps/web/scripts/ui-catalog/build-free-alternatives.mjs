import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import process from "node:process";
import { pathToFileURL } from "node:url";

const ROOT = new URL("../../../../", import.meta.url);
const CAPABILITIES_URL = new URL(
  "docs/frontend/ui-assets/capabilities.json",
  ROOT,
);
const DISCOVERY_URL = new URL("docs/frontend/ui-assets/discovery.json", ROOT);
const JSON_OUTPUT_URL = new URL(
  "docs/frontend/ui-assets/free-alternatives.json",
  ROOT,
);
const MARKDOWN_OUTPUT_URL = new URL(
  "docs/frontend/ui-assets/free-alternatives.md",
  ROOT,
);

const PAID_TO_FREE_BRAND = {
  aceternity: "aceternity",
  "magic-ui-pro": "magic-ui",
  "react-bits-pro": "react-bits",
  reui: "reui",
};

const SOURCE_PRIORITY = {
  shadcn: 18,
  coss: 17,
  reui: 16,
  tremor: 15,
  aceternity: 12,
  "magic-ui": 11,
  "react-bits": 10,
  tweakcn: 8,
  "coss-origin": -40,
  "tremor-legacy": -40,
};

const STOP_WORDS = new Set([
  "a",
  "an",
  "and",
  "app",
  "application",
  "asset",
  "available",
  "block",
  "beautiful",
  "category",
  "component",
  "creative",
  "documentation",
  "docs",
  "for",
  "free",
  "general",
  "icon",
  "indexed",
  "kind",
  "landing",
  "license",
  "official",
  "page",
  "pages",
  "paid",
  "pro",
  "public",
  "publicly",
  "requires",
  "section",
  "set",
  "source",
  "style",
  "template",
  "the",
  "ui",
  "with",
]);

const OPEN_ICON_CANDIDATES = [
  {
    type: "external-oss",
    id: "external:lucide-icons",
    label: "Lucide Icons",
    source: "lucide",
    license: "ISC",
    access_status: "public-source",
    match_level: "capability-oss",
    url: "https://lucide.dev/icons/",
    source_url: "https://github.com/lucide-icons/lucide",
    reason: "成熟的公开图标集合，项目已使用 lucide-react；先按语义选择最接近图标。",
    tradeoff: "不是 ReUI Ultimate 的同一套造型，需按项目线宽、尺寸和光学对齐规范统一。",
  },
  {
    type: "external-oss",
    id: "external:tabler-icons",
    label: "Tabler Icons",
    source: "tabler-icons",
    license: "MIT",
    access_status: "public-source",
    match_level: "capability-oss",
    url: "https://tabler.io/icons",
    source_url: "https://github.com/tabler/tabler-icons",
    reason: "MIT 图标集合覆盖面大，可补 Lucide 缺少的业务语义。",
    tradeoff: "与 Lucide 混用会出现笔画和边界差异；同一页面默认只保留一个图标家族。",
  },
];

const FEATURE_CACHE = new WeakMap();

const FALLBACKS = {
  "ai-chat": ["external:ai-elements", "external:kibo-ui"],
  "auth-login": ["shadcn:login-01"],
  "background-effects": [
    "magic-ui:animated-grid-pattern",
    "react-bits:SoftAurora",
    "aceternity:background-beams-with-collision",
  ],
  "bento-layout": ["aceternity:bento-grid", "magic-ui:bento-grid"],
  calendar: ["coss:p-calendar-13", "shadcn:calendar"],
  "charts-visualization": [
    "tremor:block/chart-compositions/chart-composition-01",
    "shadcn:chart-area-default",
  ],
  "command-palette": ["coss:p-command-2", "reui:c-command-5"],
  "combobox-autocomplete": ["coss:p-combobox-19", "reui:c-combobox-25"],
  "dashboard-kpi": [
    "tremor:block/kpi-cards/kpi-card-01",
    "shadcn:dashboard-01",
  ],
  "data-grid": ["reui:c-data-grid-20", "coss:p-table-8"],
  "date-picker": ["coss:p-date-picker-2", "reui:c-calendar-29"],
  "empty-state": [
    "coss:p-empty-1",
    "tremor:block/empty-states/empty-state-01",
  ],
  "file-upload": ["external:kibo-ui", "external:dice-ui"],
  filters: [
    "tremor:block/filterbar/filterbar-01",
    "coss:p-input-group-23",
  ],
  "forms-input": ["coss:p-field-9"],
  "kanban-gantt": ["external:kibo-ui", "external:dice-ui"],
  "motion-animation": ["external:animate-ui", "external:motion-primitives"],
  "navigation-sidebar": ["shadcn:sidebar-07"],
  notifications: ["magic-ui:animated-list"],
  "table": ["coss:p-table-8", "tremor:block/tables/table-01"],
  "text-animation": [
    "external:motion-primitives",
    "aceternity:text-generate-effect",
  ],
  "timeline-activity": ["aceternity:timeline", "magic-ui:animated-list"],
};

function words(value) {
  return new Set(
    String(value ?? "")
      .normalize("NFKD")
      .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .map((word) => (word.length > 4 && word.endsWith("s") ? word.slice(0, -1) : word))
      .filter((word) => word.length > 2 && !STOP_WORDS.has(word)),
  );
}

function intersection(left, right) {
  return [...left].filter((value) => right.has(value));
}

function canonicalCapabilities(asset) {
  return new Set(
    (asset.capability_ids ?? []).filter(
      (capability) =>
        !capability.startsWith("kind/") &&
        !capability.startsWith("category/"),
    ),
  );
}

function searchableText(asset) {
  return [
    asset.upstream_name,
    asset.display_name,
    asset.description,
    asset.kind,
    asset.category,
  ]
    .filter(Boolean)
    .join(" ");
}

function features(asset) {
  const cached = FEATURE_CACHE.get(asset);
  if (cached) return cached;
  const text = searchableText(asset);
  const value = {
    capabilities: canonicalCapabilities(asset),
    semantics: semanticTags(asset),
    words: words(text),
  };
  FEATURE_CACHE.set(asset, value);
  return value;
}

function semanticTags(asset) {
  const tags = canonicalCapabilities(asset);
  const text = searchableText(asset).toLowerCase();

  if (asset.kind === "icon") tags.add("icons");
  if (asset.kind === "template") tags.add("page-shell");
  if (/\b(ai|agent|chat|prompt|reasoning|tool-call)\b/.test(text)) {
    tags.add("ai-chat");
  }
  if (/hero|feature|pricing|testimonial|social-proof|footer|cta|about|contact|blog|logo-cloud/.test(text)) {
    tags.add("marketing-section");
  }
  if (/dashboard|analytics|monitoring|app-shell|application|solution/.test(text)) {
    tags.add("application-shell");
  }
  if (/motion|animation|animated|background|shader|aurora|beam|text-effect/.test(text)) {
    tags.add("motion-animation");
  }
  if (/gantt|kanban|editor|dropzone|file-upload/.test(text)) {
    tags.add("advanced-functional");
  }
  return tags;
}

function candidateScore(paid, candidate, sameBrand) {
  const paidFeatures = features(paid);
  const candidateFeatures = features(candidate);
  const sharedCapabilities = intersection(
    paidFeatures.capabilities,
    candidateFeatures.capabilities,
  );
  const sharedSemantics = intersection(
    paidFeatures.semantics,
    candidateFeatures.semantics,
  );
  const sharedWords = intersection(paidFeatures.words, candidateFeatures.words);
  const sameCategory = paid.category === candidate.category;
  const relevant =
    sharedCapabilities.length > 0 ||
    (sameBrand && sharedSemantics.length > 0) ||
    sameCategory ||
    sharedWords.length > 0;

  if (!relevant) return null;

  let score = sharedCapabilities.length * 100;
  score += sharedSemantics.length * 70;
  if (sameCategory) score += 60;
  score += Math.min(sharedWords.length, 4) * 12;
  if (paid.kind === candidate.kind) score += 8;
  if (sameBrand) score += 55;
  score += SOURCE_PRIORITY[candidate.source] ?? 0;
  if (candidate.maintenance_status !== "current") score -= 50;

  return {
    score,
    sharedCapabilities: [...new Set([...sharedCapabilities, ...sharedSemantics])],
    sharedWords,
  };
}

function catalogCandidate(asset, matchLevel, matched) {
  const shared = matched.sharedCapabilities.length
    ? matched.sharedCapabilities.join("、")
    : matched.sharedWords.slice(0, 3).join("、") || asset.category;
  return {
    type: "catalog-asset",
    id: asset.id,
    label: asset.display_name || asset.upstream_name,
    source: asset.source,
    license: asset.license,
    access_status: asset.access_status,
    match_level: matchLevel,
    url: asset.preview_url,
    source_url: asset.source_url,
    reason:
      matchLevel === "same-brand-free"
        ? `同品牌公开 Free 源码，视觉语言更接近；共同能力：${shared}。`
        : `当前维护的公开源码候选，共同能力：${shared}。`,
    tradeoff:
      matchLevel === "same-brand-free"
        ? "Free 项通常不是付费成品区块的一比一复刻，仍需用业务数据与现有 primitives 重新组合。"
        : "跨库替代会改变视觉、DOM 或底层 primitive；接入前要在真实业务容器并排比较。",
  };
}

function discoveryCandidate(source) {
  return {
    type: "external-oss",
    id: `external:${source.id}`,
    label: source.name,
    source: source.id,
    license: source.license,
    access_status: source.access_status,
    match_level: "capability-oss",
    url: source.official_url,
    source_url: source.repository_url,
    reason: `${source.role}；官方源码与许可证已核验，可作为付费能力的功能替代。`,
    tradeoff: `当前仅为 discovery，尚未全量入库或缓存源码；${source.compatibility}`,
  };
}

function compositionCandidate(paid) {
  return {
    type: "composition",
    id: "composition:project-business-layer",
    label: "用现有免费 primitives 重组业务组合层",
    source: "project",
    license: "项目自有代码（基础依赖各自遵守原许可证）",
    access_status: "not-applicable",
    match_level: "project-composition",
    url: "agent-workflow.md",
    source_url: "agent-workflow.md",
    reason: `围绕“${paid.display_name || paid.upstream_name}”的功能需求，复用已收录免费 primitives，只独立实现业务编排和数据适配。`,
    tradeoff: "不能照抄付费源码或受保护设计；需要自行补齐交互状态、可访问性、响应式和回归测试。",
  };
}

function specializedExternalIds(paid) {
  const tags = semanticTags(paid);
  const ids = [];

  if (tags.has("ai-chat")) ids.push("external:ai-elements", "external:kibo-ui");
  if (tags.has("advanced-functional")) {
    ids.push("external:kibo-ui", "external:dice-ui");
  }
  if (
    tags.has("motion-animation") ||
    tags.has("background-effects") ||
    tags.has("text-animation")
  ) {
    ids.push("external:animate-ui", "external:motion-primitives");
  }

  return [...new Set(ids)];
}

function fallbackIds(paid) {
  const tags = semanticTags(paid);
  const ids = [];
  for (const tag of tags) ids.push(...(FALLBACKS[tag] ?? []));

  if (tags.has("marketing-section")) {
    ids.push("aceternity:bento-grid", "magic-ui:bento-grid");
  }
  if (tags.has("application-shell") || tags.has("page-shell")) {
    ids.push("shadcn:dashboard-01", "tremor:block/page-shells/page-shell-01");
  }
  return [...new Set(ids)];
}

function addUnique(target, candidate) {
  if (!candidate || target.some((item) => item.id === candidate.id)) return;
  target.push(candidate);
}

function bestCatalogCandidate(paid, pool, sameBrand) {
  const ranked = [];
  for (const candidate of pool) {
    const matched = candidateScore(paid, candidate, sameBrand);
    if (matched) ranked.push({ candidate, matched });
  }
  ranked.sort(
    (left, right) =>
      right.matched.score - left.matched.score ||
      left.candidate.id.localeCompare(right.candidate.id),
  );
  return ranked[0] ?? null;
}

function buildMapping(paid, publicAssets, assetsById, externalById) {
  if (paid.kind === "icon") {
    return {
      paid_asset: paidAssetSummary(paid),
      closest_free_alternatives: [
        ...OPEN_ICON_CANDIDATES,
        compositionCandidate(paid),
      ],
      recommendation_note:
        "先按语义从 Lucide 查找；缺失时查 Tabler，仍不合适才独立绘制项目自有图标。",
    };
  }

  const alternatives = [];
  const freeBrand = PAID_TO_FREE_BRAND[paid.source];
  if (freeBrand) {
    const sameBrand = bestCatalogCandidate(
      paid,
      publicAssets.filter((asset) => asset.source === freeBrand),
      true,
    );
    if (sameBrand) {
      addUnique(
        alternatives,
        catalogCandidate(sameBrand.candidate, "same-brand-free", sameBrand.matched),
      );
    }
  }

  for (const id of specializedExternalIds(paid)) {
    addUnique(alternatives, externalById.get(id));
    if (alternatives.length >= 2) break;
  }

  for (const id of fallbackIds(paid)) {
    if (alternatives.length >= 3) break;
    if (id.startsWith("external:")) {
      addUnique(alternatives, externalById.get(id));
      continue;
    }
    const candidate = assetsById.get(id);
    if (!candidate || candidate.access_status !== "public-source") continue;
    const matched = candidateScore(paid, candidate, false) ?? {
      sharedCapabilities: [],
      sharedWords: ["curated-fallback"],
    };
    addUnique(
      alternatives,
      catalogCandidate(candidate, "curated-capability-oss", matched),
    );
  }

  if (alternatives.length < 3) {
    const crossLibrary = bestCatalogCandidate(
      paid,
      publicAssets.filter((asset) => asset.source !== freeBrand),
      false,
    );
    if (crossLibrary) {
      addUnique(
        alternatives,
        catalogCandidate(
          crossLibrary.candidate,
          "same-capability-oss",
          crossLibrary.matched,
        ),
      );
    }
  }

  addUnique(alternatives, compositionCandidate(paid));
  return {
    paid_asset: paidAssetSummary(paid),
    closest_free_alternatives: alternatives.slice(0, 3),
    recommendation_note:
      "先看第一候选真实预览；若同一能力有多个候选，按 comparison-template.md 在真实业务容器并排后再拍板。",
  };
}

function paidAssetSummary(asset) {
  return {
    id: asset.id,
    source: asset.source,
    upstream_name: asset.upstream_name,
    display_name: asset.display_name,
    description: asset.description,
    kind: asset.kind,
    category: asset.category,
    capability_ids: asset.capability_ids,
    preview_url: asset.preview_url,
    source_url: asset.source_url,
    license: asset.license,
    access_status: asset.access_status,
  };
}

function countBy(values) {
  const counts = {};
  for (const value of values) counts[value] = (counts[value] ?? 0) + 1;
  return Object.fromEntries(
    Object.entries(counts).sort(([left], [right]) => left.localeCompare(right)),
  );
}

export function buildFreeAlternatives({ assets, discovery = { sources: [] } }) {
  const paidAssets = assets
    .filter((asset) => asset.access_status === "paid-source-after-license")
    .sort((left, right) => left.id.localeCompare(right.id));
  const publicAssets = assets.filter(
    (asset) =>
      asset.access_status === "public-source" &&
      !["coss-origin", "tremor-legacy"].includes(asset.source),
  );
  const assetsById = new Map(publicAssets.map((asset) => [asset.id, asset]));
  const externalCandidates = (discovery.sources ?? []).map(discoveryCandidate);
  const externalById = new Map(
    externalCandidates.map((candidate) => [candidate.id, candidate]),
  );
  const mappings = paidAssets.map((paid) =>
    buildMapping(paid, publicAssets, assetsById, externalById),
  );

  return {
    schema_version: 1,
    generated_at: null,
    policy: {
      order: [
        "same-brand-free",
        "specialized-open-source",
        "same-capability-current-catalog",
        "project-owned-composition",
      ],
      prohibited: [
        "绕过登录、license key 或会员接口",
        "复制未授权付费源码",
        "照抄受保护的成品设计并冒充自有实现",
      ],
      comparison_required:
        "同能力多候选须展示真实预览、底层、依赖、许可证与适配成本后再拍板。",
    },
    summary: {
      paid_items: paidAssets.length,
      mapped_items: mappings.length,
      unresolved_items: mappings.filter(
        (mapping) => mapping.closest_free_alternatives.length === 0,
      ).length,
      by_paid_source: countBy(paidAssets.map((asset) => asset.source)),
      first_choice_by_type: countBy(
        mappings.map(
          (mapping) => mapping.closest_free_alternatives[0]?.type ?? "unresolved",
        ),
      ),
      first_choice_by_match: countBy(
        mappings.map(
          (mapping) =>
            mapping.closest_free_alternatives[0]?.match_level ?? "unresolved",
        ),
      ),
    },
    mappings,
  };
}

function markdownFor(output, discovery) {
  const categoryRows = new Map();
  for (const mapping of output.mappings) {
    const key = `${mapping.paid_asset.source}\u0000${mapping.paid_asset.category}`;
    const current = categoryRows.get(key) ?? {
      source: mapping.paid_asset.source,
      category: mapping.paid_asset.category,
      count: 0,
      choices: new Map(),
    };
    current.count += 1;
    const first = mapping.closest_free_alternatives[0];
    if (first) current.choices.set(first.label, (current.choices.get(first.label) ?? 0) + 1);
    categoryRows.set(key, current);
  }

  const rows = [...categoryRows.values()].sort(
    (left, right) =>
      left.source.localeCompare(right.source) ||
      right.count - left.count ||
      left.category.localeCompare(right.category),
  );

  const lines = [
    "# 付费能力的合法免费替代",
    "",
    "> 生成日期：2026-08-19。完整逐项映射在 `free-alternatives.json` 和离线 HTML 展厅；这里保留规则与分类摘要。",
    "",
    "## 覆盖结论",
    "",
    `- 已覆盖 **${output.summary.mapped_items.toLocaleString("en-US")} / ${output.summary.paid_items.toLocaleString("en-US")}** 个已知付费项，未解决 ${output.summary.unresolved_items}。`,
    "- 第一优先：同品牌 Free；第二优先：同能力的当前维护开源源码；第三优先：项目自有业务组合层。",
    "- 不绕过登录、license key、401 或会员接口，不缓存未获授权的付费源码。",
    "",
    "| 付费来源 | 已知付费项 |",
    "|---|---:|",
    ...Object.entries(output.summary.by_paid_source).map(
      ([source, count]) => `| ${source} | ${count.toLocaleString("en-US")} |`,
    ),
    "",
    "## 新增免费候选",
    "",
    "| 候选 | 许可证 | 作用 | 状态 |",
    "|---|---|---|---|",
    ...discovery.sources.map(
      (source) =>
        `| [${source.name}](${source.official_url}) | ${source.license} | ${source.role} | discovery-only，源码未缓存 |`,
    ),
    "",
    "## 分类级替代摘要",
    "",
    "| 付费来源 | 分类 | 数量 | 最常见第一候选 |",
    "|---|---|---:|---|",
    ...rows.map((row) => {
      const [choice = "项目组合层"] = [...row.choices.entries()].sort(
        (left, right) => right[1] - left[1] || left[0].localeCompare(right[0]),
      )[0] ?? [];
      return `| ${row.source} | ${row.category} | ${row.count} | ${choice} |`;
    }),
    "",
    "## 使用规则",
    "",
    "1. 在 HTML 或 JSON 搜付费项名称，先打开最接近免费候选的真实预览。",
    "2. 同一能力有多源时，用 `comparison-template.md` 并排比较后再决定，不能静默替老板选。",
    "3. `discovery-only` 只表示官方许可和方向已核验，必须完成全量目录/源码端点审计后才能称已收录。",
    "4. 独立业务组合层只实现业务逻辑、状态和数据适配，不照抄付费源码或受保护设计。",
  ];
  return `${lines.join("\n")}\n`;
}

async function atomicWrite(url, value) {
  await mkdir(new URL(".", url), { recursive: true });
  const temporary = new URL(`${url.pathname}.tmp`, "file://");
  await writeFile(temporary, value, "utf8");
  await rename(temporary, url);
}

async function main() {
  const args = new Set(process.argv.slice(2));
  if (args.has("--help")) {
    console.log("Usage: node build-free-alternatives.mjs [--write|--check]");
    return;
  }

  const capabilities = JSON.parse(await readFile(CAPABILITIES_URL, "utf8"));
  const discovery = JSON.parse(await readFile(DISCOVERY_URL, "utf8"));
  const output = buildFreeAlternatives({ assets: capabilities.assets, discovery });
  output.generated_at = capabilities.generated_at;
  const json = `${JSON.stringify(output, null, 2)}\n`;
  const markdown = markdownFor(output, discovery);

  if (args.has("--check")) {
    const [currentJson, currentMarkdown] = await Promise.all([
      readFile(JSON_OUTPUT_URL, "utf8"),
      readFile(MARKDOWN_OUTPUT_URL, "utf8"),
    ]);
    if (currentJson !== json) {
      throw new Error("free-alternatives.json is stale; run with --write");
    }
    if (currentMarkdown !== markdown) {
      throw new Error("free-alternatives.md is stale; run with --write");
    }
  } else if (args.has("--write")) {
    await Promise.all([
      atomicWrite(JSON_OUTPUT_URL, json),
      atomicWrite(MARKDOWN_OUTPUT_URL, markdown),
    ]);
  }

  console.log(
    JSON.stringify({
      paid_items: output.summary.paid_items,
      mapped_items: output.summary.mapped_items,
      unresolved_items: output.summary.unresolved_items,
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
