import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import {
  capabilityEffect, capabilitySchema, capabilitySupportsMedia, type Capability,
} from "../../src/r014/capability-contract.js";
import {
  READINESS_DIMENSIONS, mergeReadiness, overallReadiness, taskReadinessSchema,
  type ReadinessDimension, type SystemReadinessEntry,
} from "../../src/r014/task-readiness-contract.js";

const fixture = (name: string): { data: unknown } =>
  JSON.parse(readFileSync(new URL(`../../../contract/fixtures/${name}`, import.meta.url), "utf8"));

const capabilities = (fixture("capabilities/list.json").data as { items: unknown[] }).items.map((item) =>
  capabilitySchema.parse(item));

describe("v1.5 5.7 capability registry", () => {
  it("parses every frozen fixture entry", () => {
    expect(capabilities).toHaveLength(4);
    expect(capabilities.map((item) => item.category).sort()).toEqual(["account", "infra", "query", "write"]);
  });

  it("never lets a capability execute directly — write stops at a changeset draft", () => {
    for (const capability of capabilities) {
      const effect = capabilityEffect(capability);
      expect(JSON.stringify(effect)).not.toContain("execute");
      if (capability.category === "write" && capability.status === "verified") {
        expect(effect).toEqual({ allowed: true, effect: "changeset_draft" });
      }
    }
  });

  it.each([
    ["query", "query_result"],
    ["write", "changeset_draft"],
    ["infra", "infra_request"],
  ])("routes a verified %s capability to %s", (category, effect) => {
    const capability: Capability = {
      key: "k", name: "n", category: category as Capability["category"], form_schema: {},
      permission: "p", version: "1.0", status: "verified", executor: "product_direct", media: [],
    };
    expect(capabilityEffect(capability)).toEqual({ allowed: true, effect });
  });

  it.each(["documented_unverified", "disabled"] as const)("blocks a %s capability", (status) => {
    const capability: Capability = {
      key: "k", name: "n", category: "query", form_schema: {},
      permission: "p", version: "1.0", status, executor: "product_direct", media: [],
    };
    expect(capabilityEffect(capability)).toEqual({ allowed: false, code: "CAPABILITY_UNAVAILABLE" });
  });

  it.each(["account", "material"] as const)("blocks the undefined %s category instead of inventing a side effect", (category) => {
    const capability: Capability = {
      key: "k", name: "n", category, form_schema: {},
      permission: "p", version: "1.0", status: "verified", executor: "runtime", media: [],
    };
    expect(capabilityEffect(capability)).toEqual({ allowed: false, code: "CAPABILITY_UNAVAILABLE" });
  });

  it("honours the media allow-list, treating an empty list as unrestricted", () => {
    const scoped = capabilities.find((item) => item.media.length > 0)!;
    expect(capabilitySupportsMedia(scoped, scoped.media[0]!)).toBe(true);
    expect(capabilitySupportsMedia(scoped, "NOT_A_MEDIA")).toBe(false);
    expect(capabilitySupportsMedia({ ...scoped, media: [] }, "NOT_A_MEDIA")).toBe(true);
  });
});

/** 六段各自造一条系统推导值；用 reduce 建 Record，避免 fromEntries 丢键类型要靠断言补回来。 */
function systemReadiness(
  make: (dimension: ReadinessDimension) => SystemReadinessEntry,
): Record<ReadinessDimension, SystemReadinessEntry> {
  const result = {} as Record<ReadinessDimension, SystemReadinessEntry>;
  for (const dimension of READINESS_DIMENSIONS) result[dimension] = make(dimension);
  return result;
}

describe("v1.5.1 ② task readiness", () => {
  const fixtureReadiness = taskReadinessSchema.parse(
    (() => {
      const item = ((fixture("tasks/list-v151.json").data as { items: Record<string, unknown>[] }).items)[0]!;
      // fixture 的 readiness 里除六段外还有 overall；overall 是算出来的，不进 taskReadinessSchema。
      const six = { ...(item.readiness as Record<string, unknown>) };
      delete six.overall;
      return six;
    })(),
  );

  it("reproduces the fixture's overall as the mean of the six ratios", () => {
    const overall = overallReadiness(fixtureReadiness);
    expect(overall.state).toBe("finite");
    expect(overall.value).toBeCloseTo(0.83, 2);
  });

  it("returns undefined overall when any dimension is missing, never zero", () => {
    const withGap = { ...fixtureReadiness, infra: { ...fixtureReadiness.infra, ratio: { value: null, state: "undefined" as const } } };
    expect(overallReadiness(withGap)).toEqual({ value: null, state: "undefined" });
  });

  it("lets a manual override flip ready without erasing the system's ratio or missing list", () => {
    const system = systemReadiness((dimension) => ({
      ratio: { value: 0.5, state: "finite" }, ready: false, missing: [`${dimension} 缺项`],
    }));
    const merged = mergeReadiness(system, [{ dimension: "products", ready: true }, { dimension: "materials", ready: false }]);
    expect(merged.products).toEqual({ ratio: { value: 0.5, state: "finite" }, ready: true, source: "manual", missing: ["products 缺项"] });
    expect(merged.materials).toEqual({ ratio: { value: 0.5, state: "finite" }, ready: false, source: "manual", missing: ["materials 缺项"] });
    expect(merged.accounts.source).toBe("system");
    expect(merged.accounts.ready).toBe(false);
  });

  it("keeps all six dimensions even when nothing is overridden", () => {
    const system = systemReadiness(() => ({ ratio: { value: 1, state: "finite" }, ready: true, missing: [] }));
    const merged = mergeReadiness(system, []);
    expect(Object.keys(merged).sort()).toEqual([...READINESS_DIMENSIONS].sort());
    expect(overallReadiness(merged)).toEqual({ value: 1, state: "finite" });
  });
});
