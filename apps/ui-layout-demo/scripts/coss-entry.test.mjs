import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";

const appRoot = new URL("../", import.meta.url);
const html = readFileSync(
  new URL("../topbar-coss.html", import.meta.url),
  "utf8",
);
const main = readFileSync(
  new URL("../src/topbar-coss/main.tsx", import.meta.url),
  "utf8",
);
const dashboard = readFileSync(
  new URL("../src/topbar-coss/coss-dashboard.tsx", import.meta.url),
  "utf8",
);

const cossFiles = [
  "avatar.tsx",
  "badge.tsx",
  "button.tsx",
  "card.tsx",
  "input.tsx",
  "segmented-control.ts",
  "spinner.tsx",
  "table.tsx",
];

test("keeps the COSS product dashboard in a separate entry", () => {
  assert.match(html, /data-entry="topbar-coss"/);
  assert.match(html, /src\/topbar-coss\/main\.tsx/);
  assert.doesNotMatch(
    html,
    /sidebar\.html|topbar\.html|\u5207\u6362\u5e03\u5c40/,
  );
  assert.match(main, /\.\/coss\.css/);
  assert.doesNotMatch(main, /topbar\.css|sidebar\.css|index\.css/);
});

test("vendors the selected official COSS current components", () => {
  for (const file of cossFiles) {
    assert.ok(
      existsSync(new URL(`src/topbar-coss/coss-ui/${file}`, appRoot)),
      `${file} is missing`,
    );
  }
  assert.match(dashboard, /\.\/coss-ui\/card/);
  assert.match(dashboard, /\.\/coss-ui\/table/);
  assert.match(dashboard, /segmentedControlRootClassName/);
  assert.doesNotMatch(dashboard, /\u652f\u4ed8|ROI/);
});
