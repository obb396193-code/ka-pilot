import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const upstreamPage = readFileSync(
  new URL("../upstream/shadcn-dashboard-topbar/page.tsx", import.meta.url),
  "utf8",
);
const localShell = readFileSync(
  new URL("../src/topbar/topbar-shell.tsx", import.meta.url),
  "utf8",
);
const localPage = readFileSync(
  new URL("../src/topbar/shadcn-dashboard/dashboard-page.tsx", import.meta.url),
  "utf8",
);

const structuralClasses = [
  "border-b",
  "flex h-16 items-center px-4",
  "ml-auto flex items-center space-x-4",
  "flex-1 space-y-4 p-8 pt-6",
  "flex items-center justify-between space-y-2",
  "text-3xl font-bold tracking-tight",
  "grid gap-4 md:grid-cols-2 lg:grid-cols-4",
  "grid gap-4 md:grid-cols-2 lg:grid-cols-7",
  "col-span-4",
  "col-span-3",
];

test("keeps the official historical dashboard page geometry classes", () => {
  const localSource = `${localShell}\n${localPage}`;

  for (const className of structuralClasses) {
    assert.match(
      upstreamPage,
      new RegExp(className.replaceAll("[", "\\[").replaceAll("]", "\\]")),
    );
    assert.match(
      localSource,
      new RegExp(className.replaceAll("[", "\\[").replaceAll("]", "\\]")),
    );
  }
});
