import { IdeaLabAsrTransportError } from "./idealab-asr-errors.js";

const MAX_TEXT_CHARACTERS = 200_000;
const RESPONSE_KEYS = new Set(["text", "usage"]);
const USAGE_KEYS = new Set([
  "prompt_tokens",
  "completion_tokens",
  "total_tokens",
  "cacheReadInputTokensCompatible",
]);

export interface IdeaLabAsrUsage {
  readonly promptTokens: number;
  readonly completionTokens: number;
  readonly totalTokens: number;
  readonly cacheReadInputTokensCompatible: number;
}

export interface ParsedIdeaLabAsrResponse {
  readonly text: string;
  readonly usage: IdeaLabAsrUsage;
}

export async function readBoundedIdeaLabJson(
  response: Response,
  maximumBytes: number,
): Promise<unknown> {
  if (response.body === null) throw invalidResponse(response.status);
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > maximumBytes) {
        await reader.cancel();
        throw invalidResponse(response.status);
      }
      chunks.push(value);
    }
  } catch (error) {
    if (error instanceof IdeaLabAsrTransportError) throw error;
    throw invalidResponse(response.status);
  }
  return parseJson(combine(chunks, total), response.status);
}

export function parseIdeaLabAsrResponse(value: unknown): ParsedIdeaLabAsrResponse {
  const response = strictRecord(value, RESPONSE_KEYS);
  const text = safeText(response.text);
  const usage = strictRecord(response.usage, USAGE_KEYS);
  const parsedUsage = Object.freeze({
    promptTokens: nonnegativeInteger(usage.prompt_tokens),
    completionTokens: nonnegativeInteger(usage.completion_tokens),
    totalTokens: nonnegativeInteger(usage.total_tokens),
    cacheReadInputTokensCompatible: nonnegativeInteger(usage.cacheReadInputTokensCompatible),
  });
  if (parsedUsage.totalTokens < parsedUsage.promptTokens + parsedUsage.completionTokens) {
    throw invalidResponse();
  }
  return Object.freeze({ text, usage: parsedUsage });
}

function combine(chunks: readonly Uint8Array[], total: number): Uint8Array {
  const combined = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    combined.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return combined;
}

function parseJson(bytes: Uint8Array, status: number): unknown {
  try {
    return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)) as unknown;
  } catch {
    throw invalidResponse(status);
  }
}

function strictRecord(value: unknown, allowedKeys: ReadonlySet<string>): Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) throw invalidResponse();
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) throw invalidResponse();
  const descriptors = Object.getOwnPropertyDescriptors(value);
  const keys = Object.keys(descriptors);
  if (
    keys.length !== allowedKeys.size ||
    keys.some((key) => !allowedKeys.has(key)) ||
    keys.some((key) => descriptors[key]?.get !== undefined || descriptors[key]?.set !== undefined)
  ) {
    throw invalidResponse();
  }
  return value as Record<string, unknown>;
}

function safeText(value: unknown): string {
  if (typeof value !== "string") throw invalidResponse();
  const text = value.trim();
  if (text === "" || text.length > MAX_TEXT_CHARACTERS || hasUnsafeControlCharacter(text)) {
    throw invalidResponse();
  }
  return text;
}

function nonnegativeInteger(value: unknown): number {
  if (!Number.isSafeInteger(value) || (value as number) < 0) throw invalidResponse();
  return value as number;
}

function hasUnsafeControlCharacter(value: string): boolean {
  for (const character of value) {
    const code = character.charCodeAt(0);
    if (code < 32 && ![9, 10, 13].includes(code)) return true;
  }
  return false;
}

function invalidResponse(status?: number): IdeaLabAsrTransportError {
  return new IdeaLabAsrTransportError("invalid_response", status);
}
