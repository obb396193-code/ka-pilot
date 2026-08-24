import { describe, expect, it } from "vitest";

import {
  CredentialEnvelopeError,
  openCredentialEnvelope,
  sealCredentialEnvelope,
  type CredentialEnvelopeBinding,
} from "../../src/agent/gateway/credential-envelope.js";

const envelopeKey = Buffer.alloc(32, 9).toString("base64");
const otherKey = Buffer.alloc(32, 8).toString("base64");
const now = new Date("2026-08-19T10:00:00.000Z");
const binding: CredentialEnvelopeBinding = {
  workspaceId: "workspace-alpha",
  userId: "user-alpha",
  runId: "run-alpha",
  providerId: "idealab-primary",
  model: "model-alpha",
};

describe("short-lived credential envelope", () => {
  it("round-trips a credential without exposing plaintext in the token", () => {
    const credential = "provider-key-must-stay-private";
    const token = sealCredentialEnvelope({ ...binding, credential }, envelopeKey, {
      now,
      ttlMs: 5 * 60_000,
    });
    expect(token.startsWith("kae1.")).toBe(true);
    expect(token).not.toContain(credential);
    expect(token).not.toContain(envelopeKey);
    expect(openCredentialEnvelope(token, envelopeKey, { expected: binding, now })).toMatchObject({
      ...binding,
      credential,
      issuedAt: now.toISOString(),
      expiresAt: "2026-08-19T10:05:00.000Z",
    });
  });

  it.each([
    ["workspaceId", "workspace-beta"],
    ["userId", "user-beta"],
    ["runId", "run-beta"],
    ["providerId", "provider-beta"],
    ["model", "model-beta"],
  ] as const)("rejects a changed %s binding", (field, value) => {
    const token = sealCredentialEnvelope({ ...binding, credential: "private-key" }, envelopeKey, {
      now,
    });
    expectEnvelopeError(
      () =>
        openCredentialEnvelope(token, envelopeKey, {
          expected: { ...binding, [field]: value },
          now,
        }),
      "binding_mismatch",
    );
  });

  it("rejects expiration, future issuance, a wrong key and truncation", () => {
    const token = sealCredentialEnvelope({ ...binding, credential: "private-key" }, envelopeKey, {
      now,
      ttlMs: 60_000,
    });
    expectEnvelopeError(
      () =>
        openCredentialEnvelope(token, envelopeKey, {
          expected: binding,
          now: new Date("2026-08-19T10:01:00.000Z"),
        }),
      "expired",
    );
    const future = sealCredentialEnvelope(
      { ...binding, credential: "private-key" },
      envelopeKey,
      { now: new Date("2026-08-19T10:01:00.000Z") },
    );
    expectEnvelopeError(
      () => openCredentialEnvelope(future, envelopeKey, { expected: binding, now }),
      "not_yet_valid",
    );
    expectEnvelopeError(
      () => openCredentialEnvelope(token, otherKey, { expected: binding, now }),
      "invalid_token",
    );
    expectEnvelopeError(
      () => openCredentialEnvelope(token.slice(0, -8), envelopeKey, { expected: binding, now }),
      "invalid_token",
    );
  });

  it("does not allow a token to be replayed as another Run", () => {
    const token = sealCredentialEnvelope({ ...binding, credential: "private-key" }, envelopeKey, {
      now,
    });
    expectEnvelopeError(
      () =>
        openCredentialEnvelope(token, envelopeKey, {
          expected: { ...binding, runId: "run-other" },
          now,
        }),
      "binding_mismatch",
    );
  });
});

function expectEnvelopeError(operation: () => unknown, code: CredentialEnvelopeError["code"]): void {
  try {
    operation();
    throw new Error("Expected credential envelope operation to fail");
  } catch (error) {
    expect(error).toBeInstanceOf(CredentialEnvelopeError);
    expect(error).toMatchObject({ code, message: `ka_credential_${code}` });
    expect(String(error)).not.toContain("private-key");
    expect(String(error)).not.toContain(envelopeKey);
  }
}
