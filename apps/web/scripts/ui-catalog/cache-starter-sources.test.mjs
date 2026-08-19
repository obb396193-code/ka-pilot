import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
  cacheRegistryPayload,
  extractSameSourceDependencies,
  resolveAssetFetch,
  verifyCachedEntry,
} from "./cache-starter-sources.mjs";

test("resolves registry, GitHub blob and GitHub tree official sources", () => {
  assert.deepEqual(resolveAssetFetch("https://coss.com/ui/r/p-date-picker-2.json"), {
    kind: "file",
    url: "https://coss.com/ui/r/p-date-picker-2.json",
  });

  assert.deepEqual(
    resolveAssetFetch(
      "https://github.com/tremorlabs/tremor-blocks/blob/main/src/content/components/filterbar/filterbar-01.tsx",
    ),
    {
      kind: "file",
      url: "https://raw.githubusercontent.com/tremorlabs/tremor-blocks/main/src/content/components/filterbar/filterbar-01.tsx",
    },
  );

  assert.deepEqual(
    resolveAssetFetch("https://github.com/DavidHDev/react-bits/tree/main/src/content/Components/Counter"),
    {
      kind: "github-tree",
      owner: "DavidHDev",
      repo: "react-bits",
      ref: "main",
      prefix: "src/content/Components/Counter/",
      tree_url: "https://api.github.com/repos/DavidHDev/react-bits/git/trees/main?recursive=1",
    },
  );
});

test("only follows explicit same-source registry dependencies", () => {
  assert.deepEqual(
    extractSameSourceDependencies("coss", {
      registryDependencies: ["@coss/button", "@coss/calendar", "date-fns", "button"],
    }),
    [
      { name: "button", url: "https://coss.com/ui/r/button.json" },
      { name: "calendar", url: "https://coss.com/ui/r/calendar.json" },
    ],
  );

  assert.deepEqual(
    extractSameSourceDependencies("reui", {
      registryDependencies: ["@reui/data-grid", "@tanstack/react-table", "button"],
    }),
    [{ name: "data-grid", url: "https://reui.io/r/base-nova/data-grid.json" }],
  );

  assert.deepEqual(extractSameSourceDependencies("magic-ui", { registryDependencies: ["button"] }), []);
});

test("writes the exact public registry payload and verifies its SHA-256", async () => {
  const directory = await mkdtemp(join(tmpdir(), "ui-source-cache-"));
  const payload = JSON.stringify({
    name: "p-empty-1",
    type: "registry:block",
    files: [{ path: "components/p-empty-1.tsx", content: "export const Empty = () => null;\n" }],
    registryDependencies: ["@coss/empty"],
  });

  const entry = await cacheRegistryPayload({
    asset: {
      source: "coss",
      upstream_name: "p-empty-1",
      source_url: "https://coss.com/ui/r/p-empty-1.json",
      access_status: "public-source",
      license: "MIT",
      license_scope: "MIT for apps/ui",
    },
    rootOrDependency: "root",
    cacheRoot: directory,
    fetchImpl: async () => new Response(payload, { status: 200 }),
  });

  assert.equal(entry.cache_status, "cached");
  assert.equal(entry.http_status, 200);
  assert.equal(entry.files_in_payload, 1);
  assert.equal(await readFile(join(directory, entry.local_path), "utf8"), payload);
  assert.deepEqual(await verifyCachedEntry(entry, directory), { ok: true, error: "" });

  await writeFile(join(directory, entry.local_path), `${payload}\n`, "utf8");
  const tampered = await verifyCachedEntry(entry, directory);
  assert.equal(tampered.ok, false);
  assert.match(tampered.error, /sha256 mismatch/);
});

test("refuses to cache paid or metadata-only items", async () => {
  await assert.rejects(
    cacheRegistryPayload({
      asset: {
        source: "reui",
        upstream_name: "banner-1",
        source_url: "https://reui.io/r/base-nova/banner-1.json",
        access_status: "paid-source-after-license",
      },
      rootOrDependency: "root",
      cacheRoot: tmpdir(),
      fetchImpl: async () => new Response("{}", { status: 200 }),
    }),
    /public-source/,
  );
});

test("verifies a single raw GitHub source with its payload hash", async () => {
  const directory = await mkdtemp(join(tmpdir(), "ui-source-file-cache-"));
  const content = "export const KPI = 1;\n";
  const digest = createHash("sha256").update(content).digest("hex");
  await writeFile(join(directory, "kpi-card.tsx"), content, "utf8");

  const result = await verifyCachedEntry(
    {
      local_path: "kpi-card.tsx",
      sha256: digest,
      hash_scope: "payload",
      cached_files: [
        {
          path: "kpi-card.tsx",
          source_path: "src/kpi-card.tsx",
          sha256: digest,
        },
      ],
    },
    directory,
  );

  assert.deepEqual(result, { ok: true, error: "" });
});
