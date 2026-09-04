import { randomBytes, scryptSync } from "node:crypto";

import { describe, expect, it } from "vitest";

import { InternalTestLoginProvider } from "../src/auth/internal-test-login-provider.js";

const identityId = "00000000-0000-4000-8000-000000000811";
const password = "runtime-only-password";
const passwordSalt = randomBytes(16).toString("base64url");

describe("InternalTestLoginProvider", () => {
  it("is disabled by default and has no built-in account", async () => {
    const provider = new InternalTestLoginProvider(false, undefined);
    await expect(provider.authenticate("fixture.user", password)).resolves.toBeNull();
  });

  it("accepts only a configured username and scrypt verifier", async () => {
    const provider = new InternalTestLoginProvider(true, JSON.stringify([{
      username: "fixture.user",
      passwordSalt,
      passwordScrypt: scryptSync(password, Buffer.from(passwordSalt, "base64url"), 32).toString("hex"),
      identityId,
    }]));
    await expect(provider.authenticate("fixture.user", password)).resolves.toBe(identityId);
    await expect(provider.authenticate("fixture.user", "wrong-password")).resolves.toBeNull();
    await expect(provider.authenticate("missing.user", password)).resolves.toBeNull();
  });

  it("fails startup for missing, malformed, duplicate or plaintext credentials", () => {
    expect(() => new InternalTestLoginProvider(true, undefined)).toThrow(/required/);
    expect(() => new InternalTestLoginProvider(true, "not-json")).toThrow(/valid JSON/);
    expect(() => new InternalTestLoginProvider(true, JSON.stringify([{
      username: "fixture.user",
      password: "plaintext-is-forbidden",
      identityId,
    }]))).toThrow();
    const duplicate = {
      username: "fixture.user",
      passwordSalt,
      passwordScrypt: "a".repeat(64),
      identityId,
    };
    expect(() => new InternalTestLoginProvider(true, JSON.stringify([duplicate, duplicate]))).toThrow();
  });
});
