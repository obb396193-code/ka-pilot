import { describe, expect, it } from "vitest";

import {
  mergeAdRealtimeRows,
  planAdRealtimeBatches,
} from "../src/etl/ad-query-batches.js";

const baseQuery = {
  resource: "ad_realtime" as const,
  userId: "u1",
  media: "KUAISHOU",
  ds: "20260820",
  hh: 9,
};

describe("ad realtime query batching", () => {
  it("deduplicates account identifiers and creates stable 5/5/2 batches", () => {
    const accountIds = [
      ...Array.from({ length: 12 }, (_, index) => `a-${index + 1}`),
      "a-1",
    ];

    const batches = planAdRealtimeBatches({ ...baseQuery, accountIds });

    expect(batches.map((query) => query.accountIds)).toEqual([
      ["a-1", "a-2", "a-3", "a-4", "a-5"],
      ["a-6", "a-7", "a-8", "a-9", "a-10"],
      ["a-11", "a-12"],
    ]);
    expect(batches.every((query) => query.adIds === undefined)).toBe(true);
  });

  it("creates deterministic account and ad identifier cross-product batches", () => {
    const accountIds = Array.from({ length: 6 }, (_, index) => `a-${index + 1}`);
    const adIds = Array.from({ length: 81 }, (_, index) => `ad-${index + 1}`);

    const batches = planAdRealtimeBatches({ ...baseQuery, accountIds, adIds });

    expect(batches).toHaveLength(4);
    expect(batches.map((query) => [query.accountIds?.length, query.adIds?.length])).toEqual([
      [5, 80],
      [5, 1],
      [1, 80],
      [1, 1],
    ]);
  });

  it("supports ad-only filtering but never creates an unfiltered query", () => {
    const batches = planAdRealtimeBatches({
      ...baseQuery,
      adIds: Array.from({ length: 81 }, (_, index) => `ad-${index + 1}`),
    });

    expect(batches.map((query) => query.adIds?.length)).toEqual([80, 1]);
    expect(() => planAdRealtimeBatches(baseQuery)).toThrow(/filter/i);
  });

  it("rejects an excessive account and ad cross-product before execution", () => {
    expect(() => planAdRealtimeBatches({
      ...baseQuery,
      accountIds: Array.from({ length: 1_000 }, (_, index) => `a-${index}`),
      adIds: Array.from({ length: 1_000 }, (_, index) => `ad-${index}`),
    })).toThrow(/batch count/i);
  });
});

describe("ad realtime batch merge", () => {
  const first = {
    account_id: "a-1",
    ad_id: "ad-1",
    ds: "20260820",
    ad_cost_h: 10,
  };

  it("deduplicates identical rows independent of object key order", () => {
    const reordered = {
      ad_cost_h: 10,
      ds: "20260820",
      ad_id: "ad-1",
      account_id: "a-1",
    };

    expect(mergeAdRealtimeRows([[first], [reordered]])).toEqual([first]);
  });

  it("fails closed on conflicting duplicate identities", () => {
    expect(() => mergeAdRealtimeRows([
      [first],
      [{ ...first, ad_cost_h: 11 }],
    ])).toThrow(/conflicting duplicate/i);
  });

  it.each([
    { account_id: "a-1", ds: "20260820" },
    { ad_id: "ad-1", ds: "20260820" },
    { account_id: "a-1", ad_id: "ad-1" },
  ])("fails closed when an identity field is missing: %o", (row) => {
    expect(() => mergeAdRealtimeRows([[row]])).toThrow(/identity/i);
  });
});
