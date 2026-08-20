import { createHash } from "node:crypto";
import { mkdir, readFile, readdir, rename, writeFile } from "node:fs/promises";
import { relative } from "node:path";
import process from "node:process";
import { fileURLToPath, pathToFileURL } from "node:url";

const WEB_ROOT = new URL("../../", import.meta.url);
const REPOSITORY_ROOT = new URL("../../", WEB_ROOT);
const CATALOG_ROOT = new URL("docs/frontend/ui-assets/catalogs/", REPOSITORY_ROOT);
const JSON_OUTPUT = new URL("docs/frontend/ui-assets/source-download-manifest.json", REPOSITORY_ROOT);
const MARKDOWN_OUTPUT = new URL("docs/frontend/ui-assets/source-download-status.md", REPOSITORY_ROOT);
const STARTER_CACHE_MANIFEST = new URL("docs/frontend/ui-assets/source-cache/manifest.json", REPOSITORY_ROOT);

const THIRD_PARTY_DIRECTORIES = [
  "coss",
  "reui",
  "tremor",
  "aceternity",
  "magic-ui",
  "react-bits",
  "ai-elements",
  "kibo-ui",
  "dice-ui",
  "animate-ui",
  "motion-primitives",
];
const RELEVANT_PACKAGES = [
  "shadcn",
  "radix-ui",
  "@base-ui-components/react",
  "@base-ui/react",
  "@tremor/react",
  "recharts",
  "echarts",
  "ai",
  "motion",
];

function sha256(value) {
  return `sha256:${createHash("sha256").update(value).digest("hex")}`;
}

export function buildRuntimeManifest({
  generatedAt,
  catalogIndex,
  componentsConfig,
  packageJson,
  componentFiles,
  sourceTexts,
  thirdPartyFiles,
  shadcnNames,
  starterCacheManifest = {
    cached_entry_count: 0,
    cached_root_count: 0,
    cached_dependency_count: 0,
    cached_file_count: 0,
    failures: [],
    by_source: {},
  },
}) {
  const allSource = sourceTexts.join("\n");
  const dependencies = { ...(packageJson.dependencies ?? {}), ...(packageJson.devDependencies ?? {}) };
  const components = componentFiles.map((file) => {
    const escapedName = file.name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const importCount = [...allSource.matchAll(new RegExp(`@/components/ui/${escapedName}(?:["']|$)`, "g"))].length;
    return {
      name: file.name,
      path: file.path,
      sha256: file.sha256,
      runtime_import_count: importCount,
      runtime_status: "present-local-copy",
      inferred_source: "shadcn/ui",
      catalog_identity: shadcnNames.has(file.name) ? `shadcn:${file.name}` : "",
      provenance_status: "inferred-from-components.json-and-path",
      exact_upstream_ref: "",
      exact_upstream_source_hash: "",
      note: "Local copy-owned source exists, but no install manifest proves which exact upstream payload/ref produced it.",
    };
  });
  const thirdPartySourceFileCount = Object.values(thirdPartyFiles)
    .reduce((sum, files) => sum + files.length, 0);

  return {
    schema_version: 1,
    generated_at: generatedAt,
    runtime_root: "apps/web",
    catalog_snapshot: {
      item_count: catalogIndex.total_items,
      source_cached_item_count: catalogIndex.counts.by_source_cache_status["source-cached"] ?? 0,
      not_cached_item_count: catalogIndex.counts.by_source_cache_status["not-cached"] ?? 0,
      note: "Catalog JSON stores discovery metadata; it is not a source mirror.",
    },
    summary: {
      runtime_local_ui_source_files: components.length,
      runtime_imported_local_ui_files: components.filter((item) => item.runtime_import_count > 0).length,
      provenance_verified_files: components.filter((item) => item.provenance_status === "verified").length,
      provenance_inferred_files: components.filter((item) => item.provenance_status.startsWith("inferred")).length,
      selected_third_party_source_files: thirdPartySourceFileCount,
      fully_cached_catalog_items: catalogIndex.counts.by_source_cache_status["source-cached"] ?? 0,
      starter_cached_entries: starterCacheManifest.cached_entry_count ?? 0,
      starter_cached_roots: starterCacheManifest.cached_root_count ?? 0,
      starter_cached_dependencies: starterCacheManifest.cached_dependency_count ?? 0,
      starter_cached_files: starterCacheManifest.cached_file_count ?? 0,
      starter_cache_failures: starterCacheManifest.failures?.length ?? 0,
    },
    components_config: {
      style: componentsConfig.style ?? "",
      configured_registries: Object.keys(componentsConfig.registries ?? {}),
    },
    relevant_runtime_packages: Object.fromEntries(
      RELEVANT_PACKAGES.map((name) => [name, dependencies[name] ?? null]),
    ),
    local_ui_components: components,
    selected_third_party_directories: Object.fromEntries(
      THIRD_PARTY_DIRECTORIES.map((name) => [name, thirdPartyFiles[name] ?? []]),
    ),
    isolated_starter_cache: {
      runtime_imported: false,
      entries: starterCacheManifest.cached_entry_count ?? 0,
      roots: starterCacheManifest.cached_root_count ?? 0,
      dependencies: starterCacheManifest.cached_dependency_count ?? 0,
      source_files: starterCacheManifest.cached_file_count ?? 0,
      failures: starterCacheManifest.failures ?? [],
      by_source: starterCacheManifest.by_source ?? {},
      manifest_path: "docs/frontend/ui-assets/source-cache/manifest.json",
      note: "Official public source is cached with hashes for later selection; nothing in this cache is installed into apps/web.",
    },
    conclusion: {
      catalog_source_downloaded: false,
      shadcn_style_local_source_present: components.length > 0,
      third_party_selected_source_present: thirdPartySourceFileCount > 0,
      starter_source_cache_present: (starterCacheManifest.cached_entry_count ?? 0) > 0,
      next_rule: "When an asset is approved, inspect/download its exact official item payload, store the upstream URL/ref/hash/local path, then mark it vendored or adapted.",
    },
  };
}

export function runtimeManifestMarkdown(manifest) {
  const summary = manifest.summary;
  const lines = [
    "# 前端 UI 源码下载与运行时状态",
    "",
    `> 核验快照：${manifest.generated_at}`,
    "",
    "## 结论",
    "",
    `- ${manifest.catalog_snapshot.item_count.toLocaleString("en-US")} 条目录均是元数据；完整 upstream source cache 为 ${summary.fully_cached_catalog_items}。`,
    `- 运行仓已有 ${summary.runtime_local_ui_source_files} 个 \`components/ui/*.tsx\` 本地源码文件，其中 ${summary.runtime_imported_local_ui_files} 个被当前源码显式引用。`,
    `- 这些文件的 shadcn 来源只能由 \`components.json.style=${manifest.components_config.style}\` 与路径推断；精确 upstream ref/hash 已验证 0 个。`,
    `- 11 个第三方来源隔离目录当前合计 ${summary.selected_third_party_source_files} 个源码文件。`,
    `- 独立 starter cache 已保存 ${summary.starter_cached_roots} 个根资产、${summary.starter_cached_dependencies} 个依赖、${summary.starter_cached_entries} 个缓存条目、${summary.starter_cached_files} 份源码文件；失败 ${summary.starter_cache_failures}。这些文件尚未安装进运行仓。`,
    ...(["shadcn", "coss-origin", "tremor-legacy", "magic-ui-pro"].every((source) => manifest.isolated_starter_cache.by_source[source]) && !manifest.isolated_starter_cache.by_source["react-bits-pro"]
      ? ["- 17 库比较墙已补充 shadcn 当前 Registry、coss Origin、Tremor legacy 官方包和 Magic UI 官方公开 MIT template；React Bits Pro 仍为 0 份源码。"]
      : []),
    "",
    "所以不能说“所有目录源码已下载”。准确说法是：目录全量可查；高频公开源码已在隔离缓存中可复核；现有 shadcn 风格本地源码可运行但 provenance 待补；第三方缓存尚未接入运行仓。",
    "",
    "## 隔离 Starter Cache",
    "",
    "| 来源 | 根资产 | 依赖 | 缓存条目 | 源码文件 |",
    "|---|---:|---:|---:|---:|",
  ];
  for (const [source, counts] of Object.entries(manifest.isolated_starter_cache.by_source)) {
    lines.push(`| ${source} | ${counts.roots} | ${counts.dependencies} | ${counts.entries} | ${counts.files} |`);
  }
  lines.push(
    "",
    "缓存位置：`docs/frontend/ui-assets/source-cache/`。这里的 Registry JSON 包含实际 `files[].content`；GitHub 资产保存 raw 文件并逐文件记录 SHA-256。缓存不等于选型拍板或运行时接入。",
    "",
    "## 本地 UI 源码",
    "",
    "| 文件 | 当前引用数 | 目录映射 | provenance |",
    "|---|---:|---|---|",
  );
  for (const item of manifest.local_ui_components) {
    lines.push(`| \`${item.path}\` | ${item.runtime_import_count} | ${item.catalog_identity || "未映射"} | ${item.provenance_status} |`);
  }
  lines.push(
    "",
    "## 使用某项时的下载规范",
    "",
    "1. 先从 `capabilities.json` 找候选，打开真实 preview 并做多来源对比。",
    "2. 用官方 Registry view/item URL inspect 源码和依赖；付费项必须先取得合法 license key。",
    "3. 只下载被批准的 item 与必要依赖，不镜像整个付费包。",
    "4. 在 manifest 登记官方 URL、variant、HTTP/访问状态、源码 SHA-256、本地路径和改动说明。",
    "5. 未登记 exact ref/hash 的本地文件只能标 inferred，不能标 verified。",
  );
  return `${lines.join("\n")}\n`;
}

async function listFiles(url, matcher = () => true) {
  try {
    const entries = await readdir(url, { withFileTypes: true });
    const result = [];
    for (const entry of entries) {
      const child = new URL(`${entry.name}${entry.isDirectory() ? "/" : ""}`, url);
      if (entry.isDirectory()) result.push(...await listFiles(child, matcher));
      else if (matcher(entry.name)) result.push(child);
    }
    return result;
  } catch {
    return [];
  }
}

async function atomicWrite(url, value) {
  await mkdir(new URL("./", url), { recursive: true });
  const temporary = new URL(url);
  temporary.pathname = `${temporary.pathname}.tmp`;
  await writeFile(temporary, value, "utf8");
  await rename(temporary, url);
}

async function buildFromWorkspace() {
  const [catalogIndex, shadcnCatalog, componentsConfig, packageJson, starterCacheManifest] = await Promise.all([
    readFile(new URL("index.json", CATALOG_ROOT), "utf8").then(JSON.parse),
    readFile(new URL("shadcn.json", CATALOG_ROOT), "utf8").then(JSON.parse),
    readFile(new URL("components.json", WEB_ROOT), "utf8").then(JSON.parse),
    readFile(new URL("package.json", WEB_ROOT), "utf8").then(JSON.parse),
    readFile(STARTER_CACHE_MANIFEST, "utf8").then(JSON.parse).catch(() => ({
      cached_entry_count: 0,
      cached_root_count: 0,
      cached_dependency_count: 0,
      cached_file_count: 0,
      failures: [],
      by_source: {},
    })),
  ]);
  const componentUrls = await listFiles(new URL("components/ui/", WEB_ROOT), (name) => name.endsWith(".tsx"));
  const componentFiles = await Promise.all(componentUrls.map(async (url) => {
    const content = await readFile(url, "utf8");
    return {
      name: url.pathname.split("/").at(-1).replace(/\.tsx$/, ""),
      path: relative(fileURLToPath(WEB_ROOT), fileURLToPath(url)),
      sha256: sha256(content),
    };
  }));
  componentFiles.sort((a, b) => a.path.localeCompare(b.path));
  const sourceUrls = [
    ...await listFiles(new URL("app/", WEB_ROOT), (name) => /\.(?:ts|tsx)$/.test(name)),
    ...await listFiles(new URL("components/", WEB_ROOT), (name) => /\.(?:ts|tsx)$/.test(name)),
  ];
  const sourceTexts = await Promise.all(sourceUrls.map((url) => readFile(url, "utf8")));
  const thirdPartyFiles = Object.fromEntries(await Promise.all(THIRD_PARTY_DIRECTORIES.map(async (name) => {
    const urls = await listFiles(new URL(`components/${name}/`, WEB_ROOT), (file) => /\.(?:ts|tsx)$/.test(file));
    return [name, urls.map((url) => relative(fileURLToPath(WEB_ROOT), fileURLToPath(url))).sort()];
  })));
  return buildRuntimeManifest({
    generatedAt: catalogIndex.fetched_at,
    catalogIndex,
    componentsConfig,
    packageJson,
    componentFiles,
    sourceTexts,
    thirdPartyFiles,
    shadcnNames: new Set(shadcnCatalog.items.map((item) => item.upstream_name)),
    starterCacheManifest,
  });
}

async function main() {
  const manifest = await buildFromWorkspace();
  const json = `${JSON.stringify(manifest, null, 2)}\n`;
  const markdown = runtimeManifestMarkdown(manifest);
  if (process.argv.includes("--write")) {
    await atomicWrite(JSON_OUTPUT, json);
    await atomicWrite(MARKDOWN_OUTPUT, markdown);
  } else if (process.argv.includes("--check")) {
    if (await readFile(JSON_OUTPUT, "utf8") !== json) throw new Error("source-download-manifest.json is stale");
    if (await readFile(MARKDOWN_OUTPUT, "utf8") !== markdown) throw new Error("source-download-status.md is stale");
  }
  console.log(JSON.stringify(manifest.summary));
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
