import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import test from "node:test"

const entryFiles = [
  "apps/web/AGENTS.md",
  "docs/frontend/ui-assets/frontend-product-standard.md",
  "docs/frontend/ui-assets/前端视觉与体验审核清单.md",
  "docs/relay/F-004-前端UI资产与质量门禁.md",
]

const requiredRules = [
  "sidebar.html",
  "唯一视觉母版",
  "老板视觉签字",
  "root 功能签字",
  "旧前端页面不得作为视觉来源",
  "ContentRadar 真实源码",
]

test("every frontend entry preserves the unique visual line and dual signoff", async () => {
  for (const file of entryFiles) {
    const source = await readFile(file, "utf8")

    for (const rule of requiredRules) {
      assert.match(source, new RegExp(rule.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")), `${file} is missing: ${rule}`)
    }
  }
})
