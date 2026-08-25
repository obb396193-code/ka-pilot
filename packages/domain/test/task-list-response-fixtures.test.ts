import { readFile } from "node:fs/promises";

import { describe, expect, it } from "vitest";

import { taskListResponseSchema } from "../src/task-list-contract.js";

const successNames = ["ready", "empty", "partial", "stale"] as const;

async function readFixture(name: string): Promise<unknown> {
  const path = new URL(`../../contract/fixtures/task-list/${name}.json`, import.meta.url);
  return JSON.parse(await readFile(path, "utf8")) as unknown;
}

describe("TASK-LIST-001 canonical response fixtures", () => {
  it.each(successNames)("keeps %s aligned with the strict response schema", async (name) => {
    expect(taskListResponseSchema.safeParse(await readFixture(name)).success).toBe(true);
  });

  it.each(successNames)("keeps %s on qihang with an explicit data state", async (name) => {
    const parsed = taskListResponseSchema.parse(await readFixture(name));
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.meta.selectedSource).toBe("qihang");
    expect(parsed.meta.dataState).toBe(name);
  });

  it("publishes every frozen HTTP error as the same stable envelope", async () => {
    const fixtures = await readFixture("errors") as Record<string, unknown>;
    expect(Object.keys(fixtures).sort()).toEqual([
      "400", "401", "403", "500", "502", "503", "504",
    ]);
    for (const fixture of Object.values(fixtures)) {
      expect(taskListResponseSchema.safeParse(fixture).success).toBe(true);
    }
  });
});
