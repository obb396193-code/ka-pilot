import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { agentModelCatalogResponseSchema, agentModelCatalogSchema } from "../src/agent-model-catalog.js";

const item = { id: "model-a", label: "model-a", provider: "synthetic", default: false, status: "verified" };
describe("public Agent model catalog", () => {
  it("parses the arch canonical fixture without its documentation note", () => {
    const fixture = JSON.parse(readFileSync(new URL("../../contract/fixtures/agent/models.json", import.meta.url), "utf8"));
    delete fixture.meta._note;
    expect(agentModelCatalogResponseSchema.parse(fixture)).toEqual(fixture);
  });
  it("allows an empty catalog and no fabricated default", () => {
    expect(agentModelCatalogSchema.parse({ items: [] })).toEqual({ items: [] });
    expect(agentModelCatalogSchema.parse({ items: [item] })).toEqual({ items: [item] });
  });
  it("uses provider+model identity rather than model alone", () => {
    expect(agentModelCatalogSchema.safeParse({ items: [item, { ...item, provider: "another" }] }).success).toBe(true);
    expect(agentModelCatalogSchema.safeParse({ items: [item, item] }).success).toBe(false);
  });
  it.each([
    { ...item, status: "failed" }, { ...item, id: "" }, { ...item, provider: "bad\nheader" },
    { ...item, default: "false" }, { ...item, secret_ref: "hidden" }, { ...item, id: "x".repeat(257) },
    { ...item, default: true, status: "documented_unverified" },
  ])("rejects invalid/unsafe public item %j", value => {
    expect(agentModelCatalogSchema.safeParse({ items: [value] }).success).toBe(false);
  });
  it("rejects multiple defaults and overflow, accepts exact trusted count", () => {
    expect(agentModelCatalogSchema.safeParse({ items: [{ ...item, default: true }, { ...item, id: "b", default: true }] }).success).toBe(false);
    const items = Array.from({ length: 1000 }, (_, n) => ({ ...item, id: `model-${n}` }));
    expect(agentModelCatalogSchema.safeParse({ items }).success).toBe(true);
    expect(agentModelCatalogSchema.safeParse({ items: [...items, { ...item, id: "overflow" }] }).success).toBe(false);
  });
  it("validates stable safe error envelopes", () => {
    expect(agentModelCatalogResponseSchema.safeParse({ ok: false, error: { code: "SOURCE_UNAVAILABLE", message: "Unavailable", requestId: "synthetic", retryable: false } }).success).toBe(true);
    expect(agentModelCatalogResponseSchema.safeParse({ ok: true, data: { items: [] }, meta: { requestId: "x\nlog" } }).success).toBe(false);
  });
});
