import { createHash } from "node:crypto";

export const KNOWLEDGE_DOCUMENT_VERSION = "b8-knowledge-document-v1" as const;

export type KnowledgeJsonPrimitive = null | boolean | number | string;
export type KnowledgeJsonValue =
  | KnowledgeJsonPrimitive
  | readonly KnowledgeJsonValue[]
  | KnowledgeJsonObject;

export interface KnowledgeJsonObject {
  readonly [key: string]: KnowledgeJsonValue;
}

export interface KnowledgeDocumentEnvelope extends KnowledgeJsonObject {
  readonly blocks: readonly KnowledgeJsonValue[];
}

export interface KnowledgeDocumentLimits {
  maxBytes: number;
  maxDepth: number;
  maxNodes: number;
  maxBlocks: number;
  maxStringBytes: number;
}

export const DEFAULT_KNOWLEDGE_DOCUMENT_LIMITS: Readonly<KnowledgeDocumentLimits> = Object.freeze({
  maxBytes: 1_000_000,
  maxDepth: 32,
  maxNodes: 20_000,
  maxBlocks: 2_000,
  maxStringBytes: 200_000,
});

export type KnowledgeDocumentErrorCode =
  | "invalid_envelope"
  | "invalid_json"
  | "cyclic_value"
  | "unsafe_key"
  | "resource_limit";

export class KnowledgeDocumentValidationError extends Error {
  readonly code: KnowledgeDocumentErrorCode;

  constructor(code: KnowledgeDocumentErrorCode, message: string) {
    super(message);
    this.name = "KnowledgeDocumentValidationError";
    this.code = code;
  }
}

interface CloneState {
  limits: KnowledgeDocumentLimits;
  ancestors: WeakSet<object>;
  nodes: number;
}

const UNSAFE_KEYS = new Set(["__proto__", "constructor", "prototype"]);

export function parseKnowledgeDocument(
  input: unknown,
  options: Partial<KnowledgeDocumentLimits> = {},
): KnowledgeDocumentEnvelope {
  const limits = resolveLimits(options);
  if (!isPlainRecord(input)) {
    throw invalidEnvelope("knowledge document must be an object");
  }
  const keys = Object.keys(input);
  if (keys.length !== 1 || keys[0] !== "blocks" || !Array.isArray(input.blocks)) {
    throw invalidEnvelope("knowledge document must contain only an array field named blocks");
  }
  if (input.blocks.length > limits.maxBlocks) {
    throw resourceLimit("knowledge document exceeds the blocks limit");
  }

  const state: CloneState = { limits, ancestors: new WeakSet(), nodes: 0 };
  const cloned = cloneJsonValue(input, 0, state);
  if (!isPlainRecord(cloned) || !Array.isArray(cloned.blocks)) {
    throw invalidEnvelope("knowledge document envelope could not be preserved");
  }
  const envelope = cloned as unknown as KnowledgeDocumentEnvelope;
  if (Buffer.byteLength(JSON.stringify(envelope), "utf8") > limits.maxBytes) {
    throw resourceLimit("knowledge document exceeds the serialized bytes limit");
  }
  return envelope;
}

export function projectKnowledgeDocumentText(document: KnowledgeDocumentEnvelope): string | null {
  const parts: string[] = [];
  for (const block of document.blocks) collectSearchableText(block, parts);
  return parts.length === 0 ? null : parts.join("\n");
}

export function fingerprintKnowledgeDocument(document: KnowledgeDocumentEnvelope): string {
  return createHash("sha256")
    .update(`${KNOWLEDGE_DOCUMENT_VERSION}\0`)
    .update(canonicalJson(document))
    .digest("hex");
}

function resolveLimits(options: Partial<KnowledgeDocumentLimits>): KnowledgeDocumentLimits {
  const limits = { ...DEFAULT_KNOWLEDGE_DOCUMENT_LIMITS, ...options };
  for (const [name, value] of Object.entries(limits)) {
    if (!Number.isSafeInteger(value) || value <= 0) {
      throw resourceLimit(`knowledge document ${name} must be a positive safe integer`);
    }
  }
  return limits;
}

function cloneJsonValue(value: unknown, depth: number, state: CloneState): KnowledgeJsonValue {
  countNode(depth, state);
  if (value === null || typeof value === "boolean") return value;
  if (typeof value === "string") return cloneString(value, state.limits);
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw invalidJson("knowledge document JSON numbers must be finite");
    return value;
  }
  if (Array.isArray(value)) return cloneArray(value, depth, state);
  if (isPlainRecord(value)) return cloneObject(value, depth, state);
  throw invalidJson("knowledge document contains a non-JSON value");
}

function countNode(depth: number, state: CloneState): void {
  if (depth > state.limits.maxDepth) {
    throw resourceLimit("knowledge document exceeds the depth limit");
  }
  state.nodes += 1;
  if (state.nodes > state.limits.maxNodes) {
    throw resourceLimit("knowledge document exceeds the nodes limit");
  }
}

function cloneString(value: string, limits: KnowledgeDocumentLimits): string {
  if (Buffer.byteLength(value, "utf8") > limits.maxStringBytes) {
    throw resourceLimit("knowledge document exceeds the string bytes limit");
  }
  return value;
}

function cloneArray(value: unknown[], depth: number, state: CloneState): readonly KnowledgeJsonValue[] {
  enterContainer(value, state);
  try {
    assertPlainArray(value);
    return Object.freeze(value.map((item) => cloneJsonValue(item, depth + 1, state)));
  } finally {
    state.ancestors.delete(value);
  }
}

function cloneObject(
  value: Record<string, unknown>,
  depth: number,
  state: CloneState,
): KnowledgeJsonObject {
  enterContainer(value, state);
  try {
    const result: Record<string, KnowledgeJsonValue> = {};
    for (const key of safeEnumerableKeys(value)) {
      result[key] = cloneJsonValue(value[key], depth + 1, state);
    }
    return Object.freeze(result);
  } finally {
    state.ancestors.delete(value);
  }
}

function enterContainer(value: object, state: CloneState): void {
  if (state.ancestors.has(value)) {
    throw new KnowledgeDocumentValidationError(
      "cyclic_value",
      "knowledge document contains a cyclic value",
    );
  }
  state.ancestors.add(value);
}

function assertPlainArray(value: unknown[]): void {
  if (Object.getOwnPropertySymbols(value).length > 0) {
    throw invalidJson("knowledge document arrays cannot contain symbol properties");
  }
  for (let index = 0; index < value.length; index += 1) {
    if (!Object.prototype.hasOwnProperty.call(value, index)) {
      throw invalidJson("knowledge document arrays cannot contain holes");
    }
  }
  const expectedKeys = new Set(Array.from({ length: value.length }, (_, index) => String(index)));
  if (Object.keys(value).some((key) => !expectedKeys.has(key))) {
    throw invalidJson("knowledge document arrays cannot contain custom properties");
  }
}

function safeEnumerableKeys(value: Record<string, unknown>): readonly string[] {
  if (Object.getOwnPropertySymbols(value).length > 0) {
    throw invalidJson("knowledge document objects cannot contain symbol properties");
  }
  const descriptors = Object.getOwnPropertyDescriptors(value);
  const keys = Object.keys(value);
  if (Reflect.ownKeys(descriptors).length !== keys.length) {
    throw invalidJson("knowledge document objects must contain only enumerable string fields");
  }
  for (const key of keys) {
    if (UNSAFE_KEYS.has(key)) {
      throw new KnowledgeDocumentValidationError(
        "unsafe_key",
        "knowledge document contains an unsafe key",
      );
    }
    const descriptor = descriptors[key];
    if (!descriptor || !("value" in descriptor)) {
      throw invalidJson("knowledge document objects cannot contain accessors");
    }
  }
  return keys;
}

function collectSearchableText(value: KnowledgeJsonValue, parts: string[]): void {
  if (Array.isArray(value)) {
    for (const item of value) collectSearchableText(item, parts);
    return;
  }
  if (!isKnowledgeObject(value)) return;

  if (value.type === "wikilink" && isKnowledgeObject(value.props)) {
    appendText(value.props.title, parts);
  }
  for (const [key, child] of Object.entries(value)) {
    if (key === "text") appendText(child, parts);
    else collectSearchableText(child, parts);
  }
}

function appendText(value: KnowledgeJsonValue | undefined, parts: string[]): void {
  if (typeof value !== "string") return;
  const normalized = value.trim();
  if (normalized !== "") parts.push(normalized);
}

function canonicalJson(value: KnowledgeJsonValue): string {
  if (value === null || typeof value === "boolean" || typeof value === "number") {
    return JSON.stringify(value);
  }
  if (typeof value === "string") return JSON.stringify(value);
  if (isKnowledgeArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  return `{${Object.keys(value)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key]!)}`)
    .join(",")}}`;
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function isKnowledgeObject(value: unknown): value is KnowledgeJsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isKnowledgeArray(value: KnowledgeJsonValue): value is readonly KnowledgeJsonValue[] {
  return Array.isArray(value);
}

function invalidEnvelope(message: string): KnowledgeDocumentValidationError {
  return new KnowledgeDocumentValidationError("invalid_envelope", message);
}

function invalidJson(message: string): KnowledgeDocumentValidationError {
  return new KnowledgeDocumentValidationError("invalid_json", message);
}

function resourceLimit(message: string): KnowledgeDocumentValidationError {
  return new KnowledgeDocumentValidationError("resource_limit", message);
}
