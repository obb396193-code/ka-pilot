import { readFile } from "node:fs/promises";

import { describe, expect, it } from "vitest";

import { dataQueryResponseSchema } from "../src/data-query-contract.js";

const fixtureNames = [
  "ready-lineage",
  "unknown-lineage",
  "reconcile-pending",
  "stable-error",
] as const;

async function readFixture(name: typeof fixtureNames[number]): Promise<unknown> {
  const path = new URL(`../../contract/fixtures/data-query/${name}.json`, import.meta.url);
  return JSON.parse(await readFile(path, "utf8")) as unknown;
}

describe("canonical data-query response fixtures", () => {
  it.each(["ready-lineage", "unknown-lineage", "reconcile-pending"] as const)(
    "rejects %s if any source omits its workspace kind",
    async (name) => {
      const fixture = dataQueryResponseSchema.parse(await readFixture(name));
      if (!fixture.ok) throw new Error("unexpected fixture");
      const sources = fixture.data.mode === "reconcile"
        ? [fixture.data.kaData, fixture.data.platform] : [fixture.data.source];
      for (const source of sources) {
        const previous = source.lineage.workspaceKind;
        Reflect.deleteProperty(source.lineage, "workspaceKind");
        expect(dataQueryResponseSchema.safeParse(fixture).success).toBe(false);
        source.lineage.workspaceKind = previous;
      }
    },
  );
  it("rejects a v1 source version even if its rows otherwise match v2", async () => {
    const parsed = dataQueryResponseSchema.parse(await readFixture("ready-lineage"));
    if (!parsed.ok || parsed.data.mode === "reconcile") throw new Error("unexpected fixture");
    expect(dataQueryResponseSchema.safeParse({ ...parsed, data: {
      ...parsed.data, source: { ...parsed.data.source, rowSchemaVersion: "account.summary/v1" },
    } }).success).toBe(false);
  });
  it.each(fixtureNames)("keeps %s aligned with the domain envelope", async (name) => {
    expect(dataQueryResponseSchema.safeParse(await readFixture(name)).success).toBe(true);
  });

  it("publishes a fully sourced ready lineage example", async () => {
    const parsed = dataQueryResponseSchema.parse(await readFixture("ready-lineage"));
    expect(parsed).toMatchObject({
      ok: true,
      data: {
        mode: "platform",
        source: {
          status: "ready",
          lineage: {
            metadataAvailability: "known",
            datasetVersion: expect.any(String),
            dataAsOf: expect.any(String),
            timezone: expect.any(String),
            dayCut: expect.any(String),
          },
        },
      },
    });
  });

  it("publishes unknown lineage without fabricated source metadata", async () => {
    const parsed = dataQueryResponseSchema.parse(await readFixture("unknown-lineage"));
    expect(parsed).toMatchObject({
      ok: true,
      data: {
        source: {
          lineage: {
            metadataAvailability: "unknown",
            datasetVersion: null,
            dataAsOf: null,
            timezone: null,
            dayCut: null,
          },
        },
      },
    });
  });

  it("publishes the frozen pending reconciliation shape", async () => {
    const parsed = dataQueryResponseSchema.parse(await readFixture("reconcile-pending"));
    expect(parsed).toMatchObject({
      ok: true,
      data: {
        mode: "reconcile",
        comparison: {
          status: "unavailable",
          reason: "reconciliation_engine_pending",
          rows: [],
        },
      },
    });
  });

  it("publishes the stable error envelope with a correlation ID", async () => {
    const parsed = dataQueryResponseSchema.parse(await readFixture("stable-error"));
    expect(parsed).toEqual({
      ok: false,
      error: {
        code: "QUERY_NOT_ALLOWED",
        message: "The requested query is not available",
        retryable: false,
        requestId: "fixture-request-001",
      },
    });
  });
});
