import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import process from "node:process";
import { pathToFileURL } from "node:url";

const ROOT = new URL("../../../../", import.meta.url);
const CAPABILITIES_URL = new URL("docs/frontend/ui-assets/capabilities.json", ROOT);
const DISCOVERY_URL = new URL("docs/frontend/ui-assets/discovery.json", ROOT);
const CACHE_MANIFEST_URL = new URL(
  "docs/frontend/ui-assets/source-cache/manifest.json",
  ROOT,
);
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

const CURRENT_PUBLIC_SOURCES = new Set([
  "shadcn",
  "coss",
  "reui",
  "tremor",
  "aceternity",
  "magic-ui",
  "react-bits",
  "tweakcn",
]);

const LICENSE_VERIFIED_SOURCES = new Set([
  "shadcn",
  "coss",
  "reui",
  "tremor",
  "magic-ui",
  "react-bits",
  "tweakcn",
]);

const REDISTRIBUTION_RESTRICTED_SOURCES = new Set(["react-bits"]);

const GENERIC_MATCH_WORDS = new Set([
  "and",
  "animated",
  "animation",
  "background",
  "block",
  "card",
  "component",
  "effect",
  "feature",
  "gradient",
  "hero",
  "motion",
  "shader",
  "that",
  "the",
  "section",
  "template",
  "text",
  "this",
  "with",
]);

const COMPOSITION_MATCH_LEVELS = new Set([
  "collection-selection",
  "composition-basis",
  "visual-material-only",
]);

const ROLE_PLANS = {
  "data-grid": {
    candidates: ["reui:c-data-grid-20", "coss:p-table-8", "external:dice-ui"],
    quality: "same-capability",
    confidence: "high",
  },
  table: {
    candidates: ["coss:p-table-8", "tremor:block/tables/table-01"],
    quality: "same-capability",
    confidence: "high",
  },
  "app-shell": {
    candidates: ["shadcn:dashboard-01", "shadcn:sidebar-07"],
    quality: "composition-basis",
    confidence: "medium",
  },
  navigation: {
    candidates: ["shadcn:sidebar-07", "aceternity:sidebar"],
    quality: "composition-basis",
    confidence: "medium",
  },
  "auth-login": {
    candidates: ["shadcn:login-01", "tremor:block/logins/login-01"],
    quality: "same-capability",
    confidence: "high",
  },
  faq: {
    candidates: ["shadcn:accordion", "reui:c-accordion-1"],
    quality: "same-capability",
    confidence: "high",
  },
  "empty-state": {
    candidates: ["coss:p-empty-1", "tremor:block/empty-states/empty-state-01"],
    quality: "same-capability",
    confidence: "high",
  },
  "contact-form": {
    candidates: ["coss:p-field-9", "shadcn:field"],
    quality: "composition-basis",
    confidence: "medium",
    compositionFirst: true,
  },
  form: {
    candidates: ["coss:p-field-9", "shadcn:field"],
    quality: "composition-basis",
    confidence: "medium",
  },
  pricing: {
    candidates: ["tremor:block/pricing-sections/pricing-section-01"],
    quality: "same-capability",
    confidence: "high",
  },
  features: {
    candidates: [
      "tremor:block/feature-sections/feature-section-01",
      "aceternity:bento-grid",
    ],
    quality: "composition-basis",
    confidence: "medium",
  },
  "logo-cloud": {
    candidates: ["magic-ui:marquee-logos", "react-bits:LogoLoop"],
    quality: "same-capability",
    confidence: "medium",
  },
  testimonial: {
    candidates: ["shadcn:carousel", "coss:p-card-1", "aceternity:animated-testimonials"],
    quality: "composition-basis",
    confidence: "medium",
  },
  "social-proof": {
    candidates: ["magic-ui:marquee-logos", "aceternity:animated-testimonials"],
    quality: "composition-basis",
    confidence: "low",
    compositionFirst: true,
  },
  hero: {
    candidates: ["aceternity:hero-highlight", "magic-ui:hero-video-dialog"],
    quality: "visual-material-only",
    confidence: "low",
    compositionFirst: true,
  },
  carousel: {
    candidates: ["aceternity:carousel", "react-bits:Carousel"],
    quality: "same-capability",
    confidence: "medium",
  },
  bento: {
    candidates: ["aceternity:bento-grid", "magic-ui:bento-grid"],
    quality: "same-capability",
    confidence: "high",
  },
  background: {
    candidates: [
      "magic-ui:animated-grid-pattern",
      "react-bits:SoftAurora",
      "aceternity:background-beams-with-collision",
    ],
    quality: "visual-material-only",
    confidence: "medium",
  },
  "text-animation": {
    candidates: ["external:motion-primitives", "aceternity:text-generate-effect"],
    quality: "composition-basis",
    confidence: "medium",
  },
  "motion-effect": {
    candidates: ["external:motion-primitives", "external:animate-ui"],
    quality: "composition-basis",
    confidence: "medium",
  },
  kanban: {
    candidates: ["reui:c-kanban-1", "external:kibo-ui", "external:dice-ui"],
    quality: "same-capability",
    confidence: "high",
  },
  gantt: {
    candidates: ["reui:c-gantt-1", "external:kibo-ui"],
    quality: "same-capability",
    confidence: "high",
  },
  "file-upload": {
    candidates: ["reui:c-file-upload-1", "external:dice-ui", "external:kibo-ui"],
    quality: "same-capability",
    confidence: "high",
  },
  editor: {
    candidates: ["external:kibo-ui", "external:dice-ui"],
    quality: "same-capability",
    confidence: "medium",
  },
  "command-palette": {
    candidates: ["coss:p-command-2", "reui:c-command-5"],
    quality: "same-capability",
    confidence: "high",
  },
  filters: {
    candidates: [
      "tremor:block/filterbar/filterbar-01",
      "reui:c-filters-1",
      "coss:p-input-group-23",
    ],
    quality: "same-capability",
    confidence: "high",
  },
  "event-calendar": {
    candidates: ["reui:c-event-calendar-1", "coss:p-date-picker-2"],
    quality: "same-capability",
    confidence: "medium",
  },
  scheduling: {
    candidates: ["reui:c-event-calendar-1", "coss:p-date-picker-2"],
    quality: "composition-basis",
    confidence: "medium",
  },
  "ai-interface": {
    candidates: ["external:ai-elements", "external:kibo-ui"],
    quality: "same-capability",
    confidence: "high",
  },
  analytics: {
    candidates: [
      "tremor:block/kpi-cards/kpi-card-01",
      "tremor:block/chart-compositions/chart-composition-01",
      "shadcn:dashboard-01",
    ],
    quality: "composition-basis",
    confidence: "medium",
  },
  billing: {
    candidates: ["tremor:block/billing-usage/billing-usage-01"],
    quality: "composition-basis",
    confidence: "medium",
  },
  notifications: {
    candidates: ["magic-ui:animated-list"],
    quality: "composition-basis",
    confidence: "medium",
  },
  onboarding: {
    candidates: ["tremor:block/onboarding-feed/onboarding-feed-01"],
    quality: "composition-basis",
    confidence: "medium",
  },
  dialog: {
    candidates: ["reui:c-dialog-1", "coss:p-dialog-1"],
    quality: "same-capability",
    confidence: "high",
  },
  "sheet-drawer": {
    candidates: ["shadcn:sheet", "coss:p-sheet-1", "shadcn:drawer"],
    quality: "same-capability",
    confidence: "high",
  },
  timeline: {
    candidates: ["reui:c-timeline-1", "aceternity:timeline"],
    quality: "same-capability",
    confidence: "medium",
  },
  card: {
    candidates: ["coss:p-card-1", "reui:c-card-8"],
    quality: "composition-basis",
    confidence: "medium",
  },
  list: {
    candidates: ["magic-ui:animated-list"],
    quality: "composition-basis",
    confidence: "low",
    compositionFirst: true,
  },
  ecommerce: {
    candidates: ["coss:p-card-1", "reui:c-card-8"],
    quality: "composition-basis",
    confidence: "low",
    compositionFirst: true,
  },
  template: {
    candidates: [],
    quality: "composition-basis",
    confidence: "low",
    compositionFirst: true,
  },
  blog: {
    candidates: ["coss:p-card-1"],
    quality: "composition-basis",
    confidence: "low",
    compositionFirst: true,
  },
  cta: {
    candidates: [],
    quality: "composition-basis",
    confidence: "low",
    compositionFirst: true,
  },
  footer: {
    candidates: [],
    quality: "composition-basis",
    confidence: "low",
    compositionFirst: true,
  },
  "agent-content": {
    candidates: [],
    quality: "not-ui-equivalent",
    confidence: "low",
    compositionFirst: true,
  },
  unknown: {
    candidates: [],
    quality: "manual-review",
    confidence: "low",
    compositionFirst: true,
  },
};

const OPEN_ICON_CANDIDATES = [
  {
    type: "external-public-source",
    id: "external:lucide-icons",
    label: "Lucide Icons",
    source: "lucide",
    license: "ISC",
    license_verified: true,
    redistribution_restricted: false,
    access_status: "public-source",
    source_cache_status: "not-cached",
    local_path: "",
    match_level: "semantic-library",
    confidence: "medium",
    review_status: "semantic-icon-selection-required",
    url: "https://lucide.dev/icons/",
    source_url: "https://github.com/lucide-icons/lucide",
    reason: "成熟的公开图标集合；按付费图标的具体语义逐个选择，不宣称造型一比一。",
    tradeoff: "不是 ReUI Ultimate 的同一套造型，需按项目线宽、尺寸和光学对齐规范统一。",
  },
  {
    type: "external-public-source",
    id: "external:tabler-icons",
    label: "Tabler Icons",
    source: "tabler-icons",
    license: "MIT",
    license_verified: true,
    redistribution_restricted: false,
    access_status: "public-source",
    source_cache_status: "not-cached",
    local_path: "",
    match_level: "semantic-library",
    confidence: "medium",
    review_status: "semantic-icon-selection-required",
    url: "https://tabler.io/icons",
    source_url: "https://github.com/tabler/tabler-icons",
    reason: "MIT 图标集合覆盖面大，可补 Lucide 缺少的业务语义。",
    tradeoff: "与 Lucide 混用会出现笔画差异；同一页面默认只保留一个图标家族。",
  },
];

function semanticNameText(asset) {
  return [asset.upstream_name, asset.category]
    .filter(Boolean)
    .join(" ")
    .normalize("NFKD")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function roleOf(asset) {
  const category = String(asset.category ?? "").toLowerCase();
  const text = [asset.upstream_name, asset.category]
    .filter(Boolean)
    .join(" ")
    .normalize("NFKD")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ");
  if (category === "pro-category") return "provider-group";
  if (asset.kind === "icon") return "icon";
  if (/agent kit (prompts|recipes|skills)/.test(text)) return "agent-content";
  if (asset.kind === "template") return "template";
  if (/data grid|data table/.test(text)) return "data-grid";
  if (/file manager|file upload|dropzone/.test(text)) return "file-upload";
  if (/kanban/.test(text)) return "kanban";
  if (/gantt/.test(text)) return "gantt";
  if (/prompt input|tool calls?|agent activity|agent approval|agent plan|ai chat|ai usage|\bchat\b/.test(text)) return "ai-interface";
  if (/\bsheet\b|\bdrawer\b/.test(text)) return "sheet-drawer";
  if (/app dialog|\bdialog\b/.test(text)) return "dialog";
  if (/app shell|app sidebar|\bsidebars?\b|\bnavbar\b|\bnavigation\b/.test(text)) return "app-shell";
  if (/\bauth\b|\blogin\b|signup|sign up|sign in/.test(text)) return "auth-login";
  if (/\bfaqs?\b|frequently asked/.test(text)) return "faq";
  if (/empty state/.test(text)) return "empty-state";
  if (/contact/.test(text)) return "contact-form";
  if (/pricing/.test(text)) return "pricing";
  if (/analytics|dashboard|monitoring|\bstats?\b|\bchart\b|kpi/.test(text)) return "analytics";
  if (/testimonial/.test(text)) return "testimonial";
  if (/logo clouds?|\bcompanies\b|\bpress\b/.test(text)) return "logo-cloud";
  if (/social proof/.test(text)) return "social-proof";
  if (/\bfeatures?\b/.test(text)) return "features";
  if (/\bhero\b/.test(text)) return "hero";
  if (/\bfooters?\b/.test(text)) return "footer";
  if (/\bblog\b/.test(text)) return "blog";
  if (/call to action|\bcta\b/.test(text)) return "cta";
  if (/carousel|slideshow/.test(text)) return "carousel";
  if (/\bbento\b/.test(text)) return "bento";
  if (/text animation|text reveal|text swap|letter swap|split text|scroll reveal/.test(text)) return "text-animation";
  if (/shader|aurora|beam|background|dots|noise|waves|tiles/.test(text)) return "background";
  if (/\beditor\b/.test(text)) return "editor";
  if (/command menu|command palette/.test(text)) return "command-palette";
  if (/filter/.test(text)) return "filters";
  if (/event calendar/.test(text)) return "event-calendar";
  if (/calendar|schedule|scheduling/.test(text)) return "scheduling";
  if (/billing|invoice|receipt|checkout|shopping cart/.test(text)) return "billing";
  if (/notification/.test(text)) return "notifications";
  if (/onboarding|wizard/.test(text)) return "onboarding";
  if (/timeline/.test(text)) return "timeline";
  if (/\btable\b/.test(text)) return "table";
  if (/\bforms?\b|settings/.test(text)) return "form";
  if (/\bcards?\b/.test(text)) return "card";
  if (/\blist\b/.test(text)) return "list";
  if (/product|shop|commerce|wishlist|coupon|category/.test(text)) return "ecommerce";
  if (asset.kind === "motion" || asset.source === "react-bits-pro") return "motion-effect";
  return "unknown";
}

function significantWords(asset) {
  return new Set(
    semanticNameText(asset)
      .split(/\s+/)
      .filter((word) => word.length > 2 && !GENERIC_MATCH_WORDS.has(word)),
  );
}

function sharedSignificantWords(left, right) {
  const leftWords = significantWords(left);
  return [...significantWords(right)].filter((word) => leftWords.has(word));
}

function cacheSummary(cacheById, id) {
  const cached = cacheById.get(id);
  return cached
    ? {
        source_cache_status: "source-cached",
        local_path: `source-cache/${cached.local_path}`,
      }
    : { source_cache_status: "not-cached", local_path: "" };
}

function catalogCandidate(asset, plan, cacheById, overrides = {}) {
  const licenseVerified = LICENSE_VERIFIED_SOURCES.has(asset.source);
  const redistributionRestricted = REDISTRIBUTION_RESTRICTED_SOURCES.has(asset.source);
  const matchLevel = overrides.match_level ?? plan.quality;
  const confidence = overrides.confidence ?? plan.confidence;
  const compositionRequired = confidence === "low" || COMPOSITION_MATCH_LEVELS.has(matchLevel);
  const reviewStatus = compositionRequired
    ? licenseVerified
      ? "preview-and-composition-required"
      : "preview-composition-and-license-required"
    : !licenseVerified
      ? "license-check-required"
      : "preview-required";
  return {
    type: "catalog-asset",
    id: asset.id,
    label: asset.display_name || asset.upstream_name,
    source: asset.source,
    license: asset.license,
    license_verified: licenseVerified,
    redistribution_restricted: redistributionRestricted,
    access_status: asset.access_status,
    ...cacheSummary(cacheById, asset.id),
    match_level: matchLevel,
    confidence,
    review_status: reviewStatus,
    url: asset.preview_url,
    source_url: asset.source_url,
    reason:
      overrides.reason ??
      (matchLevel === "same-capability"
        ? "功能类别一致的当前公开源码候选；仍需打开真实预览核对状态和交互细节。"
        : matchLevel === "visual-material-only"
          ? "只替代视觉或动效材料，不等同于完整付费区块。"
          : "可作为免费 primitives/布局基础重新组合，不是一比一付费成品替身。"),
    tradeoff:
      overrides.tradeoff ??
      (redistributionRestricted
        ? "许可证含 Commons Clause：可用于应用，但不可直接销售或再分发组件本身；还需做业务组合与适配。"
        : !licenseVerified
          ? "公开 Free 源码仍需逐项复核品牌条款和嵌入的第三方资产；确认前不进入运行仓。"
          : "视觉、DOM 或底层 primitive 可能不同；必须在真实业务容器并排比较。"),
  };
}

function discoveryCandidate(source) {
  return {
    type: "external-public-source",
    id: `external:${source.id}`,
    label: source.name,
    source: source.id,
    license: source.license,
    license_verified: source.license_verified === true,
    redistribution_restricted: source.redistribution_restricted === true,
    access_status: source.access_status,
    source_cache_status: "not-applicable",
    local_path: "",
    match_level: "collection-selection",
    confidence: "medium",
    review_status: "discovery-component-selection-required",
    url: source.official_url,
    source_url: source.repository_url,
    reason: `${source.role}；官方完整目录已收录，但当前候选仍只指向组件集，还没有为这条付费能力定位具体组件。`,
    tradeoff: `目录已入库并选择性缓存代表源码；使用前仍需定位具体组件并核对该项缓存、依赖与适配成本；${source.compatibility}${source.redistribution_restricted ? "；许可证限制组件本身的销售或再分发" : ""}`,
  };
}

function compositionCandidate(paid, role) {
  return {
    type: "composition",
    id: "composition:project-business-layer",
    label: "用已核验免费 primitives 重组业务组合层",
    source: "project",
    license: "项目自有代码（基础依赖各自遵守原许可证）",
    license_verified: true,
    redistribution_restricted: false,
    access_status: "not-applicable",
    source_cache_status: "not-applicable",
    local_path: "",
    match_level: "project-composition",
    confidence: role === "unknown" || role === "agent-content" ? "low" : "medium",
    review_status: "manual-composition-required",
    url: "agent-workflow.md",
    source_url: "agent-workflow.md",
    reason: `围绕“${paid.display_name || paid.upstream_name}”的 ${role} 功能需求，复用已收录免费 primitives，只实现业务编排和数据适配。`,
    tradeoff: "不能照抄付费源码或受保护设计；需要自行补齐交互状态、可访问性、响应式和回归测试。",
  };
}

function addUnique(target, candidate) {
  if (!candidate || target.some((item) => item.id === candidate.id)) return;
  target.push(candidate);
}

function sameBrandSpecificCandidate(paid, role, publicAssets, cacheById) {
  const freeBrand = PAID_TO_FREE_BRAND[paid.source];
  if (!freeBrand || !["motion-effect", "background", "text-animation", "carousel"].includes(role)) {
    return null;
  }
  const ranked = publicAssets
    .filter((candidate) => candidate.source === freeBrand && roleOf(candidate) === role)
    .map((candidate) => ({ candidate, shared: sharedSignificantWords(paid, candidate) }))
    .filter((item) => item.shared.length > 0)
    .sort(
      (left, right) =>
        right.shared.length - left.shared.length ||
        left.candidate.id.localeCompare(right.candidate.id),
    );
  const best = ranked[0];
  if (!best) return null;
  return catalogCandidate(
    best.candidate,
    { quality: "exact-family", confidence: best.shared.length > 1 ? "high" : "medium" },
    cacheById,
    { reason: `同品牌 Free 且共享具体语义词：${best.shared.join("、")}；优先比较真实效果。` },
  );
}

function paidAssetSummary(asset, role) {
  return {
    id: asset.id,
    source: asset.source,
    upstream_name: asset.upstream_name,
    display_name: asset.display_name,
    description: asset.description,
    kind: asset.kind,
    category: asset.category,
    role,
    record_type: role === "provider-group" ? "provider-group" : "concrete-asset",
    capability_ids: asset.capability_ids,
    preview_url: asset.preview_url,
    source_url: asset.source_url,
    license: asset.license,
    access_status: asset.access_status,
    access_tier: asset.access_tier,
    source_cache_status: asset.source_cache_status,
  };
}

function mappingStatus(alternatives, role) {
  if (role === "icon") return "semantic-selection-required";
  const nonComposition = alternatives.find((candidate) => candidate.type !== "composition");
  if (!nonComposition) return "composition-required";
  if (COMPOSITION_MATCH_LEVELS.has(nonComposition.match_level)) {
    return "composition-required";
  }
  if (!nonComposition.license_verified) return "license-check-required";
  return "free-candidate-found";
}

function rankCandidates(candidates, compositionFirst) {
  const matchPriority = {
    "exact-family": 0,
    "same-capability": 0,
    "collection-selection": 1,
    "composition-basis": 1,
    "visual-material-only": 2,
  };
  const indexed = candidates.map((candidate, index) => ({ candidate, index }));
  const composition = indexed.filter(({ candidate }) => candidate.type === "composition");
  const publicCandidates = indexed
    .filter(({ candidate }) => candidate.type !== "composition")
    .sort(
      (left, right) =>
        (matchPriority[left.candidate.match_level] ?? 3) -
          (matchPriority[right.candidate.match_level] ?? 3) ||
        Number(!left.candidate.license_verified) - Number(!right.candidate.license_verified) ||
        left.index - right.index,
    );
  const ranked = compositionFirst
    ? [...composition, ...publicCandidates]
    : [...publicCandidates, ...composition];
  return ranked.map(({ candidate }) => candidate);
}

function buildMapping(paid, publicAssets, assetsById, externalById, cacheById) {
  const role = roleOf(paid);
  if (role === "icon") {
    return {
      paid_asset: paidAssetSummary(paid, role),
      resolution_status: "semantic-selection-required",
      closest_free_alternatives: [
        ...OPEN_ICON_CANDIDATES,
        compositionCandidate(paid, role),
      ],
      recommendation_note: "先按具体图标语义在 Lucide 查找，再查 Tabler；这不是造型一比一映射。",
    };
  }

  const plan = ROLE_PLANS[role] ?? ROLE_PLANS.unknown;
  const alternatives = [];
  const composition = compositionCandidate(paid, role);
  if (plan.compositionFirst) addUnique(alternatives, composition);
  addUnique(alternatives, sameBrandSpecificCandidate(paid, role, publicAssets, cacheById));

  for (const id of plan.candidates) {
    if (alternatives.length >= 3) break;
    if (id.startsWith("external:")) {
      addUnique(alternatives, externalById.get(id));
      continue;
    }
    const asset = assetsById.get(id);
    if (asset) addUnique(alternatives, catalogCandidate(asset, plan, cacheById));
  }

  addUnique(alternatives, composition);
  const trimmed = rankCandidates(alternatives, plan.compositionFirst === true).slice(0, 3);
  return {
    paid_asset: paidAssetSummary(paid, role),
    resolution_status: mappingStatus(trimmed, role),
    closest_free_alternatives: trimmed,
    recommendation_note:
      role === "agent-content"
        ? "这是 prompt/recipe/skill 内容资产，不得用 UI 组件伪装成同能力替代；只能重新编写自有内容。"
        : "候选的 match_level/confidence 是能力接近程度，不是自动选型；必须打开真实预览并排后再拍板。",
  };
}

function countBy(values) {
  const counts = {};
  for (const value of values) counts[value] = (counts[value] ?? 0) + 1;
  return Object.fromEntries(
    Object.entries(counts).sort(([left], [right]) => left.localeCompare(right)),
  );
}

export function buildFreeAlternatives({ assets, discovery = { sources: [] }, cacheEntries = [] }) {
  const paidRecords = assets
    .filter((asset) => asset.access_status === "paid-source-after-license")
    .sort((left, right) => left.id.localeCompare(right.id));
  const providerGroups = paidRecords.filter((asset) => roleOf(asset) === "provider-group");
  const paidAssets = paidRecords.filter((asset) => roleOf(asset) !== "provider-group");
  const publicAssets = assets.filter(
    (asset) => asset.access_status === "public-source" && CURRENT_PUBLIC_SOURCES.has(asset.source),
  );
  const assetsById = new Map(publicAssets.map((asset) => [asset.id, asset]));
  const externalCandidates = (discovery.sources ?? []).map(discoveryCandidate);
  const externalById = new Map(externalCandidates.map((candidate) => [candidate.id, candidate]));
  const cacheById = new Map(cacheEntries.map((entry) => [entry.asset_id, entry]));
  const mappings = paidAssets.map((paid) =>
    buildMapping(paid, publicAssets, assetsById, externalById, cacheById),
  );
  const resolutionCounts = countBy(mappings.map((mapping) => mapping.resolution_status));

  return {
    schema_version: 2,
    generated_at: null,
    policy: {
      order: [
        "same-capability-license-cleared",
        "same-brand-free-when-specific",
        "composition-basis",
        "project-owned-composition",
      ],
      confidence_rule: "同品牌不是匹配依据；只有角色兼容且存在具体能力/语义证据才可排在组合层前。",
      prohibited: [
        "绕过登录、license key 或会员接口",
        "复制未授权付费源码",
        "把公开 GitHub 仓库自动视为可复制许可证",
        "照抄受保护的成品设计并冒充自有实现",
      ],
      comparison_required: "同能力多候选须展示真实预览、底层、依赖、许可证、置信度与适配成本后再拍板。",
    },
    summary: {
      paid_metadata_records: paidRecords.length,
      concrete_paid_items: paidAssets.length,
      provider_group_records: providerGroups.length,
      mapped_items: mappings.length,
      unresolved_items:
        (resolutionCounts["composition-required"] ?? 0) +
        (resolutionCounts["license-check-required"] ?? 0),
      by_paid_source_records: countBy(paidRecords.map((asset) => asset.source)),
      by_paid_source: countBy(paidAssets.map((asset) => asset.source)),
      by_resolution_status: resolutionCounts,
      first_choice_by_type: countBy(
        mappings.map((mapping) => mapping.closest_free_alternatives[0]?.type ?? "unresolved"),
      ),
      first_choice_by_match: countBy(
        mappings.map((mapping) => mapping.closest_free_alternatives[0]?.match_level ?? "unresolved"),
      ),
    },
    provider_groups: providerGroups.map((asset) => paidAssetSummary(asset, "provider-group")),
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
      statuses: new Map(),
    };
    current.count += 1;
    current.statuses.set(
      mapping.resolution_status,
      (current.statuses.get(mapping.resolution_status) ?? 0) + 1,
    );
    categoryRows.set(key, current);
  }

  const rows = [...categoryRows.values()].sort(
    (left, right) =>
      left.source.localeCompare(right.source) ||
      right.count - left.count ||
      left.category.localeCompare(right.category),
  );
  const direct = output.summary.by_resolution_status["free-candidate-found"] ?? 0;
  const semantic = output.summary.by_resolution_status["semantic-selection-required"] ?? 0;
  const composition = output.summary.by_resolution_status["composition-required"] ?? 0;
  const license = output.summary.by_resolution_status["license-check-required"] ?? 0;

  const lines = [
    "# 付费能力的合法免费替代",
    "",
    "> 生成日期：2026-08-19。完整逐项映射在 `free-alternatives.json` 和离线 HTML 展厅。匹配结果分置信度与处置状态，不把机械有结果写成一比一替代。",
    "",
    "## 覆盖结论",
    "",
    `- 已知付费元数据 **${output.summary.paid_metadata_records.toLocaleString("en-US")}** 条，其中 **${output.summary.provider_group_records}** 条是 Aceternity 分类节点，不是具体资产；实际映射 **${output.summary.mapped_items.toLocaleString("en-US")} / ${output.summary.concrete_paid_items.toLocaleString("en-US")}** 个具体付费能力。`,
    `- 当前处置：直接免费候选 ${direct}；图标语义库选择 ${semantic}；需要免费 primitives 重组 ${composition}；许可证需再次确认 ${license}。`,
    `- “未直接解决” ${output.summary.unresolved_items} 不是漏行，而是没有足够证据宣称存在直接免费替身，必须组合或先核许可证。`,
    "- 不绕过登录、license key、401 或会员接口，不缓存未获授权的付费源码。",
    "",
    "| 付费来源 | 已知付费元数据 | 具体能力 |",
    "|---|---:|---:|",
    ...Object.keys(output.summary.by_paid_source_records).map(
      (source) => `| ${source} | ${output.summary.by_paid_source_records[source].toLocaleString("en-US")} | ${(output.summary.by_paid_source[source] ?? 0).toLocaleString("en-US")} |`,
    ),
    "",
    "## 新增免费候选",
    "",
    "| 候选 | 许可证 | 作用 | 状态 |",
    "|---|---|---|---|",
    ...discovery.sources.map(
      (source) => `| [${source.name}](${source.official_url}) | ${source.license}${source.redistribution_restricted ? "（限制组件本身销售/再分发）" : ""} | ${source.role} | ${source.catalog_status}；${source.source_cache_status}；${source.runtime_install_status} |`,
    ),
    "",
    "## 分类级处置摘要",
    "",
    "| 付费来源 | 分类 | 数量 | 最常见处置 |",
    "|---|---|---:|---|",
    ...rows.map((row) => {
      const [status = "composition-required"] = [...row.statuses.entries()].sort(
        (left, right) => right[1] - left[1] || left[0].localeCompare(right[0]),
      )[0] ?? [];
      return `| ${row.source} | ${row.category} | ${row.count} | ${status} |`;
    }),
    "",
    "## 使用规则",
    "",
    "1. `free-candidate-found` 才表示存在同能力候选；仍需打开真实预览核对，不代表已选中。",
    "2. `composition-required` 表示候选只是 primitives、布局或视觉材料，必须重新组合，不能称一比一替代。",
    "3. `license-check-required` 在逐项确认条款前不得复制；Commons Clause 项可以放进应用，但禁止直接销售或再分发组件本身。",
    "4. prompt/recipe/skill 内容资产与 UI 组件分池，必须重写自有内容，不能用 AI UI 组件冒充替代。",
    "5. 独立业务组合层只实现业务逻辑、状态和数据适配，不照抄付费源码或受保护设计。",
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
  const [capabilities, discovery, cacheManifest] = await Promise.all([
    readFile(CAPABILITIES_URL, "utf8").then(JSON.parse),
    readFile(DISCOVERY_URL, "utf8").then(JSON.parse),
    readFile(CACHE_MANIFEST_URL, "utf8").then(JSON.parse),
  ]);
  const output = buildFreeAlternatives({
    assets: capabilities.assets,
    discovery,
    cacheEntries: cacheManifest.entries,
  });
  output.generated_at = capabilities.generated_at;
  const json = `${JSON.stringify(output, null, 2)}\n`;
  const markdown = markdownFor(output, discovery);

  if (args.has("--check")) {
    const [currentJson, currentMarkdown] = await Promise.all([
      readFile(JSON_OUTPUT_URL, "utf8"),
      readFile(MARKDOWN_OUTPUT_URL, "utf8"),
    ]);
    if (currentJson !== json) throw new Error("free-alternatives.json is stale; run with --write");
    if (currentMarkdown !== markdown) throw new Error("free-alternatives.md is stale; run with --write");
  } else if (args.has("--write")) {
    await Promise.all([
      atomicWrite(JSON_OUTPUT_URL, json),
      atomicWrite(MARKDOWN_OUTPUT_URL, markdown),
    ]);
  }

  console.log(
    JSON.stringify({
      paid_metadata_records: output.summary.paid_metadata_records,
      concrete_paid_items: output.summary.concrete_paid_items,
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
