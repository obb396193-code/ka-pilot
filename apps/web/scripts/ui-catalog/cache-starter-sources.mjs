import { createHash } from "node:crypto";
import {
  mkdir,
  readFile,
  rename,
  stat,
  writeFile,
} from "node:fs/promises";
import { basename, dirname, join, sep } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = new URL("../../../../", import.meta.url);
const STARTER_URL = new URL("docs/frontend/ui-assets/starter-pack.json", ROOT);
const CATALOG_INDEX_URL = new URL("docs/frontend/ui-assets/catalogs/index.json", ROOT);
const CACHE_ROOT_URL = new URL("docs/frontend/ui-assets/source-cache/", ROOT);
const MANIFEST_URL = new URL("docs/frontend/ui-assets/source-cache/manifest.json", ROOT);

const REGISTRY_CONFIG = {
  shadcn: {
    prefixes: [],
    plainNames: ["calendar"],
    baseUrl: "https://ui.shadcn.com/r/styles/new-york-v4/",
  },
  coss: {
    prefixes: ["@coss/"],
    baseUrl: "https://coss.com/ui/r/",
  },
  "coss-origin": {
    prefixes: [],
    plainNames: ["button"],
    baseUrl: "https://coss.com/origin/r/",
  },
  reui: {
    prefixes: ["@reui/"],
    baseUrl: "https://reui.io/r/base-nova/",
  },
  "magic-ui": {
    prefixes: ["@magicui/", "@magic-ui/"],
    baseUrl: "https://magicui.design/r/",
  },
  aceternity: {
    prefixes: ["@aceternity/"],
    baseUrl: "https://ui.aceternity.com/registry/",
  },
  "ai-elements": {
    prefixes: ["@ai-elements/"],
    baseUrl: "https://elements.ai-sdk.dev/api/registry/",
  },
  "kibo-ui": {
    prefixes: ["@kibo-ui/"],
    baseUrl: "https://www.kibo-ui.com/r/",
  },
  "dice-ui": {
    prefixes: ["@dice-ui/", "@diceui/"],
    plainNames: ["data-grid"],
    dependencyUrls: {
      "data-grid": "https://github.com/sadmann7/diceui/tree/main/docs/components/data-grid",
    },
    baseUrl: "https://diceui.com/r/radix-vega/",
  },
  "animate-ui": {
    prefixes: ["@animate-ui/"],
    baseUrl: "https://animate-ui.com/r/",
  },
  "motion-primitives": {
    prefixes: ["@motion-primitives/"],
    baseUrl: "https://raw.githubusercontent.com/ibelick/motion-primitives/main/public/c/",
  },
};

function sha256(input) {
  return createHash("sha256").update(input).digest("hex");
}

function safeSegment(value) {
  return value
    .normalize("NFKD")
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "") || "asset";
}

function toPosix(value) {
  return value.split(sep).join("/");
}

async function writeAtomic(path, content) {
  await mkdir(dirname(path), { recursive: true });
  const temporary = `${path}.tmp-${process.pid}-${Date.now()}`;
  await writeFile(temporary, content);
  await rename(temporary, path);
}

async function fetchBytes(url, fetchImpl = fetch) {
  const response = await fetchImpl(url, {
    headers: {
      Accept: "application/json, text/plain, */*",
      "User-Agent": "toufang-agent-ui-source-cache/1.0",
    },
    redirect: "follow",
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status} for ${url}`);
  }

  return {
    bytes: Buffer.from(await response.arrayBuffer()),
    status: response.status,
    contentType: response.headers.get("content-type") ?? "",
  };
}

export function resolveAssetFetch(sourceUrl) {
  const url = new URL(sourceUrl);

  if (url.hostname !== "github.com") {
    return { kind: "file", url: sourceUrl };
  }

  const parts = url.pathname.split("/").filter(Boolean);
  const [owner, repo, mode, ref, ...pathParts] = parts;
  if (!owner || !repo || !ref || !["blob", "tree"].includes(mode)) {
    return { kind: "file", url: sourceUrl };
  }

  const path = pathParts.join("/");
  if (mode === "blob") {
    return {
      kind: "file",
      url: `https://raw.githubusercontent.com/${owner}/${repo}/${ref}/${path}`,
    };
  }

  return {
    kind: "github-tree",
    owner,
    repo,
    ref,
    prefix: `${path.replace(/\/+$/, "")}/`,
    tree_url: `https://api.github.com/repos/${owner}/${repo}/git/trees/${ref}?recursive=1`,
  };
}

export function extractSameSourceDependencies(source, payload) {
  const config = REGISTRY_CONFIG[source];
  if (!config || !Array.isArray(payload?.registryDependencies)) return [];

  const dependencies = new Map();

  for (const dependency of payload.registryDependencies) {
    if (typeof dependency !== "string") continue;

    if (dependency.startsWith("https://") && dependency.startsWith(config.baseUrl)) {
      const name = basename(new URL(dependency).pathname, ".json");
      dependencies.set(name, { name, url: dependency });
      continue;
    }

    const prefix = config.prefixes.find((candidate) => dependency.startsWith(candidate));
    const name = prefix
      ? dependency.slice(prefix.length)
      : config.plainNames?.includes(dependency)
        ? dependency
        : "";
    if (!name || name.includes("/")) continue;
    dependencies.set(name, {
      name,
      url: config.dependencyUrls?.[name] ?? `${config.baseUrl}${name}.json`,
    });
  }

  return [...dependencies.values()].sort((a, b) => a.name.localeCompare(b.name));
}

function assertPublicSource(asset) {
  if (asset?.access_status !== "public-source") {
    throw new Error(`${asset?.source ?? "unknown"}:${asset?.upstream_name ?? "unknown"} must be public-source`);
  }
}

export async function cacheRegistryPayload({
  asset,
  rootOrDependency,
  cacheRoot,
  fetchImpl = fetch,
  fetchedAt = new Date().toISOString(),
}) {
  assertPublicSource(asset);
  const { bytes, status, contentType } = await fetchBytes(asset.source_url, fetchImpl);
  let payload;
  try {
    payload = JSON.parse(bytes.toString("utf8"));
  } catch {
    throw new Error(`Invalid Registry JSON for ${asset.source}:${asset.upstream_name}`);
  }

  const localPath = `${safeSegment(asset.source)}/${safeSegment(asset.upstream_name)}.json`;
  await writeAtomic(join(cacheRoot, localPath), bytes);

  return {
    asset_id: `${asset.source}:${asset.upstream_name}`,
    source: asset.source,
    upstream_name: asset.upstream_name,
    root_or_dependency: rootOrDependency,
    source_url: asset.source_url,
    resolved_url: asset.source_url,
    license: asset.license ?? "",
    license_scope: asset.license_scope ?? "",
    fetched_at: fetchedAt,
    http_status: status,
    content_type: contentType,
    sha256: sha256(bytes),
    hash_scope: "payload",
    local_path: localPath,
    files_in_payload: Array.isArray(payload.files) ? payload.files.length : 0,
    payload_file_paths: Array.isArray(payload.files)
      ? payload.files.map((file) => file.path).filter(Boolean).sort()
      : [],
    registry_dependencies: extractSameSourceDependencies(asset.source, payload),
    cached_files: [],
    cache_status: "cached",
  };
}

async function cacheFilePayload({
  asset,
  rootOrDependency,
  resolvedUrl,
  cacheRoot,
  fetchImpl = fetch,
  fetchedAt = new Date().toISOString(),
}) {
  assertPublicSource(asset);
  const { bytes, status, contentType } = await fetchBytes(resolvedUrl, fetchImpl);
  const sourceBasename = basename(new URL(resolvedUrl).pathname) || `${safeSegment(asset.upstream_name)}.txt`;
  const localPath = `${safeSegment(asset.source)}/${safeSegment(asset.upstream_name)}/${safeSegment(sourceBasename)}`;
  await writeAtomic(join(cacheRoot, localPath), bytes);

  return {
    asset_id: `${asset.source}:${asset.upstream_name}`,
    source: asset.source,
    upstream_name: asset.upstream_name,
    root_or_dependency: rootOrDependency,
    source_url: asset.source_url,
    resolved_url: resolvedUrl,
    license: asset.license ?? "",
    license_scope: asset.license_scope ?? "",
    fetched_at: fetchedAt,
    http_status: status,
    content_type: contentType,
    sha256: sha256(bytes),
    hash_scope: "payload",
    local_path: localPath,
    files_in_payload: 1,
    payload_file_paths: [sourceBasename],
    registry_dependencies: [],
    cached_files: [
      {
        path: localPath,
        source_path: new URL(resolvedUrl).pathname,
        sha256: sha256(bytes),
        bytes: bytes.length,
      },
    ],
    cache_status: "cached",
  };
}

async function fetchGitHubTree(resolution, fetchImpl, treeCache) {
  if (!treeCache.has(resolution.tree_url)) {
    const promise = fetchBytes(resolution.tree_url, fetchImpl).then(({ bytes }) => {
      const payload = JSON.parse(bytes.toString("utf8"));
      if (!Array.isArray(payload.tree)) throw new Error(`Invalid Git tree ${resolution.tree_url}`);
      return payload.tree;
    });
    treeCache.set(resolution.tree_url, promise);
  }
  return treeCache.get(resolution.tree_url);
}

async function mapLimit(values, limit, mapper) {
  const output = new Array(values.length);
  let cursor = 0;

  async function worker() {
    while (cursor < values.length) {
      const index = cursor;
      cursor += 1;
      output[index] = await mapper(values[index], index);
    }
  }

  await Promise.all(Array.from({ length: Math.min(limit, values.length) }, () => worker()));
  return output;
}

async function cacheGitHubTree({
  asset,
  rootOrDependency,
  resolution,
  cacheRoot,
  fetchImpl = fetch,
  treeCache = new Map(),
  fetchedAt = new Date().toISOString(),
}) {
  assertPublicSource(asset);
  const tree = await fetchGitHubTree(resolution, fetchImpl, treeCache);
  const blobs = tree
    .filter((entry) => entry.type === "blob" && entry.path.startsWith(resolution.prefix))
    .sort((a, b) => a.path.localeCompare(b.path));

  if (blobs.length === 0) {
    throw new Error(`No source files found under ${asset.source_url}`);
  }

  const assetDirectory = `${safeSegment(asset.source)}/${safeSegment(asset.upstream_name)}`;
  const files = await mapLimit(blobs, 6, async (blob) => {
    const relativePath = blob.path.slice(resolution.prefix.length);
    const rawUrl = `https://raw.githubusercontent.com/${resolution.owner}/${resolution.repo}/${resolution.ref}/${blob.path}`;
    const { bytes, status, contentType } = await fetchBytes(rawUrl, fetchImpl);
    const localPath = toPosix(join(assetDirectory, relativePath));
    await writeAtomic(join(cacheRoot, localPath), bytes);
    return {
      path: localPath,
      source_path: blob.path,
      resolved_url: rawUrl,
      http_status: status,
      content_type: contentType,
      sha256: sha256(bytes),
      bytes: bytes.length,
    };
  });

  const combinedHash = sha256(
    files.map((file) => `${file.source_path}\0${file.sha256}`).join("\n"),
  );

  return {
    asset_id: `${asset.source}:${asset.upstream_name}`,
    source: asset.source,
    upstream_name: asset.upstream_name,
    root_or_dependency: rootOrDependency,
    source_url: asset.source_url,
    resolved_url: resolution.tree_url,
    license: asset.license ?? "",
    license_scope: asset.license_scope ?? "",
    fetched_at: fetchedAt,
    http_status: 200,
    content_type: "github-tree",
    sha256: combinedHash,
    hash_scope: "file-set",
    local_path: `${assetDirectory}/`,
    files_in_payload: files.length,
    payload_file_paths: files.map((file) => file.source_path),
    registry_dependencies: [],
    cached_files: files,
    cache_status: "cached",
  };
}

async function cacheAsset({ asset, rootOrDependency, cacheRoot, fetchImpl, treeCache, fetchedAt }) {
  const resolution = resolveAssetFetch(asset.source_url);
  if (resolution.kind === "github-tree") {
    return cacheGitHubTree({
      asset,
      rootOrDependency,
      resolution,
      cacheRoot,
      fetchImpl,
      treeCache,
      fetchedAt,
    });
  }

  if (new URL(resolution.url).pathname.endsWith(".json")) {
    return cacheRegistryPayload({
      asset: { ...asset, source_url: resolution.url },
      rootOrDependency,
      cacheRoot,
      fetchImpl,
      fetchedAt,
    });
  }

  return cacheFilePayload({
    asset,
    rootOrDependency,
    resolvedUrl: resolution.url,
    cacheRoot,
    fetchImpl,
    fetchedAt,
  });
}

export async function verifyCachedEntry(entry, cacheRoot) {
  try {
    if (entry.hash_scope === "file-set") {
      const verified = [];
      for (const file of entry.cached_files) {
        const bytes = await readFile(join(cacheRoot, file.path));
        const actual = sha256(bytes);
        if (actual !== file.sha256) {
          return { ok: false, error: `sha256 mismatch for ${file.path}` };
        }
        verified.push(`${file.source_path}\0${actual}`);
      }
      const combined = sha256(verified.join("\n"));
      if (combined !== entry.sha256) {
        return { ok: false, error: `sha256 mismatch for ${entry.local_path}` };
      }
      return { ok: true, error: "" };
    }

    const bytes = await readFile(join(cacheRoot, entry.local_path));
    if (sha256(bytes) !== entry.sha256) {
      return { ok: false, error: `sha256 mismatch for ${entry.local_path}` };
    }
    return { ok: true, error: "" };
  } catch (error) {
    return { ok: false, error: error.message };
  }
}

async function loadCatalogItems() {
  const index = JSON.parse(await readFile(CATALOG_INDEX_URL, "utf8"));
  const items = new Map();

  for (const source of index.sources) {
    const catalogUrl = new URL(`docs/frontend/ui-assets/catalogs/${source.file}`, ROOT);
    const catalog = JSON.parse(await readFile(catalogUrl, "utf8"));
    for (const item of catalog.items) {
      items.set(`${item.source}:${item.upstream_name}`, item);
    }
  }

  return items;
}

function summarize(entries) {
  const bySource = {};
  for (const entry of entries) {
    bySource[entry.source] ??= { entries: 0, files: 0, roots: 0, dependencies: 0 };
    bySource[entry.source].entries += 1;
    bySource[entry.source].files += entry.cached_files?.length || 1;
    bySource[entry.source][entry.root_or_dependency === "root" ? "roots" : "dependencies"] += 1;
  }
  return bySource;
}

async function buildManifest({ fetchImpl = fetch } = {}) {
  const starter = JSON.parse(await readFile(STARTER_URL, "utf8"));
  const catalogItems = await loadCatalogItems();
  const cacheRoot = fileURLToPath(CACHE_ROOT_URL);
  const fetchedAt = new Date().toISOString();
  const treeCache = new Map();
  const entries = [];
  const failures = [];
  const queuedDependencies = [];
  const visited = new Set();

  for (const root of starter.roots) {
    const asset = catalogItems.get(root.asset_id);
    if (!asset) {
      failures.push({ asset_id: root.asset_id, error: "missing catalog item" });
      continue;
    }

    try {
      const cacheAssetInput = root.source_url_override
        ? { ...asset, source_url: root.source_url_override }
        : asset;
      const entry = await cacheAsset({
        asset: cacheAssetInput,
        rootOrDependency: "root",
        cacheRoot,
        fetchImpl,
        treeCache,
        fetchedAt,
      });
      entries.push(entry);
      visited.add(root.asset_id);
      for (const dependency of entry.registry_dependencies) {
        queuedDependencies.push({ parent: entry.asset_id, source: cacheAssetInput.source, ...dependency });
      }
      console.log(`${entry.asset_id}: cached (${entry.files_in_payload} source files)`);
    } catch (error) {
      failures.push({ asset_id: root.asset_id, error: error.message });
      console.error(`${root.asset_id}: FAILED - ${error.message}`);
    }
  }

  while (queuedDependencies.length > 0) {
    const dependency = queuedDependencies.shift();
    const assetId = `${dependency.source}:${dependency.name}`;
    if (visited.has(assetId)) continue;
    visited.add(assetId);

    const catalogItem = catalogItems.get(assetId);
    const asset = catalogItem ?? {
      source: dependency.source,
      upstream_name: dependency.name,
      source_url: dependency.url,
      access_status: "public-source",
      license: entries.find((entry) => entry.source === dependency.source)?.license ?? "",
      license_scope: entries.find((entry) => entry.source === dependency.source)?.license_scope ?? "",
    };

    if (asset.access_status !== "public-source") {
      failures.push({ asset_id: assetId, error: `dependency is ${asset.access_status}` });
      continue;
    }

    try {
      const entry = await cacheAsset({
        asset: { ...asset, source_url: dependency.url },
        rootOrDependency: "dependency",
        cacheRoot,
        fetchImpl,
        treeCache,
        fetchedAt,
      });
      entry.required_by = [dependency.parent];
      entries.push(entry);
      for (const child of entry.registry_dependencies) {
        queuedDependencies.push({ parent: entry.asset_id, source: asset.source, ...child });
      }
      console.log(`${entry.asset_id}: cached dependency (${entry.files_in_payload} source files)`);
    } catch (error) {
      failures.push({ asset_id: assetId, error: error.message, required_by: dependency.parent });
      console.error(`${assetId}: FAILED dependency - ${error.message}`);
    }
  }

  entries.sort((a, b) => a.asset_id.localeCompare(b.asset_id));
  const manifest = {
    schema_version: 1,
    generated_at: fetchedAt,
    strategy: starter.strategy,
    runtime_installation: "none-cache-only",
    root_asset_count: starter.roots.length,
    cached_entry_count: entries.length,
    cached_root_count: entries.filter((entry) => entry.root_or_dependency === "root").length,
    cached_dependency_count: entries.filter((entry) => entry.root_or_dependency === "dependency").length,
    cached_file_count: entries.reduce(
      (sum, entry) => sum + (entry.cached_files?.length || 1),
      0,
    ),
    by_source: summarize(entries),
    failures,
    entries,
  };

  await writeAtomic(fileURLToPath(MANIFEST_URL), `${JSON.stringify(manifest, null, 2)}\n`);
  return manifest;
}

async function checkManifest() {
  const cacheRoot = fileURLToPath(CACHE_ROOT_URL);
  const manifest = JSON.parse(await readFile(MANIFEST_URL, "utf8"));
  const starter = JSON.parse(await readFile(STARTER_URL, "utf8"));
  const errors = [];

  if (manifest.root_asset_count !== starter.roots.length) {
    errors.push(`root count ${manifest.root_asset_count} != ${starter.roots.length}`);
  }
  if (manifest.failures.length > 0) {
    errors.push(`${manifest.failures.length} download failures remain`);
  }

  for (const entry of manifest.entries) {
    const result = await verifyCachedEntry(entry, cacheRoot);
    if (!result.ok) errors.push(`${entry.asset_id}: ${result.error}`);
  }

  const expectedRoots = new Set(starter.roots.map((root) => root.asset_id));
  const actualRoots = new Set(
    manifest.entries
      .filter((entry) => entry.root_or_dependency === "root")
      .map((entry) => entry.asset_id),
  );
  for (const assetId of expectedRoots) {
    if (!actualRoots.has(assetId)) errors.push(`missing cached root ${assetId}`);
  }

  try {
    await stat(fileURLToPath(MANIFEST_URL));
  } catch (error) {
    errors.push(error.message);
  }

  if (errors.length > 0) throw new Error(errors.join("\n"));
  return manifest;
}

async function main() {
  if (process.argv.includes("--write")) {
    const manifest = await buildManifest();
    console.log(
      JSON.stringify({
        roots: manifest.cached_root_count,
        dependencies: manifest.cached_dependency_count,
        files: manifest.cached_file_count,
        failures: manifest.failures.length,
        by_source: manifest.by_source,
      }),
    );
    if (manifest.failures.length > 0) process.exitCode = 1;
    return;
  }

  if (process.argv.includes("--check")) {
    const manifest = await checkManifest();
    console.log(
      JSON.stringify({
        roots: manifest.cached_root_count,
        dependencies: manifest.cached_dependency_count,
        files: manifest.cached_file_count,
        verified: true,
      }),
    );
    return;
  }

  console.log("Usage: node cache-starter-sources.mjs --write|--check");
}

if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href) {
  main().catch((error) => {
    console.error(error.stack ?? error.message);
    process.exitCode = 1;
  });
}
