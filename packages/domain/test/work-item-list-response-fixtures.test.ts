import { readFile } from "node:fs/promises";

import { describe, expect, it } from "vitest";

import { workItemListResponseSchema } from "../src/work-item-list-contract.js";

const successNames = ["ready", "empty", "partial", "stale"] as const;
async function readFixture(name: string): Promise<unknown> {
  return JSON.parse(await readFile(
    new URL(`../../contract/fixtures/work-item-list/${name}.json`, import.meta.url), "utf8",
  )) as unknown;
}

describe("WORK-ITEM-LIST-001 canonical response fixtures", () => {
  it.each(successNames)("keeps %s aligned with strict platform response", async (name) => {
    const parsed = workItemListResponseSchema.parse(await readFixture(name));
    expect(parsed.ok).toBe(true);
    if (parsed.ok) {
      expect(parsed.meta.dataState).toBe(name);
      expect(parsed.meta.selectedSource).toBe("platform");
    }
  });
  it("publishes all frozen HTTP errors", async () => {
    const errors = await readFixture("errors") as Record<string, unknown>;
    expect(Object.keys(errors).sort()).toEqual(["400", "401", "403", "500", "502", "503", "504"]);
    for (const value of Object.values(errors)) expect(workItemListResponseSchema.safeParse(value).success).toBe(true);
  });
});
