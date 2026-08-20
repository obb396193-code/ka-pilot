import type { CloudAsrPort } from "@ka/domain";

const MAX_TRANSCRIPT_CHARS = 200_000;
const MAX_MEDIA_DURATION_MS = 24 * 60 * 60 * 1_000;
const MAX_MEDIA_HANDLE_CHARS = 4_096;
const SAFE_PROVIDER_VALUE = /^[A-Za-z0-9._:/-]{1,200}$/;
const SAFE_SHA256 = /^[a-f0-9]{64}$/;

export type WholeTextCloudAsrFailureReason =
  | "invalid_config"
  | "invalid_input"
  | "transport_failed"
  | "invalid_output";

export class WholeTextCloudAsrError extends Error {
  constructor(readonly reason: WholeTextCloudAsrFailureReason) {
    super(`Whole-text cloud ASR failed: ${reason}`);
    this.name = "WholeTextCloudAsrError";
  }
}

export interface WholeTextAsrTransportInput {
  readonly mediaHandle: string;
  readonly mediaContentSha256: string;
  readonly durationMs: number;
  readonly providerId: string;
  readonly model: string;
  readonly profileVersion: string;
}

export interface WholeTextAsrTransport {
  transcribe(input: WholeTextAsrTransportInput): Promise<unknown>;
}

/**
 * Adapts the verified IdeaLab-style `{ text }` response to the domain's
 * whole-video transcript contract. Network/auth wiring stays outside so this
 * module does not guess an unverified provider endpoint or credential shape.
 */
export class WholeTextCloudAsrAdapter implements CloudAsrPort {
  private readonly transport: WholeTextAsrTransport;
  private readonly providerId: string;
  private readonly model: string;
  private readonly profileVersion: string;

  constructor(options: {
    readonly transport: WholeTextAsrTransport;
    readonly providerId: string;
    readonly model: string;
    readonly profileVersion: string;
  }) {
    if (
      typeof options.transport?.transcribe !== "function" ||
      !SAFE_PROVIDER_VALUE.test(options.providerId) ||
      !SAFE_PROVIDER_VALUE.test(options.model) ||
      !SAFE_SHA256.test(options.profileVersion)
    ) {
      throw new WholeTextCloudAsrError("invalid_config");
    }
    this.transport = options.transport;
    this.providerId = options.providerId;
    this.model = options.model;
    this.profileVersion = options.profileVersion;
  }

  async transcribe(input: {
    readonly mediaContentSha256: string;
    readonly mediaHandle: string;
    readonly durationMs: number;
  }): Promise<Readonly<{ kind: "whole_text"; text: string }>> {
    assertSafeInput(input);
    let response: unknown;
    try {
      response = await this.transport.transcribe({
        ...input,
        providerId: this.providerId,
        model: this.model,
        profileVersion: this.profileVersion,
      });
    } catch {
      throw new WholeTextCloudAsrError("transport_failed");
    }
    return Object.freeze({ kind: "whole_text", text: parseWholeText(response) });
  }
}

function assertSafeInput(input: {
  readonly mediaContentSha256: string;
  readonly mediaHandle: string;
  readonly durationMs: number;
}): void {
  if (
    !SAFE_SHA256.test(input.mediaContentSha256) ||
    input.mediaHandle.trim() === "" ||
    input.mediaHandle.length > MAX_MEDIA_HANDLE_CHARS ||
    hasUnsafeControlCharacter(input.mediaHandle) ||
    !Number.isSafeInteger(input.durationMs) ||
    input.durationMs <= 0 ||
    input.durationMs > MAX_MEDIA_DURATION_MS
  ) {
    throw new WholeTextCloudAsrError("invalid_input");
  }
}

function parseWholeText(value: unknown): string {
  const text = readStrictTextProperty(value).trim();
  if (text === "" || text.length > MAX_TRANSCRIPT_CHARS || hasUnsafeControlCharacter(text)) {
    throw new WholeTextCloudAsrError("invalid_output");
  }
  return text;
}

function readStrictTextProperty(value: unknown): string {
  if (!isPlainRecord(value)) throw new WholeTextCloudAsrError("invalid_output");
  const descriptors = Object.getOwnPropertyDescriptors(value);
  const textDescriptor = descriptors.text;
  if (
    Object.keys(descriptors).length !== 1 ||
    textDescriptor?.get !== undefined ||
    textDescriptor?.set !== undefined ||
    typeof textDescriptor?.value !== "string"
  ) {
    throw new WholeTextCloudAsrError("invalid_output");
  }
  return textDescriptor.value;
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function hasUnsafeControlCharacter(value: string): boolean {
  for (const character of value) {
    const code = character.charCodeAt(0);
    if (code < 32 && ![9, 10, 13].includes(code)) return true;
  }
  return false;
}
