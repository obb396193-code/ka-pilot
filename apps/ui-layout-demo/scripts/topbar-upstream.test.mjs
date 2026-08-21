import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";

const sourcePath = new URL(
  "../upstream/shadcn-dashboard-topbar/SOURCE.json",
  import.meta.url,
);

test("pins the complete historical shadcn topbar dashboard source", () => {
  assert.ok(
    existsSync(
      new URL(
        "../upstream/shadcn-dashboard-topbar/page.tsx",
        import.meta.url,
      ),
    ),
  );
  assert.ok(existsSync(sourcePath));

  const source = JSON.parse(readFileSync(sourcePath, "utf8"));
  assert.equal(source.source, "shadcn-ui/ui");
  assert.match(source.upstream_ref, /^[0-9a-f]{40}$/);
  assert.match(source.sha256, /^[0-9a-f]{64}$/);
  assert.deepEqual(source.components.sort(), [
    "date-range-picker.tsx",
    "main-nav.tsx",
    "overview.tsx",
    "recent-sales.tsx",
    "search.tsx",
    "team-switcher.tsx",
    "user-nav.tsx",
  ]);
});
