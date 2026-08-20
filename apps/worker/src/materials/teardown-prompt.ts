import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";

import type { MaterialTeardownEvidence } from "@ka/domain";

export const TEARDOWN_PROMPT_VERSION = "teardown-v1";
export const TEARDOWN_SOURCE_SHA256 = "fb30d574a0bc93efa9a812a1d894b09725b69650a2cfbe376bc9730eb97cacff";
export const TEARDOWN_TEMPLATE_SHA256 = "3a49cc43e1400be6cdb9d346ff5ddaded1a4b812ce794231f77d1c2df6403de3";
const DEFAULT_MAX_PROMPT_CHARS = 1_000_000;
const templateUrl = new URL("./prompts/teardown-v1.md", import.meta.url);

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
