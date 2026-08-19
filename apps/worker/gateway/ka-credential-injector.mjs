import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
  timingSafeEqual,
} from "node:crypto";
import { Buffer } from "node:buffer";
import process from "node:process";

const PREFIX = "kae1";
const AAD = Buffer.from("ka-provider-credential-envelope:v1", "utf8");
const DEFAULT_TTL_MS = 5 * 60_000;
const MAX_TTL_MS = 5 * 60_000;
const CLOCK_SKEW_MS = 30_000;
const MAX_TOKEN_LENGTH = 32_000;
const BINDING_FIELDS = ["workspaceId", "userId", "runId", "providerId", "model"];

export class CredentialEnvelopeError extends Error {
  constructor(code) {
    super(`ka_credential_${code}`);
    this.name = "CredentialEnvelopeError";
    this.code = code;
  }
}

export function sealCredentialEnvelope(input, encodedKey, options = {}) {
  const key = decodeKey(encodedKey);
  validateClaimsInput(input);
  const issuedAtMs = readNow(options.now).getTime();
  const ttlMs = options.ttlMs ?? DEFAULT_TTL_MS;
  if (!Number.isSafeInteger(ttlMs) || ttlMs <= 0 || ttlMs > MAX_TTL_MS) {
    throw new CredentialEnvelopeError("invalid_token");
  }
  const claims = {
    workspaceId: input.workspaceId,
    userId: input.userId,
    runId: input.runId,
    providerId: input.providerId,
    model: input.model,
    credential: input.credential,
    issuedAt: new Date(issuedAtMs).toISOString(),
    expiresAt: new Date(issuedAtMs + ttlMs).toISOString(),
  };
  const nonce = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, nonce);
  cipher.setAAD(AAD);
  const ciphertext = Buffer.concat([
    cipher.update(JSON.stringify(claims), "utf8"),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();
  return [PREFIX, nonce.toString("base64url"), ciphertext.toString("base64url"), tag.toString("base64url")].join(".");
}

export function openCredentialEnvelope(token, encodedKey, options) {
  try {
    const key = decodeKey(encodedKey);
    const claims = decryptClaims(token, key);
    validateDecryptedClaims(claims, options, readNow(options.now));
    return claims;
  } catch (error) {
    if (error instanceof CredentialEnvelopeError) throw error;
    throw new CredentialEnvelopeError("invalid_token");
  }
}

export function createKaCredentialProviderHook(options) {
  decodeKey(options.envelopeKey);
  const hook = {
    key: "ka-credential-injector",
    async authenticate(input) {
      try {
        const headers = input.request?.headers ?? {};
        const actualProviderId = requiredString(input.targetProviderConfig?.name ?? input.targetProvider);
        const actualModel = requiredString(input.model ?? readHeader(headers, "x-ka-model"));
        const expected = {
          workspaceId: requiredHeader(headers, "x-ka-workspace-id"),
          userId: requiredHeader(headers, "x-ka-user-id"),
          runId: requiredHeader(headers, "x-ka-run-id"),
          providerId: requiredHeader(headers, "x-ka-provider-id"),
          model: requiredHeader(headers, "x-ka-model"),
        };
        if (expected.providerId !== actualProviderId || expected.model !== actualModel) {
          throw new CredentialEnvelopeError("binding_mismatch");
        }
        const claims = openCredentialEnvelope(
          requiredHeader(headers, "x-ka-credential-envelope"),
          options.envelopeKey,
          { expected, now: options.now() },
        );
        const upstreamHeaders = sanitizeUpstreamHeaders(input.upstreamRequest.headers);
        const providerType = String(input.targetProviderConfig?.type ?? input.targetProvider ?? "");
        if (providerType.startsWith("anthropic")) {
          upstreamHeaders["x-api-key"] = claims.credential;
        } else {
          upstreamHeaders.authorization = `Bearer ${claims.credential}`;
        }
        return {
          ok: true,
          value: { ...input.upstreamRequest, headers: upstreamHeaders },
        };
      } catch (error) {
        return {
          ok: false,
          error:
            error instanceof CredentialEnvelopeError
              ? error.message
              : "ka_credential_invalid_token",
        };
      }
    },
  };
  if (options.providerName) hook.providerName = options.providerName;
  return hook;
}

export function createGatewayPlugin({ plugin } = {}) {
  const envelopeKey = process.env.MODEL_GATEWAY_ENVELOPE_KEY_BASE64;
  if (!envelopeKey) throw new Error("ka_credential_invalid_config");
  return {
    providerHooks: [
      createKaCredentialProviderHook({
        envelopeKey,
        now: () => new Date(),
        providerName: plugin?.match?.providerName,
      }),
    ],
  };
}

function decryptClaims(token, key) {
  if (typeof token !== "string" || token.length === 0 || token.length > MAX_TOKEN_LENGTH) {
    throw new CredentialEnvelopeError("invalid_token");
  }
  const parts = token.split(".");
  if (parts.length !== 4 || parts[0] !== PREFIX) {
    throw new CredentialEnvelopeError("invalid_token");
  }
  const nonce = decodeBase64Url(parts[1]);
  const ciphertext = decodeBase64Url(parts[2]);
  const tag = decodeBase64Url(parts[3]);
  if (nonce.byteLength !== 12 || tag.byteLength !== 16 || ciphertext.byteLength === 0) {
    throw new CredentialEnvelopeError("invalid_token");
  }
  const decipher = createDecipheriv("aes-256-gcm", key, nonce);
  decipher.setAAD(AAD);
  decipher.setAuthTag(tag);
  const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8");
  return JSON.parse(plaintext);
}

function validateDecryptedClaims(claims, options, now) {
  validateClaimsInput(claims);
  if (!options || !options.expected) throw new CredentialEnvelopeError("invalid_token");
  const issuedAtMs = parseCanonicalTimestamp(claims.issuedAt);
  const expiresAtMs = parseCanonicalTimestamp(claims.expiresAt);
  if (expiresAtMs <= issuedAtMs || expiresAtMs - issuedAtMs > MAX_TTL_MS) {
    throw new CredentialEnvelopeError("invalid_token");
  }
  if (issuedAtMs > now.getTime() + CLOCK_SKEW_MS) {
    throw new CredentialEnvelopeError("not_yet_valid");
  }
  if (expiresAtMs <= now.getTime()) {
    throw new CredentialEnvelopeError("expired");
  }
  for (const field of BINDING_FIELDS) {
    if (!safeStringEqual(claims[field], options.expected[field])) {
      throw new CredentialEnvelopeError("binding_mismatch");
    }
  }
}

function validateClaimsInput(input) {
  if (!input || typeof input !== "object") throw new CredentialEnvelopeError("invalid_token");
  for (const field of [...BINDING_FIELDS, "credential"]) {
    const value = input[field];
    if (typeof value !== "string" || value.trim() === "" || value.length > 16_000) {
      throw new CredentialEnvelopeError("invalid_token");
    }
  }
}

function decodeKey(encodedKey) {
  if (typeof encodedKey !== "string") throw new CredentialEnvelopeError("invalid_token");
  const key = Buffer.from(encodedKey, "base64");
  if (key.byteLength !== 32 || key.toString("base64") !== encodedKey) {
    throw new CredentialEnvelopeError("invalid_token");
  }
  return key;
}

function decodeBase64Url(value) {
  if (typeof value !== "string" || value === "") throw new CredentialEnvelopeError("invalid_token");
  const decoded = Buffer.from(value, "base64url");
  if (decoded.toString("base64url") !== value) throw new CredentialEnvelopeError("invalid_token");
  return decoded;
}

function parseCanonicalTimestamp(value) {
  if (typeof value !== "string") throw new CredentialEnvelopeError("invalid_token");
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp) || new Date(timestamp).toISOString() !== value) {
    throw new CredentialEnvelopeError("invalid_token");
  }
  return timestamp;
}

function readNow(value) {
  const now = value instanceof Date ? value : new Date();
  if (!Number.isFinite(now.getTime())) throw new CredentialEnvelopeError("invalid_token");
  return now;
}

function safeStringEqual(left, right) {
  if (typeof left !== "string" || typeof right !== "string") return false;
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
}

function requiredHeader(headers, name) {
  return requiredString(readHeader(headers, name));
}

function readHeader(headers, name) {
  const match = Object.entries(headers).find(([key]) => key.toLowerCase() === name);
  if (!match || Array.isArray(match[1])) return undefined;
  return match[1];
}

function requiredString(value) {
  if (typeof value !== "string" || value.trim() === "") {
    throw new CredentialEnvelopeError("invalid_token");
  }
  return value;
}

function sanitizeUpstreamHeaders(headers) {
  const sanitized = {};
  for (const [key, value] of Object.entries(headers ?? {})) {
    const normalized = key.toLowerCase();
    if (
      normalized === "authorization" ||
      normalized === "proxy-authorization" ||
      normalized === "x-api-key" ||
      normalized === "api-key" ||
      normalized.startsWith("x-ka-")
    ) {
      continue;
    }
    sanitized[normalized] = String(value);
  }
  return sanitized;
}
