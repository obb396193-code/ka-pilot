import { randomBytes, scryptSync } from "node:crypto";

import { describe, expect, it, vi } from "vitest";

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

  it("keeps the event loop responsive during concurrent rejected logins", async () => {
    const provider = new InternalTestLoginProvider(true, JSON.stringify([{
      username: "fixture.user",
      passwordSalt,
      passwordScrypt: scryptSync(password, Buffer.from(passwordSalt, "base64url"), 32).toString("hex"),
      identityId,
    }]));
    let completed = 0;
    const attempts = Array.from({ length: 8 }, (_, index) =>
      provider.authenticate("fixture.user", `wrong-${index}`).then(() => { completed += 1; }));
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
    expect(completed).toBeLessThan(8);
    await expect(Promise.all(attempts)).resolves.toEqual(Array(8).fill(undefined));
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
  it("DB-only identity works without ENV enrollment; wrong password never falls back", async () => {
    const stored = { passwordSalt, passwordScrypt: scryptSync(password, Buffer.from(passwordSalt, "base64url"), 32).toString("hex"), algo: "scrypt" };
    const provider = new InternalTestLoginProvider(true, JSON.stringify([{ username: "fixture.user", identityId, ...stored, algo: undefined }]));
    const lookup = { find: vi.fn(async () => stored), findByLoginName: vi.fn(async () => ({ identityId, password: stored })) };
    provider.useStoredPasswords(lookup);
    expect(await provider.authenticate("db.only", password)).toBe(identityId);
    expect(await provider.authenticate("db.only", "wrong-password")).toBeNull();
    expect(lookup.find).not.toHaveBeenCalled();
  });
  it("disabled login cannot be reenabled by attaching a DB password lookup", async () => {
    const provider = new InternalTestLoginProvider(false, undefined);
    const lookup = { find: vi.fn(), findByLoginName: vi.fn() }; provider.useStoredPasswords(lookup);
    expect(await provider.authenticate("db.only", password)).toBeNull(); expect(lookup.findByLoginName).not.toHaveBeenCalled();
  });
  it("a different DB identity without password cannot inherit ENV credentials", async () => {
    const provider = new InternalTestLoginProvider(true, JSON.stringify([{ username: "fixture.user", identityId, passwordSalt,
      passwordScrypt: scryptSync(password, Buffer.from(passwordSalt, "base64url"), 32).toString("hex") }]));
    const lookup = { find: vi.fn(), findByLoginName: vi.fn(async () => ({ identityId: "00000000-0000-4000-8000-000000000812", password: null })) };
    provider.useStoredPasswords(lookup); expect(await provider.authenticate("fixture.user", password)).toBeNull(); expect(lookup.find).not.toHaveBeenCalled();
  });
});
