import {createHash} from "node:crypto";
import {access, readFile} from "node:fs/promises";
import path from "node:path";
import {spawnSync} from "node:child_process";
import {fileURLToPath} from "node:url";

const REQUIRED_FIELDS = [
  "document_id",
  "title",
  "source_type",
  "original_source",
  "source_file_location",
  "source_system",
  "author_or_owner",
  "published_at",
  "ingested_at",
  "current_version",
  "content_hash_sha256",
  "applicable_media",
  "applicable_business",
  "access_level",
  "allowed_roles",
  "evidence_level",
  "analysis_status",
  "lifecycle_status",
  "review_status",
  "product_kb_publication_status",
  "supersedes_document_id",
  "deprecated_by_document_id",
  "related_product_modules",
  "related_specs",
  "storage_ref",
  "assessment_ref",
  "source_url",
  "license",
  "tags",
];

const ENUMS = {
  source_type: new Set(["internal", "official", "competitor", "open_source", "research"]),
  access_level: new Set(["public", "project_internal", "restricted", "confidential"]),
  evidence_level: new Set(["E1", "E2", "E3", "E4", "E5"]),
  analysis_status: new Set(["not_started", "in_progress", "completed"]),
  lifecycle_status: new Set([
    "raw",
    "analyzed",
    "review_pending",
    "reviewed",
    "approved",
    "published",
    "deprecated",
  ]),
  review_status: new Set(["not_submitted", "pending", "in_review", "reviewed", "approved", "rejected"]),
  product_kb_publication_status: new Set(["not_ready", "ready", "published", "deprecated"]),
};

const ARRAY_FIELDS = [
  "applicable_media",
  "applicable_business",
  "allowed_roles",
  "related_product_modules",
  "related_specs",
  "tags",
];

const CREDENTIAL_PATTERNS = [
  {type: "bearer_token", pattern: /\bBearer\s+[A-Za-z0-9._~+/=-]{12,}/i},
  {
    type: "named_secret_assignment",
    pattern: /\b(?:AK|SK|PAT|TOKEN|COOKIE|PASSWORD|SECRET|WEBHOOK_TOKEN)\b\s*[:=]\s*["']?[A-Za-z0-9._~+/=-]{8,}/i,
  },
  {type: "known_secret_prefix", pattern: /\b(?:ghp_|github_pat_|sk-|xoxb-|mul_|mcn_)[A-Za-z0-9._-]{10,}/i},
  {type: "database_url_password", pattern: /\bpostgres(?:ql)?:\/\/[^\s:/]+:[^\s@]+@/i},
];

export function parseCatalog(text) {
  const records = [];
  const errors = [];
  const lines = text.split(/\r?\n/);
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index].trim();
    if (line === "") continue;
    try {
      const record = JSON.parse(line);
      if (!isPlainObject(record)) {
        errors.push(`line ${index + 1}: catalog record must be a JSON object`);
        continue;
      }
      records.push(record);
    } catch (error) {
      errors.push(`line ${index + 1}: invalid JSON (${error.message})`);
    }
  }
  return {records, errors};
}

export function validateCatalogRecords(records) {
  const errors = [];
  const seen = new Set();
  records.forEach((record, index) => {
    const prefix = record.document_id || `record ${index + 1}`;
    for (const field of REQUIRED_FIELDS) {
      if (!(field in record)) errors.push(`${prefix}: ${field} is required`);
    }

    if (typeof record.document_id !== "string" || !/^ka-src-\d{4,}$/.test(record.document_id)) {
      errors.push(`${prefix}: document_id must match ka-src-NNNN`);
    } else if (seen.has(record.document_id)) {
      errors.push(`${prefix}: duplicate document_id`);
    } else {
      seen.add(record.document_id);
    }

    if (typeof record.title !== "string" || record.title.trim() === "") {
      errors.push(`${prefix}: title is required`);
    }

    for (const [field, allowed] of Object.entries(ENUMS)) {
      if (!allowed.has(record[field])) errors.push(`${prefix}: ${field} has an unsupported value`);
    }

    for (const field of ARRAY_FIELDS) {
      if (!Array.isArray(record[field])) errors.push(`${prefix}: ${field} must be an array`);
    }
    if (!Array.isArray(record.allowed_roles) || record.allowed_roles.length === 0) {
      errors.push(`${prefix}: allowed_roles must contain at least one role`);
    }

    if (!/^[a-f0-9]{64}$/.test(record.content_hash_sha256 || "")) {
      errors.push(`${prefix}: content_hash_sha256 must be a lowercase SHA-256`);
    }
    if (typeof record.storage_ref !== "string" || !record.storage_ref.startsWith("private/knowledge-sources/")) {
      errors.push(`${prefix}: storage_ref must be under private/knowledge-sources/`);
    }
    if (typeof record.assessment_ref !== "string" || !record.assessment_ref.startsWith("docs/knowledge/assessments/")) {
      errors.push(`${prefix}: assessment_ref must be under docs/knowledge/assessments/`);
    }
    if (!isPlainObject(record.license)
      || typeof record.license.status !== "string"
      || typeof record.license.citation_boundary !== "string") {
      errors.push(`${prefix}: license must include status and citation_boundary`);
    }

    const publication = record.product_kb_publication_status;
    if ((publication === "ready" || publication === "published") && record.review_status !== "approved") {
      errors.push(`${prefix}: ${publication} requires review_status=approved`);
    }
    if (publication === "published" && record.lifecycle_status !== "published") {
      errors.push(`${prefix}: publication_status=published requires lifecycle_status=published`);
    }
    if (record.lifecycle_status === "published" && publication !== "published") {
      errors.push(`${prefix}: lifecycle_status=published requires publication_status=published`);
    }
  });
  return errors;
}

export async function validateRepository({repoRoot = process.cwd(), checkGit = true, checkDocs = true} = {}) {
  const errors = [];
  const catalogPath = path.join(repoRoot, "docs/knowledge/catalog.jsonl");
  let catalogText;
  try {
    catalogText = await readFile(catalogPath, "utf8");
  } catch {
    return ["docs/knowledge/catalog.jsonl does not exist"];
  }

  const parsed = parseCatalog(catalogText);
  errors.push(...parsed.errors, ...validateCatalogRecords(parsed.records));

  if (checkDocs) {
    const requiredDocs = [
      "docs/knowledge/README.md",
      "docs/knowledge/catalog.schema.json",
      "docs/knowledge/templates/source-card.md",
      "docs/knowledge/agent-retrieval-guide.md",
      "docs/knowledge/product-kb-publishing.md",
    ];
    for (const relativePath of requiredDocs) {
      if (!(await exists(path.join(repoRoot, relativePath)))) errors.push(`${relativePath} does not exist`);
    }
  }

  for (const record of parsed.records) {
    if (!safeRelativePath(record.storage_ref)) {
      errors.push(`${record.document_id}: storage_ref is not a safe relative path`);
      continue;
    }
    if (!safeRelativePath(record.assessment_ref)) {
      errors.push(`${record.document_id}: assessment_ref is not a safe relative path`);
      continue;
    }

    const storagePath = path.join(repoRoot, record.storage_ref);
    const assessmentPath = path.join(repoRoot, record.assessment_ref);
    const storageExists = await exists(storagePath);
    const assessmentExists = await exists(assessmentPath);
    if (!storageExists) errors.push(`${record.document_id}: storage_ref does not exist`);
    if (!assessmentExists) errors.push(`${record.document_id}: assessment_ref does not exist`);

    if (storageExists) {
      const source = await readFile(storagePath);
      const hash = createHash("sha256").update(source).digest("hex");
      if (hash !== record.content_hash_sha256) errors.push(`${record.document_id}: content hash mismatch`);
      const sourceText = source.toString("utf8");
      if (containsCredential(sourceText)) errors.push(`${record.document_id}: storage contains credential-shaped value`);
      if (path.basename(storagePath) === "source-manifest.json") {
        errors.push(...await validateBundleManifest(storagePath, record.document_id));
      }
    }
    if (assessmentExists) {
      const assessment = await readFile(assessmentPath, "utf8");
      if (containsCredential(assessment)) errors.push(`${record.document_id}: assessment contains credential-shaped value`);
    }

    if (checkGit) {
      const tracked = spawnSync("git", ["ls-files", "--error-unmatch", record.storage_ref], {
        cwd: repoRoot,
        encoding: "utf8",
      });
      if (tracked.status === 0) errors.push(`${record.document_id}: private storage_ref is tracked by Git`);
      const ignored = spawnSync("git", ["check-ignore", "-q", record.storage_ref], {
        cwd: repoRoot,
        encoding: "utf8",
      });
      if (ignored.status !== 0) errors.push(`${record.document_id}: private storage_ref is not ignored by Git`);
    }
  }
  return errors;
}

export function findCredentialShapes(text) {
  const matches = [];
  const lines = text.split(/\r?\n/);
  lines.forEach((lineText, index) => {
    for (const {type, pattern} of CREDENTIAL_PATTERNS) {
      if (pattern.test(lineText)) matches.push({type, line: index + 1});
    }
  });
  return matches;
}

function containsCredential(text) {
  return findCredentialShapes(text).length > 0;
}

function isPlainObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function safeRelativePath(value) {
  if (typeof value !== "string" || value === "" || path.isAbsolute(value)) return false;
  const normalized = path.posix.normalize(value.replaceAll("\\", "/"));
  return normalized !== ".." && !normalized.startsWith("../");
}

async function exists(filePath) {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function validateBundleManifest(manifestPath, documentId) {
  const errors = [];
  let manifest;
  try {
    manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  } catch (error) {
    return [`${documentId}: bundle manifest is invalid JSON (${error.message})`];
  }

  if (!Array.isArray(manifest.entries)) {
    return [`${documentId}: bundle manifest entries must be an array`];
  }
  if (manifest.entry_count !== manifest.entries.length) {
    errors.push(`${documentId}: bundle manifest entry_count mismatch`);
  }

  const bundleRoot = path.dirname(manifestPath);
  const extractedRoot = path.join(bundleRoot, "extracted");
  for (const entry of manifest.entries) {
    const entryPath = entry?.path;
    if (!safeRelativePath(entryPath)) {
      errors.push(`${documentId}: bundle entry has an unsafe path`);
      continue;
    }
    if (!/^[a-f0-9]{64}$/.test(entry?.sha256 || "")) {
      errors.push(`${documentId}: bundle entry ${entryPath} has an invalid SHA-256`);
      continue;
    }

    const filePath = path.join(extractedRoot, entryPath);
    if (!(await exists(filePath))) {
      errors.push(`${documentId}: bundle entry ${entryPath} does not exist`);
      continue;
    }
    const source = await readFile(filePath);
    const hash = createHash("sha256").update(source).digest("hex");
    if (hash !== entry.sha256) errors.push(`${documentId}: bundle entry ${entryPath} hash mismatch`);
    if (containsCredential(source.toString("utf8"))) {
      errors.push(`${documentId}: bundle entry ${entryPath} contains credential-shaped value`);
    }
  }

  const archive = manifest.canonical_archive;
  if (!isPlainObject(archive)
    || !safeRelativePath(archive.filename)
    || !/^[a-f0-9]{64}$/.test(archive.sha256 || "")) {
    errors.push(`${documentId}: bundle canonical_archive metadata is invalid`);
  } else {
    const archivePath = path.join(bundleRoot, archive.filename);
    if (!(await exists(archivePath))) {
      errors.push(`${documentId}: bundle canonical archive does not exist`);
    } else {
      const archiveBytes = await readFile(archivePath);
      const archiveHash = createHash("sha256").update(archiveBytes).digest("hex");
      if (archiveHash !== archive.sha256) errors.push(`${documentId}: bundle canonical archive hash mismatch`);
    }
  }

  return errors;
}

const invokedPath = process.argv[1] ? path.resolve(process.argv[1]) : null;
if (invokedPath === fileURLToPath(import.meta.url)) {
  const errors = await validateRepository();
  if (errors.length > 0) {
    for (const error of errors) process.stderr.write(`- ${error}\n`);
    process.exitCode = 1;
  } else {
    process.stdout.write("knowledge catalog validation passed\n");
  }
}
