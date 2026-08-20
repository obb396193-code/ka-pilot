#!/usr/bin/env node

import {createHash} from "node:crypto";
import {mkdir, mkdtemp, readFile, rename, rm, stat, writeFile} from "node:fs/promises";
import {tmpdir} from "node:os";
import path from "node:path";
import {spawnSync} from "node:child_process";
import {fileURLToPath} from "node:url";

import {redactCredentialText, sanitizeValue} from "./crawl-kuaishou-mapi-docs.mjs";

const USER_AGENT = "KA-Knowledge-Research/1.0 (+public-official-doc-archive)";
const OCEAN_SITE = "https://open.oceanengine.com";
const OCEAN_LABEL_TREE = `${OCEAN_SITE}/skiff/api/doc/client/label/tree/get/`;
const OCEAN_DOC_TREE = `${OCEAN_SITE}/skiff/api/doc/client/tree/get/`;
const OCEAN_DOC_DETAIL = `${OCEAN_SITE}/skiff/api/doc/client/node/get/`;
const OCEAN_LABEL_TYPES = ["BUSINESS", "LASTEST_UPDATES"];
const TENCENT_SITE_ID = "3515798";
const TENCENT_SITE = `https://s.apifox.cn/apidoc/docs-site/${TENCENT_SITE_ID}`;
const TENCENT_OFFICIAL_ENTRY = "https://developers.e.qq.com/docs";
const TENCENT_KNOWN_ENDPOINT_CONFLICTS = {
  "api-121814565": {
    observed_endpoint: "/v1.3/barrage/get",
    corrected_endpoint: "/v1.3/barrage_recommend/get",
    official_evidence_url: "https://developers.e.qq.com/docs/api/business_assets/barrage/barrage_recommend_get",
    reason: "公开镜像将运营推荐弹幕路径写成普通弹幕路径；腾讯广告官方原站明确为 barrage_recommend/get",
  },
};

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchText(url, {attempts = 4} = {}) {
  let lastError;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const response = await fetch(url, {
        redirect: "follow",
        headers: {Accept: "text/plain,text/markdown,text/html,application/json", "User-Agent": USER_AGENT},
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return await response.text();
    } catch (error) {
      lastError = error;
      if (attempt < attempts) await delay(400 * (2 ** (attempt - 1)));
    }
  }
  throw lastError;
}

async function fetchOfficialJson(url) {
  const payload = JSON.parse(await fetchText(url));
  if (payload.code !== 0) throw new Error(`official API code=${payload.code}: ${payload.msg || "unknown"}`);
  return payload.data;
}

function appendQuery(base, values) {
  const url = new URL(base);
  for (const [key, value] of Object.entries(values)) url.searchParams.set(key, String(value));
  return url.toString();
}

async function mapLimit(items, limit, worker) {
  const results = new Array(items.length);
  let cursor = 0;
  async function run() {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      results[index] = await worker(items[index], index);
    }
  }
  await Promise.all(Array.from({length: Math.min(limit, items.length)}, run));
  return results;
}

export function flattenOceanLabels(groups, {treeType = "BUSINESS"} = {}) {
  const labels = [];
  function visit(node, parents = [], ancestorHidden = false) {
    const next = [...parents, node.name].filter(Boolean);
    const hiddenDirect = Boolean(node.hidden);
    const hiddenEffective = ancestorHidden || hiddenDirect;
    if (node.identify_key && node.id) {
      labels.push({
        label_id: Number(node.id),
        identify_key: node.identify_key,
        label_path: next,
        hidden_direct: hiddenDirect,
        hidden_effective: hiddenEffective,
        is_leaf: (node.children || []).length === 0,
        source_tree_type: treeType,
        description: node.description || "",
        full_name: node.full_name || next.join(" / "),
      });
    }
    for (const child of node.children || []) visit(child, next, hiddenEffective);
  }
  for (const group of groups || []) visit(group);
  return labels.sort((a, b) => a.label_id - b.label_id);
}

export function mergeOceanLabels(labelRows) {
  const merged = new Map();
  for (const label of labelRows || []) {
    const key = `${label.label_id}:${label.identify_key}`;
    const current = merged.get(key);
    if (!current) {
      merged.set(key, {...label, source_tree_types: [label.source_tree_type]});
      continue;
    }
    if (!current.source_tree_types.includes(label.source_tree_type)) current.source_tree_types.push(label.source_tree_type);
    current.hidden_direct ||= label.hidden_direct;
    current.hidden_effective ||= label.hidden_effective;
    current.is_leaf &&= label.is_leaf;
  }
  return [...merged.values()].sort((a, b) => a.label_id - b.label_id);
}

export function flattenOceanDocuments(nodes, label, parents = [], rows = []) {
  for (const node of nodes || []) {
    const next = [...parents, node.title].filter(Boolean);
    if (node.doc_id) {
      rows.push({
        document_id: String(node.doc_id),
        title: node.title || "",
        doc_path: next,
        label_id: label.label_id,
        label_path: label.label_path,
        label_hidden_direct: label.hidden_direct,
        label_hidden_effective: label.hidden_effective,
        identify_key: label.identify_key,
        going_offline: Boolean(node.going_offline),
        is_new: Boolean(node.is_new),
        menu_type: node.type || null,
      });
    }
    flattenOceanDocuments(node.child_docs, label, next, rows);
  }
  return rows;
}

export function extractOceanEndpointCandidates(detail) {
  const candidates = [];
  const add = (endpoint, evidence) => {
    const normalized = String(endpoint || "").replace(/[).,;:'"<>]+$/g, "");
    if (!normalized.startsWith("/") || candidates.some((row) => row.endpoint === normalized)) return;
    candidates.push({endpoint: normalized, evidence});
  };
  if (typeof detail?.path === "string") add(detail.path, "structured_path");
  const content = String(detail?.content || "");
  for (const match of content.matchAll(/\b(\/open_api\/[A-Za-z0-9_./{}-]+\/?)/g)) add(match[1], "document_content");
  for (const match of content.matchAll(/<p>\s*(\/[a-z][A-Za-z0-9_./{}-]+\/)\s*<\/p>/g)) add(match[1], "document_content_table");
  return candidates;
}

export function parseTencentLlmsIndex(text) {
  const rows = [];
  let section = "unknown";
  for (const line of String(text).split(/\r?\n/)) {
    if (line === "## Docs") section = "guide";
    else if (line === "## API Docs") section = "api";
    const match = line.match(/^- (.+?) \[(.+?)\]\((https:\/\/s\.apifox\.cn\/apidoc\/docs-site\/3515798\/((?:doc|api)-\d+)\.md)\):\s*(.*)$/);
    if (!match) continue;
    rows.push({
      source_kind: section,
      menu_path: match[1].split(" > ").map((part) => part.trim()).filter(Boolean),
      title: match[2].trim(),
      source_url: match[3],
      source_id: match[4],
      synopsis: match[5].trim(),
    });
  }
  return rows;
}

export function extractTencentEndpoint(markdown) {
  const text = String(markdown);
  const openApiPath = text.match(/^paths:\s*\n\s{2}(\/[A-Za-z0-9_./{}-]+):\s*$/m);
  if (openApiPath) return openApiPath[1];
  const full = text.match(/https:\/\/api\.e\.qq\.com\/(v[0-9.]+\/[A-Za-z0-9_./-]+)/);
  if (full) return `/${full[1].replace(/[).,;:'"<>]+$/g, "")}`;
  const pathMatch = text.match(/(?:\u8bf7\u6c42\u8def\u5f84|\u63a5\u53e3\u5730\u5740|\u8bf7\u6c42\u5730\u5740)[^\n]{0,120}?\b([a-z][a-z0-9_]+\/(?:get|add|update|delete|batch|create|list|copy|preview|upload|download|authorize|transfer))\b/i);
  return pathMatch ? `/${pathMatch[1]}` : null;
}

export function extractTencentOfficialLinks(markdown) {
  const urls = new Set();
  for (const match of String(markdown).matchAll(/https:\/\/developers\.e\.qq\.com\/[A-Za-z0-9_./?=&%#-]*/g)) {
    const raw = match[0].replace(/[).,;:'"<>]+$/g, "");
    try {
      const url = new URL(raw);
      url.hash = "";
      urls.add(url.toString());
    } catch {}
  }
  return [...urls].sort();
}

export function classifyTencentOfficialLink(url) {
  const pathname = new URL(url).pathname;
  if (pathname.startsWith("/docs/api/")) return "api";
  if (pathname.startsWith("/docs/reference/")) return "reference";
  if (pathname.startsWith("/docs/start/")) return "guide";
  if (pathname.startsWith("/docs/guide/")) return "guide";
  if (pathname.startsWith("/docs/")) return "other_doc";
  if (pathname.startsWith("/tools/")) return "tool";
  if (pathname.startsWith("/news/")) return "news";
  return "other";
}

async function writeJson(filePath, data) {
  await mkdir(path.dirname(filePath), {recursive: true});
  await writeFile(filePath, `${JSON.stringify(data, null, 2)}\n`);
}

async function writeJsonl(filePath, rows) {
  await mkdir(path.dirname(filePath), {recursive: true});
  await writeFile(filePath, `${rows.map((row) => JSON.stringify(row)).join("\n")}\n`);
}

async function listFiles(root, relative = "") {
  const {readdir} = await import("node:fs/promises");
  const names = await readdir(path.join(root, relative), {withFileTypes: true});
  const rows = [];
  for (const entry of names.sort((a, b) => a.name.localeCompare(b.name))) {
    const child = path.posix.join(relative.replaceAll(path.sep, "/"), entry.name);
    if (entry.isDirectory()) rows.push(...await listFiles(root, child));
    else if (entry.isFile()) rows.push(child);
  }
  return rows;
}

async function sha256File(filePath) {
  return createHash("sha256").update(await readFile(filePath)).digest("hex");
}

function assertOutput(source, outputDir) {
  const expected = source === "ocean" ? "ka-src-0008" : "ka-src-0009";
  if (path.basename(path.resolve(outputDir)) !== expected) {
    throw new Error(`--output-dir must end with ${expected}`);
  }
}

async function finalize({source, outputDir, extracted, capturedAt, summary, captureMethod, sourceUrl}) {
  await mkdir(outputDir, {recursive: true});
  const finalExtracted = path.join(outputDir, "extracted");
  await rm(finalExtracted, {recursive: true, force: true});
  await rename(extracted, finalExtracted);
  const archivePath = path.join(outputDir, "source.sanitized.zip");
  await rm(archivePath, {force: true});
  const zip = spawnSync("zip", ["-X", "-q", "-r", archivePath, "."], {cwd: finalExtracted, encoding: "utf8"});
  if (zip.status !== 0) throw new Error(`zip failed: ${zip.stderr || zip.stdout}`);

  const entries = [];
  for (const relativePath of await listFiles(finalExtracted)) {
    const filePath = path.join(finalExtracted, relativePath);
    const info = await stat(filePath);
    entries.push({path: relativePath, bytes: info.size, sha256: await sha256File(filePath)});
  }
  const archiveInfo = await stat(archivePath);
  const documentId = source === "ocean" ? "ka-src-0008" : "ka-src-0009";
  const manifest = {
    document_id: documentId,
    source_url: sourceUrl,
    ingested_at: capturedAt,
    current_version: `${source}-public-${capturedAt.slice(0, 10)}`,
    capture_method: captureMethod,
    corpus_summary: summary,
    canonical_archive: {filename: "source.sanitized.zip", bytes: archiveInfo.size, sha256: await sha256File(archivePath)},
    entry_count: entries.length,
    entries,
  };
  await writeJson(path.join(outputDir, "source-manifest.json"), manifest);
  return manifest;
}

async function crawlOcean({outputDir, concurrency}) {
  const capturedAt = new Date().toISOString();
  const scratch = await mkdtemp(path.join(tmpdir(), "ocean-docs-"));
  const extracted = path.join(scratch, "extracted");
  const sanitizeCounts = {};
  const failures = [];
  await mkdir(extracted, {recursive: true});

  const labelTrees = {};
  const labelRows = [];
  for (const treeType of OCEAN_LABEL_TYPES) {
    const labelData = await fetchOfficialJson(appendQuery(OCEAN_LABEL_TREE, {type: treeType}));
    const sanitized = sanitizeValue(labelData, sanitizeCounts);
    labelTrees[treeType] = sanitized;
    await writeJson(path.join(extracted, "menus", `${treeType.toLowerCase()}-label-tree.json`), sanitized);
    labelRows.push(...flattenOceanLabels(sanitized.children, {treeType}));
  }
  const labels = mergeOceanLabels(labelRows);
  const mounts = [];
  for (const label of labels) {
    try {
      const tree = sanitizeValue(await fetchOfficialJson(appendQuery(OCEAN_DOC_TREE, {
        label_id: label.label_id,
        identify_key: label.identify_key,
      })), sanitizeCounts);
      if (!tree || !Array.isArray(tree.primary_doc_list)) throw new Error("official document tree schema mismatch");
      await writeJson(path.join(extracted, "menus", "labels", `${label.label_id}.json`), tree);
      mounts.push(...flattenOceanDocuments(tree.primary_doc_list, label));
    } catch (error) {
      const expectedNavigationOnly = label.label_id === 29 && String(error.message || error).includes("文档库不存在");
      failures.push({stage: "menu", label_id: label.label_id, expected_navigation_only: expectedNavigationOnly, error: String(error.message || error)});
    }
  }

  const byId = new Map();
  for (const mount of mounts) {
    const current = byId.get(mount.document_id);
    if (!current) byId.set(mount.document_id, {...mount, mounts: [mount]});
    else current.mounts.push(mount);
  }
  const documents = [...byId.values()].sort((a, b) => a.document_id.localeCompare(b.document_id));
  const inventory = await mapLimit(documents, concurrency, async (doc, index) => {
    if (index > 0 && index % 100 === 0) process.stderr.write(`[ocean] fetched ${index}/${documents.length}\n`);
    const row = {
      document_id: doc.document_id,
      title: doc.title,
      mounts: doc.mounts.map((mount) => ({
        label_id: mount.label_id,
        label_path: mount.label_path,
        doc_path: mount.doc_path,
        label_hidden_direct: mount.label_hidden_direct,
        label_hidden_effective: mount.label_hidden_effective,
      })),
      official_url: `${OCEAN_SITE}/labels/${doc.label_id}/docs/${doc.document_id}`,
      detail_status: "failed",
    };
    try {
      const detail = sanitizeValue(await fetchOfficialJson(appendQuery(OCEAN_DOC_DETAIL, {
        language: "CHINESE",
        doc_id: doc.document_id,
        identify_key: doc.identify_key,
      })), sanitizeCounts);
      if (!detail || typeof detail !== "object" || (!detail.title && !detail.content && !detail.path)) {
        throw new Error("official document detail schema mismatch");
      }
      await writeJson(path.join(extracted, "documents", `${doc.document_id}.json`), detail);
      const endpointCandidates = extractOceanEndpointCandidates(detail);
      const structuredEndpoint = endpointCandidates.find((item) => item.evidence === "structured_path")?.endpoint || null;
      const referencedEndpointCandidates = endpointCandidates.filter((item) => item.evidence !== "structured_path");
      Object.assign(row, {
        title: detail.title || doc.title,
        detail_status: "captured",
        document_type: detail.doc_type || doc.menu_type || null,
        endpoint: structuredEndpoint,
        structured_endpoint: structuredEndpoint,
        referenced_endpoint_candidates: referencedEndpointCandidates,
        endpoint_candidates: endpointCandidates,
        referenced_endpoint_count: referencedEndpointCandidates.length,
        going_offline: Boolean(detail.going_offline || doc.going_offline),
        is_new: Boolean(detail.is_new || doc.is_new),
        content_bytes: Buffer.byteLength(String(detail.content || "")),
      });
    } catch (error) {
      row.error = String(error.message || error);
      failures.push({stage: "detail", document_id: doc.document_id, error: row.error});
    }
    return row;
  });

  await writeJsonl(path.join(extracted, "inventory", "documents.jsonl"), inventory);
  await writeJsonl(path.join(extracted, "inventory", "endpoints.jsonl"), inventory.filter((row) => row.endpoint));
  await writeJsonl(path.join(extracted, "inventory", "endpoint-candidates.jsonl"), inventory.flatMap((row) =>
    (row.endpoint_candidates || []).map((candidate) => ({
      document_id: row.document_id,
      title: row.title,
      official_url: row.official_url,
      ...candidate,
    }))));
  await writeJson(path.join(extracted, "inventory", "failures.json"), failures);
  const uniqueStructuredEndpointPaths = new Set(inventory.map((row) => row.structured_endpoint).filter(Boolean));
  const uniqueReferencedEndpointPaths = new Set(inventory.flatMap((row) => (row.referenced_endpoint_candidates || []).map((item) => item.endpoint)));
  const uniqueDocumentedPaths = new Set([...uniqueStructuredEndpointPaths, ...uniqueReferencedEndpointPaths]);
  const unexpectedMenuFailures = failures.filter((row) => row.stage === "menu" && !row.expected_navigation_only);
  const summary = {
    document_id: "ka-src-0008",
    source: "巨量引擎商业开放平台官方公开文档",
    source_url: `${OCEAN_SITE}/labels`,
    captured_at: capturedAt,
    label_tree_types: OCEAN_LABEL_TYPES,
    label_groups_by_tree: Object.fromEntries(OCEAN_LABEL_TYPES.map((treeType) => [treeType, labelTrees[treeType].children?.length || 0])),
    label_nodes_with_identify_key: labels.length,
    leaf_label_nodes: labels.filter((row) => row.is_leaf).length,
    hidden_direct_label_nodes: labels.filter((row) => row.hidden_direct).length,
    hidden_effective_label_nodes: labels.filter((row) => row.hidden_effective).length,
    successful_document_trees: labels.length - failures.filter((row) => row.stage === "menu").length,
    expected_navigation_only_trees: failures.filter((row) => row.stage === "menu" && row.expected_navigation_only).length,
    menu_mounts: mounts.length,
    unique_documents: inventory.length,
    captured_documents: inventory.filter((row) => row.detail_status === "captured").length,
    endpoint_documents: inventory.filter((row) => row.endpoint).length,
    structured_endpoint_documents: inventory.filter((row) => row.structured_endpoint).length,
    unique_structured_endpoint_paths: uniqueStructuredEndpointPaths.size,
    documents_with_referenced_endpoint_evidence: inventory.filter((row) => row.referenced_endpoint_count > 0).length,
    unique_referenced_endpoint_paths: uniqueReferencedEndpointPaths.size,
    unique_documented_paths: uniqueDocumentedPaths.size,
    failures: unexpectedMenuFailures.length + failures.filter((row) => row.stage === "detail").length,
    recorded_anomalies: failures.length,
    credential_sanitization_counts: sanitizeCounts,
    boundary: "截至抓取日，覆盖官网未登录状态下 BUSINESS 与 LASTEST_UPDATES 两类标签树公开返回且详情可匿名获取的页面，按 doc_id 去重；hidden 内容仅作历史/背景参考。未覆盖登录后、Scope/白名单/灰度、账户授权后能力，也不代表接口可调用、CLI 已封装或产品已接入。官网目录为动态快照，不宣称永久全量。",
  };
  await writeJson(path.join(extracted, "capture-summary.json"), summary);
  await writeFile(path.join(extracted, "INDEX.md"), buildIndex(summary));
  const manifest = await finalize({
    source: "ocean", outputDir, extracted, capturedAt, summary,
    sourceUrl: `${OCEAN_SITE}/labels`,
    captureMethod: {label_tree_endpoint: OCEAN_LABEL_TREE, label_tree_types: OCEAN_LABEL_TYPES, doc_tree_endpoint: OCEAN_DOC_TREE, detail_endpoint: OCEAN_DOC_DETAIL, authenticated: false, business_api_called: false, stability: "undocumented website implementation; archival use only"},
  });
  await rm(scratch, {recursive: true, force: true});
  return manifest;
}

async function crawlTencent({outputDir, concurrency}) {
  const capturedAt = new Date().toISOString();
  const scratch = await mkdtemp(path.join(tmpdir(), "tencent-docs-"));
  const extracted = path.join(scratch, "extracted");
  const sanitizeCounts = {};
  const failures = [];
  await mkdir(extracted, {recursive: true});

  const rawIndex = await fetchText(`${TENCENT_SITE}/llms.txt`);
  const index = redactCredentialText(rawIndex, sanitizeCounts);
  const listed = parseTencentLlmsIndex(index);
  if (listed.length < 250) throw new Error(`Tencent mirror index unexpectedly small: ${listed.length}`);
  if (new Set(listed.map((row) => row.source_id)).size !== listed.length) throw new Error("Tencent mirror index has duplicate source_id values");
  await writeFile(path.join(extracted, "llms.txt"), index);
  const inventory = await mapLimit(listed, concurrency, async (doc, indexValue) => {
    if (indexValue > 0 && indexValue % 100 === 0) process.stderr.write(`[tencent] fetched ${indexValue}/${listed.length}\n`);
    const row = {...doc, mirror_url: doc.source_url.replace(/\.md$/, ""), detail_status: "failed", source_updated_at: null};
    try {
      const markdown = redactCredentialText(await fetchText(doc.source_url), sanitizeCounts);
      await mkdir(path.join(extracted, "documents"), {recursive: true});
      await writeFile(path.join(extracted, "documents", `${doc.source_id}.md`), markdown);
      const observedEndpoint = doc.source_kind === "api" ? extractTencentEndpoint(markdown) : null;
      const knownConflict = TENCENT_KNOWN_ENDPOINT_CONFLICTS[doc.source_id] || null;
      const endpoint = knownConflict?.corrected_endpoint || observedEndpoint;
      const officialSourceUrls = extractTencentOfficialLinks(markdown);
      Object.assign(row, {
        detail_status: "captured",
        observed_endpoint: observedEndpoint,
        endpoint,
        api_version: endpoint?.match(/^\/(v[0-9.]+)\//)?.[1] || null,
        resource_action: endpoint?.replace(/^\/v[0-9.]+\//, "") || null,
        source_conflict: knownConflict,
        official_source_urls: officialSourceUrls,
        openapi_contract_status: doc.source_kind === "api" ? "non_executable_mirror_conversion" : "not_applicable",
        openapi_query_header_mismatch: /in:\s*header[\s\S]{0,220}以Query Parameter方式/.test(markdown),
        content_bytes: Buffer.byteLength(markdown),
      });
    } catch (error) {
      row.error = String(error.message || error);
      failures.push({stage: "detail", source_id: doc.source_id, error: row.error});
    }
    return row;
  });
  const apiRows = inventory.filter((row) => row.source_kind === "api");
  if (apiRows.some((row) => row.detail_status !== "captured" || !row.observed_endpoint)) {
    throw new Error("Tencent mirror API corpus has uncaptured or endpoint-less pages");
  }
  await writeJsonl(path.join(extracted, "inventory", "documents.jsonl"), inventory);
  await writeJsonl(path.join(extracted, "inventory", "endpoints.jsonl"), inventory.filter((row) => row.endpoint));
  const officialLinks = [...new Set(inventory.flatMap((row) => row.official_source_urls || []))].sort().map((url) => ({
    url,
    kind: classifyTencentOfficialLink(url),
    archived_in_this_snapshot: false,
  }));
  await writeJsonl(path.join(extracted, "inventory", "official-reference-links.jsonl"), officialLinks);
  await writeJson(path.join(extracted, "inventory", "source-conflicts.json"), Object.entries(TENCENT_KNOWN_ENDPOINT_CONFLICTS).map(([source_id, conflict]) => ({source_id, ...conflict})));
  await writeJson(path.join(extracted, "inventory", "failures.json"), failures);
  const observedEndpoints = apiRows.map((row) => row.observed_endpoint).filter(Boolean);
  const normalizedEndpoints = apiRows.map((row) => row.endpoint).filter(Boolean);
  const officialLinkKinds = Object.fromEntries([...new Set(officialLinks.map((row) => row.kind))].sort().map((kind) => [kind, officialLinks.filter((row) => row.kind === kind).length]));
  const summary = {
    document_id: "ka-src-0009",
    source: "腾讯广告 Marketing API 公开 Apifox 镜像（官方归属待补证）",
    source_url: TENCENT_SITE,
    official_entry: TENCENT_OFFICIAL_ENTRY,
    mirror_ownership_status: "unverified",
    captured_at: capturedAt,
    source_updated_at: null,
    llms_index_entries: listed.length,
    guide_documents: listed.filter((row) => row.source_kind === "guide").length,
    api_documents: listed.filter((row) => row.source_kind === "api").length,
    captured_documents: inventory.filter((row) => row.detail_status === "captured").length,
    endpoint_documents: inventory.filter((row) => row.endpoint).length,
    observed_unique_endpoint_paths: new Set(observedEndpoints).size,
    normalized_unique_endpoint_paths: new Set(normalizedEndpoints).size,
    duplicated_observed_endpoint_groups: observedEndpoints.length - new Set(observedEndpoints).size,
    known_endpoint_conflicts: Object.keys(TENCENT_KNOWN_ENDPOINT_CONFLICTS).length,
    openapi_query_header_mismatch_documents: apiRows.filter((row) => row.openapi_query_header_mismatch).length,
    official_reference_links_discovered: officialLinks.length,
    official_reference_link_kinds: officialLinkKinds,
    official_reference_links_archived: 0,
    failures: failures.length,
    credential_sanitization_counts: sanitizeCounts,
    boundary: "截至抓取日，覆盖公开 Apifox 项目 llms.txt 列出的全部 Markdown 页面；内容与腾讯广告官方原站高度一致，但项目归属尚未获腾讯声明证实，且 OpenAPI 转换存在系统性错误，不得作为可执行 Contract/SDK 生成源。官方原站枚举、专题、公告和附件未全量归档；documented 不等于 authorized、wrapped 或 verified。",
  };
  await writeJson(path.join(extracted, "capture-summary.json"), summary);
  await writeFile(path.join(extracted, "INDEX.md"), buildIndex(summary));
  const manifest = await finalize({
    source: "tencent", outputDir, extracted, capturedAt, summary,
    sourceUrl: TENCENT_SITE,
    captureMethod: {official_entry: TENCENT_OFFICIAL_ENTRY, public_mirror_site: TENCENT_SITE, mirror_ownership_status: "unverified", index: `${TENCENT_SITE}/llms.txt`, authenticated: false, business_api_called: false},
  });
  await rm(scratch, {recursive: true, force: true});
  return manifest;
}

function buildIndex(summary) {
  return `# ${summary.source}\n\n`
    + `- 抓取时间：${summary.captured_at}\n`
    + `- 唯一文档：${summary.unique_documents ?? summary.llms_index_entries}\n`
    + `- 成功：${summary.captured_documents}\n`
    + `- 接口路径已提取：${summary.endpoint_documents}\n`
    + `- 失败：${summary.failures}\n\n`
    + `## 使用边界\n\n${summary.boundary}\n`;
}

function parseArgs(argv) {
  const args = {concurrency: 6};
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === "--source") args.source = argv[++index];
    else if (token === "--output-dir") args.outputDir = argv[++index];
    else if (token === "--concurrency") args.concurrency = Number(argv[++index]);
    else throw new Error(`unknown argument: ${token}`);
  }
  if (!new Set(["ocean", "tencent"]).has(args.source)) throw new Error("--source must be ocean or tencent");
  if (!args.outputDir) throw new Error("--output-dir is required");
  if (!Number.isInteger(args.concurrency) || args.concurrency < 1 || args.concurrency > 12) {
    throw new Error("--concurrency must be an integer between 1 and 12");
  }
  assertOutput(args.source, args.outputDir);
  args.outputDir = path.resolve(args.outputDir);
  return args;
}

export async function crawl(options) {
  return options.source === "ocean" ? crawlOcean(options) : crawlTencent(options);
}

const invokedPath = process.argv[1] ? path.resolve(process.argv[1]) : null;
if (invokedPath === fileURLToPath(import.meta.url)) {
  try {
    const options = parseArgs(process.argv.slice(2));
    const manifest = await crawl(options);
    process.stdout.write(`${JSON.stringify({document_id: manifest.document_id, entry_count: manifest.entry_count, archive_sha256: manifest.canonical_archive.sha256, corpus_summary: manifest.corpus_summary}, null, 2)}\n`);
  } catch (error) {
    process.stderr.write(`${error.stack || error.message || error}\n`);
    process.exitCode = 1;
  }
}
