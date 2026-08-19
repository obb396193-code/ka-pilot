import { describe, expect, it } from "vitest";

import { sealCredentialEnvelope } from "../../src/agent/gateway/credential-envelope.js";
import { createKaCredentialProviderHook } from "../../gateway/ka-credential-injector.mjs";

const envelopeKey = Buffer.alloc(32, 5).toString("base64");
const now = new Date("2026-08-19T10:00:00.000Z");
const binding = {
  workspaceId: "workspace-alpha",
  userId: "user-alpha",
  runId: "run-alpha",
  providerId: "idealab-primary",
  model: "model-alpha",
};

describe("KA gateway credential injector", () => {
  it("injects an OpenAI-compatible credential and strips internal headers", async () => {
    const hook = createKaCredentialProviderHook({ envelopeKey, now: () => now });
    const token = sealCredentialEnvelope(
      { ...binding, credential: "idealab-private-key" },
      envelopeKey,
      { now },
    );
    const input = gatewayInput(token, "openai_chat_completions");
    const result = await hook.authenticate!(input);
    expect(result).toEqual({
      ok: true,
      value: {
        ...input.upstreamRequest,
        headers: {
          "content-type": "application/json",
          authorization: "Bearer idealab-private-key",
        },
      },
    });
    expect(input.upstreamRequest.headers.authorization).toBe("Bearer gateway-placeholder");
  });

  it("injects Anthropic x-api-key without forwarding gateway or KA headers", async () => {
    const hook = createKaCredentialProviderHook({ envelopeKey, now: () => now });
    const token = sealCredentialEnvelope(
      { ...binding, providerId: "anthropic-secondary", credential: "anthropic-private-key" },
      envelopeKey,
      { now },
    );
    const input = gatewayInput(token, "anthropic_messages", "anthropic-secondary");
    const result = await hook.authenticate!(input);
    expect(result).toMatchObject({
      ok: true,
      value: {
        headers: {
          "content-type": "application/json",
          "x-api-key": "anthropic-private-key",
        },
      },
    });
    if (result.ok) {
      expect(Object.keys(result.value.headers).some((key) => key.startsWith("x-ka-"))).toBe(false);
      expect(result.value.headers.authorization).toBeUndefined();
    }
  });

  it("fails closed before upstream when provider or token binding is wrong", async () => {
    const hook = createKaCredentialProviderHook({ envelopeKey, now: () => now });
    const token = sealCredentialEnvelope(
      { ...binding, credential: "idealab-private-key" },
      envelopeKey,
      { now },
    );
    const wrongProvider = gatewayInput(token, "openai_chat_completions", "provider-other");
    expect(await hook.authenticate!(wrongProvider)).toEqual({
      ok: false,
      error: "ka_credential_binding_mismatch",
    });
    const invalidToken = gatewayInput(`${token}broken`, "openai_chat_completions");
    const result = await hook.authenticate!(invalidToken);
    expect(result).toEqual({ ok: false, error: "ka_credential_invalid_token" });
    expect(JSON.stringify(result)).not.toContain(token);
    expect(JSON.stringify(result)).not.toContain("idealab-private-key");
  });
});

function gatewayInput(
  token: string,
  type: "openai_chat_completions" | "anthropic_messages",
  providerName = binding.providerId,
) {
  return {
    request: {
      headers: {
        "x-ka-credential-envelope": token,
        "x-ka-workspace-id": binding.workspaceId,
        "x-ka-user-id": binding.userId,
        "x-ka-run-id": binding.runId,
        "x-ka-provider-id": providerName,
        "x-ka-model": binding.model,
      },
    },
    targetProvider: type.startsWith("anthropic") ? "anthropic" : "openai",
    targetProviderConfig: { name: providerName, type },
    model: binding.model,
    upstreamRequest: {
      method: "POST",
      url: "https://provider.example/v1/messages",
      headers: {
        "content-type": "application/json",
        authorization: "Bearer gateway-placeholder",
        "x-api-key": "gateway-placeholder",
        "x-ka-run-id": binding.runId,
      },
      body: { model: binding.model },
    },
  };
}
