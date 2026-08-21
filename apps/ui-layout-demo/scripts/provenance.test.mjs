import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const manifest = JSON.parse(
  readFileSync(new URL("../src/provenance.json", import.meta.url), "utf8"),
);

test("records only license-cleared upstream UI sources", () => {
  assert.ok(Array.isArray(manifest.sources));
  assert.ok(
    manifest.sources.some(
      (item) => item.source === "shadcn" && item.asset === "dashboard-01",
    ),
  );
  assert.ok(
    manifest.sources.some(
      (item) =>
        item.source === "shadcn" &&
        item.asset === "historical-dashboard-topbar",
    ),
  );
  for (const item of manifest.sources) {
    assert.match(item.license, /MIT|Apache-2\.0|SIL Open Font License 1\.1/);
    assert.match(item.upstream_url, /^https:\/\//);
    assert.ok(item.upstream_ref);
  }
});
