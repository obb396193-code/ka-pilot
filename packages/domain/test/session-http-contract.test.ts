import { readFile } from "node:fs/promises";

import { describe, expect, it } from "vitest";

import {
  internalTestLoginRequestSchema,
  sessionHttpResponseSchema,
  sessionViewSchema,
  workspaceSwitchRequestSchema,
} from "../src/session-http-contract.js";

async function fixture(name: string): Promise<unknown> {
  const path = new URL(`../../contract/fixtures/session-http/${name}.json`, import.meta.url);
  return JSON.parse(await readFile(path, "utf8")) as unknown;
}

describe("PERSONAL-TEAM Task4 session HTTP contract", () => {
  it.each(["personal", "team", "logout"])("accepts the canonical %s fixture", async (name) => {
    expect(sessionHttpResponseSchema.safeParse(await fixture(name)).success).toBe(true);
  });

  it("accepts every stable error fixture", async () => {
    const errors = await fixture("errors") as Record<string, unknown>;
    expect(Object.keys(errors).sort()).toEqual(["400", "401", "403", "500", "502"]);
    for (const value of Object.values(errors)) {
      expect(sessionHttpResponseSchema.safeParse(value).success).toBe(true);
    }
  });

  it("rejects browser-supplied workspace scope and role", () => {
    expect(workspaceSwitchRequestSchema.safeParse({
      workspaceId: "00000000-0000-4000-8000-000000000802",
      workspaceKind: "team",
    }).success).toBe(false);
    expect(workspaceSwitchRequestSchema.safeParse({
      workspaceId: "00000000-0000-4000-8000-000000000802",
      role: "admin",
    }).success).toBe(false);
  });

  it("keeps internal login strict and bounded", () => {
    expect(internalTestLoginRequestSchema.safeParse({
      provider: "internal_test",
      username: "fixture.user",
      password: "secret-from-runtime",
    }).success).toBe(true);
    expect(internalTestLoginRequestSchema.safeParse({
      provider: "internal_test",
      username: "fixture.user",
      password: "secret-from-runtime",
      identityId: "00000000-0000-4000-8000-000000000899",
    }).success).toBe(false);
  });

  it("rejects team write semantics and an active workspace outside the list", () => {
    expect(sessionViewSchema.safeParse({
      identity: { displayName: "fixture" },
      activeWorkspace: {
        id: "00000000-0000-4000-8000-000000000802",
        name: "team",
        kind: "team",
        role: "admin",
        readOnly: false,
      },
      workspaces: [],
    }).success).toBe(false);
  });
});
