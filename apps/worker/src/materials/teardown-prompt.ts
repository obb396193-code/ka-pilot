import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";

import {
  MATERIAL_TEARDOWN_SCHEMA_VERSION,
  type MaterialTeardownEvidence,
} from "@ka/domain";

export const TEARDOWN_PROMPT_VERSION = "teardown-v3";
export const TEARDOWN_SOURCE_SHA256 = "fb30d574a0bc93efa9a812a1d894b09725b69650a2cfbe376bc9730eb97cacff";
export const TEARDOWN_TEMPLATE_SHA256 = "e4fa13208cb48dc2276fd29910c5f9c0f1aa7e1fdd18ba96ea3fd4fdf3798adb";
const DEFAULT_MAX_PROMPT_CHARS = 1_000_000;
const templateUrl = new URL("./prompts/teardown-v3.md", import.meta.url);

export class TeardownPromptError extends Error {
  constructor(readonly reason: "unsafe_input" | "prompt_too_large" | "template_drift") {
    super(`Teardown prompt failed: ${reason}`);
    this.name = "TeardownPromptError";
  }
}

export interface TeardownPromptTemplate {
  readonly version: typeof TEARDOWN_PROMPT_VERSION;
  readonly sourceSha256: typeof TEARDOWN_SOURCE_SHA256;
  readonly templateSha256: string;
  readonly content: string;
}

export async function loadTeardownPromptTemplate(): Promise<TeardownPromptTemplate> {
  const content = await readFile(templateUrl, "utf8");
  const templateSha256 = sha256(content);
  if (templateSha256 !== TEARDOWN_TEMPLATE_SHA256) {
    throw new TeardownPromptError("template_drift");
  }
  return Object.freeze({
    version: TEARDOWN_PROMPT_VERSION,
    sourceSha256: TEARDOWN_SOURCE_SHA256,
    templateSha256,
    content,
  });
}

export async function renderTeardownPrompt(input: {
  readonly evidence: MaterialTeardownEvidence;
  readonly maxPromptChars?: number;
}): Promise<{
  readonly prompt: string;
  readonly promptVersion: string;
  readonly promptTemplateSha256: string;
}> {
  const template = await loadTeardownPromptTemplate();
  if (
    input.evidence.promptVersion !== template.version ||
    input.evidence.schemaVersion !== MATERIAL_TEARDOWN_SCHEMA_VERSION
  ) throw new TeardownPromptError("template_drift");
  const maxPromptChars = positiveInteger(input.maxPromptChars ?? DEFAULT_MAX_PROMPT_CHARS);
  const evidenceJson = JSON.stringify(canonicalPromptEvidence(input.evidence));
  if (containsCredentialLikeValue(evidenceJson)) throw new TeardownPromptError("unsafe_input");
  const prompt = [
    template.content.trimEnd(),
    "",
    "# Runtime evidence",
    "",
    `Prompt version: ${template.version}`,
    `Evidence fingerprint: ${input.evidence.fingerprint}`,
    "Visual payload status: blocked_pending_trusted_multimodal_provider",
    "",
    "```json",
    evidenceJson,
    "```",
  ].join("\n");
  if (prompt.length > maxPromptChars) throw new TeardownPromptError("prompt_too_large");
  return Object.freeze({
    prompt,
    promptVersion: template.version,
    promptTemplateSha256: template.templateSha256,
  });
}

function canonicalPromptEvidence(evidence: MaterialTeardownEvidence): Record<string, unknown> {
  return {
    media: evidence.media,
    transcriptEvidence: evidence.transcriptEvidence,
    shotEvidence: evidence.shotEvidence,
    visualSummary: evidence.visualSummary,
    schemaVersion: evidence.schemaVersion,
  };
}

function containsCredentialLikeValue(value: string): boolean {
  return /(?:[?&](?:token|signature|auth|key)=|bearer\s+|\b(?:sk-|mul_|mcn_)[a-z0-9_-]+)/i.test(value);
}

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function positiveInteger(value: number): number {
  if (!Number.isInteger(value) || value <= 0) throw new TeardownPromptError("prompt_too_large");
  return value;
}
