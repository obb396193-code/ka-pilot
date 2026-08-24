#!/usr/bin/env node

import {createHash} from "node:crypto";
import {mkdir, mkdtemp, readFile, rename, rm, stat, writeFile} from "node:fs/promises";
import {tmpdir} from "node:os";
import path from "node:path";
import {spawnSync} from "node:child_process";
import {fileURLToPath} from "node:url";

const SITE = "https://developers.e.kuaishou.com";
const MENU_ENDPOINT = `${SITE}/rest/open_api/platform/document/menu/list`;
const DETAIL_ENDPOINT = `${SITE}/rest/open_api/platform/document/detail`;
const USER_AGENT = "KA-Knowledge-Research/1.0 (+public-official-doc-archive)";

export function flattenMenu(nodes, edition, parents = [], rows = []) {
  for (const node of nodes || []) {
    const menuPath = [...parents, node.menuName].filter(Boolean);
    if (Number(node.documentId) > 0) {
      rows.push({
        edition,
        document_id: Number(node.documentId),
        menu_id: Number(node.menuId),
        menu_path: menuPath,
        menu_document_type: node.documentType || "UNKNOWN",
        menu_name: node.menuName || "",
        document_name: node.documentName || node.menuName || "",
        description: node.description || "",
      });
    }
    flattenMenu(node.children, edition, menuPath, rows);
  }
  return rows;
}

export function redactCredentialText(value, counts = {}) {
  let text = String(value);
  const replacements = [
    ["bearer", /\bBearer\s+[A-Za-z0-9._~+/=-]{8,}/gi, "Bearer [REDACTED_SECRET_EXAMPLE]"],
    ["known_prefix", /\b(?:ghp_|github_pat_|sk-|xoxb-|mul_|mcn_)[A-Za-z0-9._-]{8,}/gi, "[REDACTED_SECRET_EXAMPLE]"],
    ["named_header", /((?:Access-Token|Authorization|Cookie)\s*["']?\s*[:=]\s*["']?)([^\s"'&,}<]{8,})/gi, "$1[REDACTED_SECRET_EXAMPLE]"],
    ["named_assignment", /((?:client_secret|access_token|refresh_token|webhook_token|token|password|secret)\s*["']?\s*[:=]\s*["']?)([^\s"'&,}<]{8,})/gi, "$1[REDACTED_SECRET_EXAMPLE]"],
    ["signed_query", /([?&](?:access[_-]?key(?:[_-]?id)?|signature|access[_-]?token|refresh[_-]?token|token|secret)=)[^&#\s"']+/gi, "$1[REDACTED_SECRET_EXAMPLE]"],
    ["database_password", /\b(postgres(?:ql)?:\/\/[^\s:/]+:)[^\s@]+(@)/gi, "$1[REDACTED_SECRET_EXAMPLE]$2"],
  ];
  for (const [name, pattern, replacement] of replacements) {
    text = text.replace(pattern, (...args) => {
      counts[name] = (counts[name] || 0) + 1;
      const match = args[0];
      if (typeof replacement === "string") {
        return replacement.replaceAll("$1", args[1] || "").replaceAll("$2", args[2] || "");
      }
      return match;
    });
  }
  return text;
}

export function sanitizeValue(value, counts = {}, context = {}) {
  if (Array.isArray(value)) return value.map((item) => sanitizeValue(item, counts, context));
  if (value && typeof value === "object") {
    const sensitiveParam = isSensitiveName(value.paramName || value.param_name || value.name || "");
    const result = {};
    for (const [key, child] of Object.entries(value)) {
      if (isSensitiveName(key) && (typeof child === "string" || typeof child === "number")) {
        if (String(child).trim() !== "") counts.sensitive_key = (counts.sensitive_key || 0) + 1;
        result[key] = String(child).trim() === "" ? child : "[REDACTED_SECRET_EXAMPLE]";
      } else if (sensitiveParam && /^(?:example|defaultValue|default_value|value)$/i.test(key)
        && (typeof child === "string" || typeof child === "number")) {
        if (String(child).trim() !== "") counts.sensitive_param_example = (counts.sensitive_param_example || 0) + 1;
        result[key] = String(child).trim() === "" ? child : "[REDACTED_SECRET_EXAMPLE]";
      } else {
        result[key] = sanitizeValue(child, counts, {...context, key});
      }
    }
    return result;
  }
  if (typeof value === "string") return redactCredentialText(value, counts);
  return value;
}

function isSensitiveName(value) {
  return /^(?:access[-_ ]?token|refresh[-_ ]?token|authorization|cookie|client[-_ ]?secret|app[-_ ]?secret|secret|password|passwd|webhook[-_ ]?token|ak|sk)$/i.test(String(value).trim());
}

async function postJson(url, body, {attempts = 4} = {}) {
  let lastError;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const response = await fetch(url, {
        method: "POST",
        redirect: "follow",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
          Referer: `${SITE}/docs?docType=DSP`,
          "User-Agent": USER_AGENT,
        },
        body: JSON.stringify(body),
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = await response.json();
      if (data.result !== 1) throw new Error(`official API result=${data.result}: ${data.message || "unknown"}`);
      return data;
    } catch (error) {
      lastError = error;
      if (attempt < attempts) await delay(300 * (2 ** (attempt - 1)));
    }
  }
  throw lastError;
}

async function getText(url, {attempts = 3} = {}) {
  let lastError;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const response = await fetch(url, {
        redirect: "follow",
        headers: {Accept: "text/html,application/xhtml+xml", "User-Agent": USER_AGENT},
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

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
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

function uniqueDocuments(rows) {
  const byId = new Map();
  for (const row of rows) {
    const current = byId.get(row.document_id);
    if (!current) {
      byId.set(row.document_id, {...row, menu_mounts: [{menu_id: row.menu_id, menu_path: row.menu_path}]});
    } else {
      current.menu_mounts.push({menu_id: row.menu_id, menu_path: row.menu_path});
    }
  }
  return [...byId.values()].sort((a, b) => a.document_id - b.document_id);
}

async function writeJson(filePath, data) {
  await mkdir(path.dirname(filePath), {recursive: true});
  await writeFile(filePath, `${JSON.stringify(data, null, 2)}\n`);
}

async function writeJsonl(filePath, rows) {
  await mkdir(path.dirname(filePath), {recursive: true});
  await writeFile(filePath, `${rows.map((row) => JSON.stringify(row)).join("\n")}\n`);
}

function isoFromMillis(value) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? new Date(number).toISOString() : null;
}

function normalizedEndpoint(targetPath) {
  if (!targetPath) return null;
  try {
    const pathname = new URL(targetPath).pathname;
    return pathname.startsWith("/rest/openapi/") ? pathname : null;
  } catch {
    return targetPath.startsWith("/rest/openapi/") ? targetPath : null;
  }
}

export function extractEndpointCandidates(detail) {
  const candidates = [];
  const target = normalizedEndpoint(detail?.targetPath);
  if (target) candidates.push({endpoint: target, evidence: "targetPath"});
  const texts = [detail?.content, detail?.summary, detail?.remark, detail?.inputParamExample, detail?.outputParamExample]
    .filter((value) => typeof value === "string" && value !== "");
  const pattern = /\/rest\/openapi\/[A-Za-z0-9_./-]+/g;
  for (const text of texts) {
    for (const match of text.matchAll(pattern)) {
      const endpoint = match[0].replace(/[).,;:'"<>]+$/g, "");
      if (!candidates.some((item) => item.endpoint === endpoint)) {
        candidates.push({endpoint, evidence: "document_content"});
      }
    }
  }
  return candidates;
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

function assertSafeOutput(outputDir) {
  if (path.basename(path.resolve(outputDir)) !== "ka-src-0007") {
    throw new Error("--output-dir must end with ka-src-0007");
  }
}

export async function crawl({outputDir, concurrency = 6}) {
  assertSafeOutput(outputDir);
  outputDir = path.resolve(outputDir);
  const capturedAt = new Date().toISOString();
  const captureDate = capturedAt.slice(0, 10);
  const scratch = await mkdtemp(path.join(tmpdir(), "ks-mapi-corpus-"));
  const extracted = path.join(scratch, "extracted");
  const sanitizeCounts = {};
  const failures = [];
  await mkdir(extracted, {recursive: true});

  const editions = [
    {name: "current", switch_old: 2},
    {name: "legacy", switch_old: 1},
  ];
  const allInventory = [];
  for (const edition of editions) {
    const menuResponse = await postJson(MENU_ENDPOINT, {platformType: "DSP", switchOld: edition.switch_old});
    const menuData = sanitizeValue(menuResponse.data, sanitizeCounts);
    await writeJson(path.join(extracted, "menus", `${edition.name}.json`), menuData);
    const mounts = flattenMenu(menuData.menuList, edition.name);
    const docs = uniqueDocuments(mounts);
    process.stderr.write(`[${edition.name}] ${mounts.length} mounts / ${docs.length} unique documents\n`);

    const editionRows = await mapLimit(docs, concurrency, async (doc, index) => {
      if (index > 0 && index % 50 === 0) process.stderr.write(`[${edition.name}] fetched ${index}/${docs.length}\n`);
      const row = {
        edition: edition.name,
        document_id: doc.document_id,
        menu_id: doc.menu_id,
        menu_mounts: doc.menu_mounts,
        menu_path: doc.menu_path,
        menu_document_type: doc.menu_document_type,
        document_name: doc.document_name,
        detail_status: "failed",
      };
      try {
        const detailResponse = await postJson(DETAIL_ENDPOINT, {documentId: doc.document_id, menuId: doc.menu_id});
        const detail = sanitizeValue(detailResponse.data, sanitizeCounts);
        await writeJson(path.join(extracted, "documents", edition.name, `${doc.document_id}.json`), detail);
        const endpointCandidates = extractEndpointCandidates(detail);
        Object.assign(row, {
          detail_status: "captured",
          document_name: detail.documentName || doc.document_name,
          document_type: detail.documentType ?? null,
          version: detail.version || null,
          version_list: (detail.versionList || []).map((item) => ({
            version: item.version || null,
            created_at: isoFromMillis(item.createTime),
          })),
          updated_at: isoFromMillis(detail.createTime),
          endpoint: endpointCandidates[0]?.endpoint || null,
          endpoint_evidence: endpointCandidates[0]?.evidence || null,
          endpoint_candidates: endpointCandidates,
          target_url: detail.targetPath || null,
          http_method: detail.httpMethod || null,
          http_content_type: detail.httpContentType || null,
          external_content_url: detail.url || null,
          input_param_count: Array.isArray(detail.inputParams) ? detail.inputParams.length : 0,
          output_param_count: Array.isArray(detail.outputParams) ? detail.outputParams.length : 0,
          official_url: `${SITE}/docs?docType=DSP&documentId=${doc.document_id}&menuId=${doc.menu_id}`,
        });
        if (detail.url && /^https?:\/\//.test(detail.url)) {
          try {
            const html = redactCredentialText(await getText(detail.url), sanitizeCounts);
            const externalPath = path.join("external", edition.name, `${doc.document_id}.html`);
            await mkdir(path.dirname(path.join(extracted, externalPath)), {recursive: true});
            await writeFile(path.join(extracted, externalPath), html);
            row.external_capture_status = "captured";
            row.external_capture_ref = externalPath;
          } catch (error) {
            row.external_capture_status = "failed";
            failures.push({edition: edition.name, document_id: doc.document_id, stage: "external", error: String(error.message || error)});
          }
        } else {
          row.external_capture_status = "not_applicable";
        }
      } catch (error) {
        row.error = String(error.message || error);
        failures.push({edition: edition.name, document_id: doc.document_id, stage: "detail", error: row.error});
      }
      return row;
    });
    allInventory.push(...editionRows);
  }

  const endpointRows = allInventory.filter((row) => row.detail_status === "captured" && row.endpoint);
  await writeJsonl(path.join(extracted, "inventory", "documents.jsonl"), allInventory);
  await writeJsonl(path.join(extracted, "inventory", "endpoints.jsonl"), endpointRows);
  await writeJson(path.join(extracted, "inventory", "failures.json"), failures);

  const summary = {
    document_id: "ka-src-0007",
    source: "快手磁力引擎开放平台公开 DSP/MAPI 文档",
    source_url: `${SITE}/docs?docType=DSP`,
    captured_at: capturedAt,
    capture_scope: ["current", "legacy"],
    current: summarizeInventory(allInventory.filter((row) => row.edition === "current")),
    legacy: summarizeInventory(allInventory.filter((row) => row.edition === "legacy")),
    total_unique_document_snapshots: allInventory.length,
    endpoint_records: endpointRows.length,
    failures: failures.length,
    credential_sanitization_counts: sanitizeCounts,
    boundary: "公开文档已归档不等于当前账户已授权、CLI 已封装或运行时已验证；本抓取未登录且未调用广告账户业务接口。",
  };
  await writeJson(path.join(extracted, "capture-summary.json"), summary);
  await writeFile(path.join(extracted, "INDEX.md"), buildIndex(summary));

  await mkdir(outputDir, {recursive: true});
  const finalExtracted = path.join(outputDir, "extracted");
  await rm(finalExtracted, {recursive: true, force: true});
  await rename(extracted, finalExtracted);
  const archivePath = path.join(outputDir, "source.sanitized.zip");
  await rm(archivePath, {force: true});
  const zip = spawnSync("zip", ["-X", "-q", "-r", archivePath, "."], {
    cwd: finalExtracted,
    encoding: "utf8",
  });
  if (zip.status !== 0) throw new Error(`zip failed: ${zip.stderr || zip.stdout}`);

  const entries = [];
  for (const relativePath of await listFiles(finalExtracted)) {
    const filePath = path.join(finalExtracted, relativePath);
    const info = await stat(filePath);
    entries.push({path: relativePath, bytes: info.size, sha256: await sha256File(filePath)});
  }
  const archiveInfo = await stat(archivePath);
  const manifest = {
    document_id: "ka-src-0007",
    source_url: `${SITE}/docs?docType=DSP`,
    ingested_at: capturedAt,
    current_version: `dsp-current-and-legacy-${captureDate}`,
    capture_method: {
      menu_endpoint: MENU_ENDPOINT,
      detail_endpoint: DETAIL_ENDPOINT,
      platform_type: "DSP",
      switch_old_values: {current: 2, legacy: 1},
      authenticated: false,
      business_api_called: false,
    },
    corpus_summary: summary,
    canonical_archive: {
      filename: "source.sanitized.zip",
      bytes: archiveInfo.size,
      sha256: await sha256File(archivePath),
    },
    entry_count: entries.length,
    entries,
  };
  await writeJson(path.join(outputDir, "source-manifest.json"), manifest);
  await rm(scratch, {recursive: true, force: true});
  return manifest;
}

function summarizeInventory(rows) {
  return {
    documents: rows.length,
    captured: rows.filter((row) => row.detail_status === "captured").length,
    failed: rows.filter((row) => row.detail_status !== "captured").length,
    endpoint_records: rows.filter((row) => row.endpoint).length,
    external_pages: rows.filter((row) => row.external_capture_status === "captured").length,
  };
}

function buildIndex(summary) {
  return `# 快手磁力引擎 DSP/MAPI 官方公开文档快照\n\n`
    + `- 抓取时间：${summary.captured_at}\n`
    + `- 新版：${summary.current.documents} 篇，成功 ${summary.current.captured}，接口记录 ${summary.current.endpoint_records}\n`
    + `- 旧版：${summary.legacy.documents} 篇，成功 ${summary.legacy.captured}，接口记录 ${summary.legacy.endpoint_records}\n`
    + `- 外部富文本正文：${summary.current.external_pages + summary.legacy.external_pages} 篇\n`
    + `- 失败：${summary.failures}\n\n`
    + `## 目录\n\n`
    + `- \`menus/\`：官方新版/旧版完整目录树。\n`
    + `- \`documents/\`：按 edition/documentId 保存的官方详情响应。\n`
    + `- \`external/\`：官方详情页链接到的公开富文本 HTML，无凭证快照。\n`
    + `- \`inventory/documents.jsonl\`：逐文档机器索引。\n`
    + `- \`inventory/endpoints.jsonl\`：带 endpoint 的接口索引。\n`
    + `- \`inventory/failures.json\`：抓取失败清单。\n\n`
    + `## 使用边界\n\n${summary.boundary}\n`;
}

function parseArgs(argv) {
  const args = {concurrency: 6};
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === "--output-dir") args.outputDir = argv[++index];
    else if (token === "--concurrency") args.concurrency = Number(argv[++index]);
    else throw new Error(`unknown argument: ${token}`);
  }
  if (!args.outputDir) throw new Error("--output-dir is required");
  if (!Number.isInteger(args.concurrency) || args.concurrency < 1 || args.concurrency > 12) {
    throw new Error("--concurrency must be an integer between 1 and 12");
  }
  return args;
}

const invokedPath = process.argv[1] ? path.resolve(process.argv[1]) : null;
if (invokedPath === fileURLToPath(import.meta.url)) {
  try {
    const manifest = await crawl(parseArgs(process.argv.slice(2)));
    process.stdout.write(`${JSON.stringify({
      document_id: manifest.document_id,
      entry_count: manifest.entry_count,
      archive_sha256: manifest.canonical_archive.sha256,
      corpus_summary: manifest.corpus_summary,
    }, null, 2)}\n`);
  } catch (error) {
    process.stderr.write(`${error.stack || error.message || error}\n`);
    process.exitCode = 1;
  }
}
