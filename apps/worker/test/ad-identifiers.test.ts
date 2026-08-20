import { describe, expect, it } from "vitest";

import {
  AdIdentifierSourceError,
  createAdIdentifierDiscovery,
  discoverAdIdentifiers,
  requireAuthoritativeAdIds,
} from "../src/sources/ad-identifiers.js";

const mappingEvidence = {
  kind: "os_set_equality_probe" as const,
  fingerprint: "a".repeat(64),
  verifiedAt: new Date("2026-08-20T07:30:00.000Z"),
};

describe("ad identifier evidence gate", () => {
  it("normalizes identifiers without exposing them in the evidence fingerprint", () => {
    const discovery = createAdIdentifierDiscovery({
      source: "kuaishou_unit_list",
      identifiers: [" unit-2 ", "unit-1", "unit-2"],
      completeness: "complete",
      mappingToAdId: "confirmed_equal",
      mappingEvidence,
      observedAt: new Date("2026-08-20T08:00:00.000Z"),
    });

    expect(discovery.identifiers).toEqual(["unit-2", "unit-1"]);
    expect(discovery.evidence).toMatchObject({
      source: "kuaishou_unit_list",
      identifierCount: 2,
      observedAt: "2026-08-20T08:00:00.000Z",
    });
    expect(JSON.stringify(discovery.evidence)).not.toContain("unit-1");
    expect(discovery.evidence.fingerprint).toMatch(/^[a-f0-9]{64}$/);
  });

  it.each([
    ["unknown", "confirmed_equal"],
    ["complete", "unverified"],
    ["complete", "not_equal"],
  ] as const)(
    "rejects a source that is not both complete and confirmed: %s/%s",
    (completeness, mappingToAdId) => {
      const discovery = createAdIdentifierDiscovery({
        source: "kuaishou_unit_list",
        identifiers: ["candidate-1"],
        completeness,
        mappingToAdId,
        ...(mappingToAdId === "confirmed_equal" ? { mappingEvidence } : {}),
      });

      expect(() => requireAuthoritativeAdIds(discovery)).toThrowError(
        expect.objectContaining({ code: "UNVERIFIED_ID_SOURCE" }),
      );
    },
  );

  it("returns a defensive copy only for an authoritative non-empty source", () => {
    const discovery = createAdIdentifierDiscovery({
      source: "os_structured_result",
      identifiers: ["ad-1", "ad-2"],
      completeness: "complete",
      mappingToAdId: "confirmed_equal",
      mappingEvidence,
    });

    const ids = requireAuthoritativeAdIds(discovery);
    expect(ids).toEqual(["ad-1", "ad-2"]);
    expect(ids).not.toBe(discovery.identifiers);
  });

  it("does not allow a confirmed mapping flag without independent evidence", () => {
    expect(() => createAdIdentifierDiscovery({
      source: "os_structured_result",
      identifiers: ["ad-1"],
      completeness: "complete",
      mappingToAdId: "confirmed_equal",
    })).toThrow(AdIdentifierSourceError);
  });

  it("rejects a structurally forged discovery that bypassed the constructor", () => {
    expect(() => requireAuthoritativeAdIds({
      source: "os_structured_result",
      identifiers: ["ad-1"],
      completeness: "complete",
      mappingToAdId: "confirmed_equal",
      evidence: {
        source: "os_structured_result",
        identifierCount: 1,
        fingerprint: "b".repeat(64),
        observedAt: "2026-08-20T07:30:00.000Z",
      },
    })).toThrow(AdIdentifierSourceError);
  });

  it("enumerates structured pages to a stable total before creating evidence", async () => {
    const calls: number[] = [];
    const discovery = await discoverAdIdentifiers({
      source: "os_structured_result",
      mappingToAdId: "unverified",
      pageSize: 2,
      fetchPage: async ({ page, pageSize }) => {
        calls.push(page);
        return page === 1
          ? { page, pageSize, total: 3, identifiers: ["candidate-1", "candidate-2"] }
          : { page, pageSize, total: 3, identifiers: ["candidate-3"] };
      },
      observedAt: new Date("2026-08-20T10:00:00.000Z"),
    });

    expect(calls).toEqual([1, 2]);
    expect(discovery).toMatchObject({
      identifiers: ["candidate-1", "candidate-2", "candidate-3"],
      completeness: "complete",
      mappingToAdId: "unverified",
      evidence: { identifierCount: 3 },
    });
    expect(() => requireAuthoritativeAdIds(discovery)).toThrow(AdIdentifierSourceError);
  });

  it.each([
    ["total drift", async ({ page, pageSize }: { page: number; pageSize: number }) => ({
      page,
      pageSize,
      total: page === 1 ? 2 : 3,
      identifiers: [`candidate-${page}`],
    })],
    ["premature empty page", async ({ page, pageSize }: { page: number; pageSize: number }) => ({
      page,
      pageSize,
      total: 2,
      identifiers: page === 1 ? ["candidate-1"] : [],
    })],
    ["wrong page metadata", async ({ pageSize }: { page: number; pageSize: number }) => ({
      page: 9,
      pageSize,
      total: 1,
      identifiers: ["candidate-1"],
    })],
  ])("fails closed when paged discovery has %s", async (_label, fetchPage) => {
    await expect(discoverAdIdentifiers({
      source: "kuaishou_unit_list",
      mappingToAdId: "unverified",
      pageSize: 1,
      fetchPage,
    })).rejects.toBeInstanceOf(AdIdentifierSourceError);
  });

  it("enforces identifier and page budgets while enumerating", async () => {
    await expect(discoverAdIdentifiers({
      source: "kuaishou_unit_list",
      mappingToAdId: "unverified",
      pageSize: 1,
      maxPages: 1,
      fetchPage: async ({ page, pageSize }) => ({
        page,
        pageSize,
        total: 2,
        identifiers: ["candidate-1"],
      }),
    })).rejects.toMatchObject({ code: "UNVERIFIED_ID_SOURCE" });

    await expect(discoverAdIdentifiers({
      source: "kuaishou_unit_list",
      mappingToAdId: "unverified",
      maxIdentifiers: 1,
      fetchPage: async ({ page, pageSize }) => ({
        page,
        pageSize,
        total: 2,
        identifiers: ["candidate-1", "candidate-2"],
      }),
    })).rejects.toMatchObject({ code: "UNVERIFIED_ID_SOURCE" });
  });

  it.each([
    ["blank identifier", ["ad-1", " "]],
    ["no identifiers", []],
  ])("fails closed for %s", (_label, identifiers) => {
    expect(() => createAdIdentifierDiscovery({
      source: "os_structured_result",
      identifiers,
      completeness: "complete",
      mappingToAdId: "confirmed_equal",
      mappingEvidence,
    })).toThrow(AdIdentifierSourceError);
  });
});
