import assert from "node:assert/strict"
import { access, readFile, readdir } from "node:fs/promises"
import path from "node:path"
import test from "node:test"

const root = process.cwd()
const sidebarRoot = path.join(root, "src/sidebar")
const baselinePath = path.join(sidebarRoot, "visual-baseline.json")

const collectSource = async (directory) => {
  const entries = await readdir(directory, { withFileTypes: true })
  const chunks = []

  for (const entry of entries) {
    const target = path.join(directory, entry.name)
    if (entry.isDirectory()) chunks.push(await collectSource(target))
    else if (/\.(css|ts|tsx)$/.test(entry.name)) chunks.push(await readFile(target, "utf8"))
  }

  return chunks.join("\n")
}

test("locks the approved sidebar visual mother and its official source traits", async () => {
  const baseline = JSON.parse(await readFile(baselinePath, "utf8"))
  const source = await collectSource(sidebarRoot)

  assert.equal(baseline.route, "/sidebar.html")
  assert.deepEqual(baseline.viewports, [
    { width: 1440, height: 900 },
    { width: 1366, height: 768 },
  ])
  assert.equal(baseline.font, "Geist")
  assert.equal(baseline.sidebarExpandedWidth, 288)
  assert.equal(baseline.headerHeight, 48)
  assert.equal(baseline.kpiCount, 4)
  assert.deepEqual(baseline.requiredSections, ["sidebar", "header", "kpis", "chart", "tabs", "table"])
  assert.equal(baseline.bossApproved, true)

  for (const text of [
    "KA Pilot",
    "工作台",
    "投放任务",
    "数据分析",
    "账户池",
    "自动化",
    "商品素材",
    "报告",
    "知识库",
    "集成与通知",
  ]) {
    assert.match(source, new RegExp(text), `sidebar source is missing ${text}`)
  }

  for (const trait of ["Geist", "Geist Mono", "lab(", "antialiased", "SidebarProvider", "SidebarInset", "SiteHeader", "SectionCards", "ChartAreaInteractive", "DataTable"]) {
    assert.ok(source.includes(trait), `sidebar source is missing official trait: ${trait}`)
  }

  for (const file of [
    "src/sidebar/shadcn-dashboard/app-sidebar.tsx",
    "src/sidebar/shadcn-dashboard/site-header.tsx",
    "src/sidebar/shadcn-dashboard/section-cards.tsx",
    "src/sidebar/shadcn-dashboard/chart-area-interactive.tsx",
    "src/sidebar/shadcn-dashboard/data-table.tsx",
  ]) {
    await access(path.join(root, file))
  }

  assert.doesNotMatch(source, /\b(PageShell|MetricGrid|DataViewSwitcher)\b/)
})
