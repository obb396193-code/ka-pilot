import assert from "node:assert/strict";
import {mkdtemp, mkdir, readFile, writeFile} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  parseCatalog,
  validateCatalogRecords,
  validateRepository,
} from "./validate-knowledge-catalog.mjs";

const baseRecord = {
  document_id: "ka-src-0001",
  title: "测试资料",
  source_type: "internal",
  original_source: "老板在会话中提供",
  source_file_location: "会话原文",
  source_system: "Codex conversation",
  author_or_owner: "资料提供方",
  published_at: "2026-06-29",
  ingested_at: "2026-08-20T10:00:00+08:00",
  current_version: "0.1",
  content_hash_sha256: "a".repeat(64),
  applicable_media: ["快手"],
  applicable_business: ["KA投放"],
  access_level: "project_internal",
  allowed_roles: ["development", "review"],
  evidence_level: "E3",
  analysis_status: "completed",
  lifecycle_status: "review_pending",
  review_status: "pending",
  product_kb_publication_status: "not_ready",
  supersedes_document_id: null,
  deprecated_by_document_id: null,
  related_product_modules: ["知识库"],
  related_specs: ["docs/20-PRD-v1.md"],
  storage_ref: "private/knowledge-sources/ka-src-0001/source.md",
  assessment_ref: "docs/knowledge/assessments/ka-src-0001.md",
  source_url: null,
  license: {
    status: "internal_use_only",
    citation_boundary: "仅限项目内部引用",
  },
  tags: ["投放平台"],
};

test("parseCatalog parses JSONL one record per non-empty line", () => {
  const result = parseCatalog(`${JSON.stringify(baseRecord)}\n\n`);
  assert.deepEqual(result.records, [baseRecord]);
  assert.deepEqual(result.errors, []);
});

test("parseCatalog reports malformed lines without discarding valid records", () => {
  const result = parseCatalog(`${JSON.stringify(baseRecord)}\n{bad json}\n`);
  assert.equal(result.records.length, 1);
  assert.match(result.errors[0], /line 2/i);
});

test("catalog rejects duplicate IDs and missing required fields", () => {
  const missingTitle = {...baseRecord};
  delete missingTitle.title;
  const errors = validateCatalogRecords([baseRecord, {...baseRecord}, missingTitle]);
  assert.ok(errors.some((error) => error.includes("duplicate document_id")));
  assert.ok(errors.some((error) => error.includes("title is required")));
});

test("catalog enforces lifecycle, review and publication gates", () => {
  const invalid = {
    ...baseRecord,
    lifecycle_status: "published",
    review_status: "pending",
    product_kb_publication_status: "published",
  };
  const errors = validateCatalogRecords([invalid]);
  assert.ok(errors.some((error) => error.includes("published requires review_status=approved")));
});

test("catalog rejects unknown enums and restricted records without roles", () => {
  const invalid = {
    ...baseRecord,
    source_type: "blog",
    access_level: "restricted",
    allowed_roles: [],
    evidence_level: "E9",
  };
  const errors = validateCatalogRecords([invalid]);
  assert.ok(errors.some((error) => error.includes("source_type")));
  assert.ok(errors.some((error) => error.includes("allowed_roles")));
  assert.ok(errors.some((error) => error.includes("evidence_level")));
});

test("repository validation detects hash drift and credential values", async () => {
  const repoRoot = await mkdtemp(path.join(os.tmpdir(), "knowledge-catalog-"));
  const storage = "private/knowledge-sources/ka-src-0001/source.md";
  const assessment = "docs/knowledge/assessments/ka-src-0001.md";
  await mkdir(path.join(repoRoot, path.dirname(storage)), {recursive: true});
  await mkdir(path.join(repoRoot, path.dirname(assessment)), {recursive: true});
  await mkdir(path.join(repoRoot, "docs/knowledge"), {recursive: true});
  await writeFile(path.join(repoRoot, storage), "PAT=ghp_1234567890abcdefghij\n", "utf8");
  await writeFile(path.join(repoRoot, assessment), "# 评估\n", "utf8");
  await writeFile(
    path.join(repoRoot, "docs/knowledge/catalog.jsonl"),
    `${JSON.stringify(baseRecord)}\n`,
    "utf8",
  );

  const errors = await validateRepository({repoRoot, checkGit: false, checkDocs: false});
  assert.ok(errors.some((error) => error.includes("content hash mismatch")));
  assert.ok(errors.some((error) => error.includes("credential-shaped value")));
});

test("repository validation requires assessment and private storage files", async () => {
  const repoRoot = await mkdtemp(path.join(os.tmpdir(), "knowledge-catalog-missing-"));
  await mkdir(path.join(repoRoot, "docs/knowledge"), {recursive: true});
  await writeFile(
    path.join(repoRoot, "docs/knowledge/catalog.jsonl"),
    `${JSON.stringify(baseRecord)}\n`,
    "utf8",
  );

  const errors = await validateRepository({repoRoot, checkGit: false, checkDocs: false});
  assert.ok(errors.some((error) => error.includes("storage_ref does not exist")));
  assert.ok(errors.some((error) => error.includes("assessment_ref does not exist")));
});

test("repository validation accepts a consistent untracked private record", async () => {
  const repoRoot = await mkdtemp(path.join(os.tmpdir(), "knowledge-catalog-valid-"));
  const storage = "private/knowledge-sources/ka-src-0001/source.md";
  const assessment = "docs/knowledge/assessments/ka-src-0001.md";
  const source = "内部资料，不包含凭证。\n";
  const {createHash} = await import("node:crypto");
  const hash = createHash("sha256").update(source).digest("hex");
  await mkdir(path.join(repoRoot, path.dirname(storage)), {recursive: true});
  await mkdir(path.join(repoRoot, path.dirname(assessment)), {recursive: true});
  await writeFile(path.join(repoRoot, storage), source, "utf8");
  await writeFile(path.join(repoRoot, assessment), "# 评估\n", "utf8");
  await writeFile(
    path.join(repoRoot, "docs/knowledge/catalog.jsonl"),
    `${JSON.stringify({...baseRecord, content_hash_sha256: hash})}\n`,
    "utf8",
  );

  const errors = await validateRepository({repoRoot, checkGit: false, checkDocs: false});
  assert.deepEqual(errors, []);
});

test("shared knowledge docs define retrieval, assessment and publishing gates", async () => {
  const repoRoot = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
  const expected = new Map([
    ["docs/knowledge/README.md", ["项目共享资料库", "review_pending", "private/knowledge-sources"]],
    ["docs/knowledge/templates/source-card.md", ["已确认事实", "合理推断", "需要审查 Agent 裁决的问题"]],
    ["docs/knowledge/agent-retrieval-guide.md", ["catalog.jsonl", "未审查", "document_id"]],
    ["docs/knowledge/product-kb-publishing.md", ["content_hash", "allowed_roles", "supersedes_document_id"]],
  ]);

  for (const [relativePath, requiredText] of expected) {
    const content = await readFile(path.join(repoRoot, relativePath), "utf8");
    for (const text of requiredText) assert.match(content, new RegExp(text));
  }
});
