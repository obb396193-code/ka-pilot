import { mkdir, rename, writeFile } from "node:fs/promises";
import process from "node:process";

import { UI_SOURCES } from "./sources.mjs";

const timeoutMs = 20_000;
const shouldWrite = process.argv.includes("--write");
const outputUrl = new URL(
  "../../../../docs/frontend/ui-assets/source-health.json",
  import.meta.url,
);

async function inspectEndpoint(url) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      redirect: "follow",
      signal: controller.signal,
      headers: {
        Accept: "application/json,text/plain,text/html;q=0.9,*/*;q=0.8",
        "User-Agent": "ka-pilot-ui-catalog/1.0",
      },
    });
    const body = await response.text();
    return {
      url,
      final_url: response.url,
      ok: response.ok,
      status_code: response.status,
      content_type: response.headers.get("content-type") ?? "",
      etag: response.headers.get("etag") ?? "",
      last_modified: response.headers.get("last-modified") ?? "",
      content_length: body.length,
      error: response.ok ? "" : `HTTP ${response.status}`,
    };
  } catch (error) {
    return {
      url,
      final_url: "",
      ok: false,
      status_code: 0,
      content_type: "",
      etag: "",
      last_modified: "",
      content_length: 0,
      error: error instanceof Error ? error.message : String(error),
    };
  } finally {
    clearTimeout(timeout);
  }
}

const checkedAt = new Date().toISOString();
const results = [];

for (const source of UI_SOURCES) {
  const endpoints = await Promise.all(source.catalogUrls.map(inspectEndpoint));
  const reachable = endpoints.every((endpoint) => endpoint.ok);
  const status = !reachable
    ? "blocked"
    : source.coverage === "complete"
      ? "verified"
      : "partial";

  results.push({
    id: source.id,
    name: source.name,
    status,
    catalog_mode: source.catalogMode,
    coverage: source.coverage,
    coverage_note: source.coverageNote,
    license: source.license,
    redistribution: source.redistribution,
    checked_at: checkedAt,
    endpoints,
  });
}

const report = {
  schema_version: 1,
  checked_at: checkedAt,
  summary: {
    total: results.length,
    verified: results.filter((result) => result.status === "verified").length,
    partial: results.filter((result) => result.status === "partial").length,
    blocked: results.filter((result) => result.status === "blocked").length,
  },
  sources: results,
};

if (shouldWrite) {
  await mkdir(new URL("./", outputUrl), { recursive: true });
  const temporaryUrl = new URL(outputUrl);
  temporaryUrl.pathname = `${temporaryUrl.pathname}.tmp`;
  await writeFile(temporaryUrl, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  await rename(temporaryUrl, outputUrl);
}

console.log(JSON.stringify(report, null, 2));
if (report.summary.blocked > 0) process.exitCode = 1;
