import { readFile } from "node:fs/promises";

import { describe, expect, it } from "vitest";

import { accountListResponseSchema } from "../src/account-list-contract.js";

const successNames = ["ready", "empty", "partial", "stale"] as const;

async function readFixture(name: string): Promise<unknown> {
  const path = new URL(`../../contract/fixtures/account-list/${name}.json`, import.meta.url);
  return JSON.parse(await readFile(path, "utf8")) as unknown;
}

describe("ACCOUNTS-LIST-001 canonical response fixtures", () => {
  it.each(successNames)("keeps %s aligned with the strict response schema", async (name) => {
    const parsed = accountListResponseSchema.parse(await readFixture(name));
    expect(parsed.ok).toBe(true);
    if (parsed.ok) {
      expect(parsed.meta.dataState).toBe(name);
      expect(parsed.meta.selectedSource).toBe("qihang");
    }
  });

  it("publishes every frozen HTTP error as the stable envelope", async () => {
    const fixtures = await readFixture("errors") as Record<string, unknown>;
    expect(Object.keys(fixtures).sort()).toEqual(["400", "401", "403", "500", "502", "503", "504"]);
    for (const fixture of Object.values(fixtures)) {
      expect(accountListResponseSchema.safeParse(fixture).success).toBe(true);
    }
  });
});
