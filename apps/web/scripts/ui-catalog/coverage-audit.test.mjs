import assert from "node:assert/strict";
import test from "node:test";

import { buildCoverageAudit, coverageAuditMarkdown } from "./build-coverage-audit.mjs";

test("coverage audit matches the committed catalog totals and keeps cache separate", async () => {
  const index = JSON.parse(await import("node:fs/promises").then(({ readFile }) =>
    readFile(new URL("../../../../docs/frontend/ui-assets/catalogs/index.json", import.meta.url), "utf8")));
  const { readFile } = await import("node:fs/promises");
  const catalogs = await Promise.all(index.sources.map((source) =>
    readFile(new URL(`../../../../docs/frontend/ui-assets/catalogs/${source.file}`, import.meta.url), "utf8").then(JSON.parse)));
  const audit = buildCoverageAudit(index, catalogs);

  assert.equal(audit.summary.catalog_items, 7056);
  assert.equal(audit.sources.length, 17);
  assert.equal(audit.summary.fully_cached_catalog_items, 0);
  assert.equal(audit.sources.find((source) => source.id === "reui").catalog_count, 2315);
  assert.match(coverageAuditMarkdown(audit), /目录项是可搜索元数据/);
});
