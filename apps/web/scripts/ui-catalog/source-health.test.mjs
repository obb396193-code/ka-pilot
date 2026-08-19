import assert from "node:assert/strict";
import test from "node:test";

import {
  buildHealthReport,
  mergeSourceResults,
} from "./source-health.mjs";

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
