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

/**
 * 绊线：`ready-lineage.json` 是**参照件，不是当前后端的产物**（arch v1.9.45 裁：不重导）。
 *
 * 它钉的是「血缘齐备」那一档的形状——`metadataAvailability:"known"` 且
 * `datasetVersion`/`timezone`/`dayCut` 三项都有值。今天的后端给不出这三项
 * （真响应是 `partial` + 三个 null），拿现状覆盖它等于把参照降级成「我们目前只能做到这样」，
 * 以后真能给出这些元数据时就没有东西钉形状了。
 *
 * 说明写在这里而不是文件的 `_note` 里，是因为这份要过 `dataQueryResponseSchema`，
 * 它的 `meta` 是**严格三选一**（`{cellCoverage}` / hourly / gap），多一个键整条判非法。
 *
 * **退役条件**：`metadataAvailability` 能真给到 `known` 的那天，这份必须换成真响应，
 * 这条绊线随之删除。
 */
describe("ready-lineage is a contract reference, not a snapshot of today's backend", () => {
  it("keeps all four lineage metadata fields populated", async () => {
    const parsed = dataQueryResponseSchema.parse(await readFixture("ready-lineage"));
    if (!parsed.ok || parsed.data.mode === "reconcile") throw new Error("unexpected fixture");
    const lineage = parsed.data.source.lineage;
    expect(lineage.metadataAvailability).toBe("known");
    for (const field of ["datasetVersion", "dataAsOf", "timezone", "dayCut"] as const) {
      expect(lineage[field], `${field} 不能为空：这份的全部价值就是钉住「四项都有」那一档`).not.toBeNull();
    }
  });

  it("carries no meta, because the envelope's meta is a strict three-way union", async () => {
    // 想给它加出处说明的人会先撞到这条：说明只能写在用例里。
    const raw = await readFixture("ready-lineage") as Record<string, unknown>;
    expect(Object.hasOwn(raw, "meta"), "加了 meta 会让 dataQueryResponseSchema 判非法").toBe(false);
  });
});
