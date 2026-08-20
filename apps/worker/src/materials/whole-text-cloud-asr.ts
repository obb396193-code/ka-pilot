import type { CloudAsrPort } from "@ka/domain";

const MAX_TRANSCRIPT_CHARS = 200_000;
const SAFE_PROVIDER_VALUE = /^[A-Za-z0-9._:/-]{1,200}$/;
const SAFE_SHA256 = /^[a-f0-9]{64}$/;

export type WholeTextCloudAsrFailureReason =
  | "invalid_config"
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

function parseWholeText(value: unknown): string {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new WholeTextCloudAsrError("invalid_output");
  }
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) {
    throw new WholeTextCloudAsrError("invalid_output");
  }
  const descriptors = Object.getOwnPropertyDescriptors(value);
  if (
    Object.keys(descriptors).length !== 1 ||
    descriptors.text?.get !== undefined ||
    descriptors.text?.set !== undefined ||
    typeof descriptors.text?.value !== "string"
  ) {
    throw new WholeTextCloudAsrError("invalid_output");
  }
  const text = descriptors.text.value.trim();
  if (text === "" || text.length > MAX_TRANSCRIPT_CHARS || hasUnsafeControlCharacter(text)) {
    throw new WholeTextCloudAsrError("invalid_output");
  }
  return text;
}

function hasUnsafeControlCharacter(value: string): boolean {
  for (const character of value) {
    const code = character.charCodeAt(0);
    if (code < 32 && ![9, 10, 13].includes(code)) return true;
  }
  return false;
}
