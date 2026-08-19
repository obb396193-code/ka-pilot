import assert from "node:assert/strict";
import test from "node:test";

import {
  buildHealthReport,
  mergeSourceResults,
} from "./source-health.mjs";
import { UI_SOURCES } from "./sources.mjs";

test("merges a targeted source check without dropping the other sources", () => {
  const existing = [
    { id: "shadcn", status: "partial", checked_at: "old" },
    { id: "tweakcn", status: "blocked", checked_at: "old" },
  ];
  const update = [{ id: "tweakcn", status: "partial", checked_at: "new" }];
  const merged = mergeSourceResults(existing, update);

  assert.deepEqual(merged.map((item) => item.id), ["shadcn", "tweakcn"]);
  assert.equal(merged.find((item) => item.id === "tweakcn").checked_at, "new");
});

test("recalculates health summary from merged results", () => {
  const report = buildHealthReport([
    { status: "verified" },
    { status: "partial" },
    { status: "blocked" },
  ], "2026-08-19T00:00:00.000Z");

  assert.deepEqual(report.summary, {
    total: 3,
    verified: 1,
    partial: 1,
    blocked: 1,
  });
});

test("registers the five boss-approved official sources with complete evidence", async () => {
  const discovery = JSON.parse(await import("node:fs/promises").then(({ readFile }) =>
    readFile(new URL("../../../../docs/frontend/ui-assets/discovery.json", import.meta.url), "utf8")));
  const ids = ["ai-elements", "kibo-ui", "dice-ui", "animate-ui", "motion-primitives"];
  const sources = ids.map((id) => UI_SOURCES.find((source) => source.id === id));

  assert(sources.every(Boolean));
  assert.equal(new Set(UI_SOURCES.map((source) => source.id)).size, UI_SOURCES.length);
  for (const source of sources) {
    assert(source.catalogMode);
    assert(source.catalogUrls.length > 0);
    assert.match(source.docsUrl, /^https:\/\//);
    assert.match(source.repositoryUrl, /^https:\/\/github\.com\//);
    assert.match(source.licenseUrl, /^https:\/\//);
    assert(source.coverageNote.length > 40);
  }

  assert.equal(discovery.sources.filter((source) => source.decision_status === "approved-for-catalog-and-contextual-use").length, 3);
  assert.equal(discovery.sources.filter((source) => source.decision_status === "approved-for-selective-comparison").length, 2);
});
