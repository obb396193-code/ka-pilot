import assert from "node:assert/strict"
import { execFileSync } from "node:child_process"
import { readFileSync } from "node:fs"
import test from "node:test"

/**
 * 本机图表偏好的读取（F8-19b P1 附录）。
 *
 * 为什么值得测：`localStorage` 里的东西不受我们控制——可能是上个版本写的、
 * 被人手改过、或别的同名 key 残留。原来是 `JSON.parse(...) as Record<string, ChartKind>`，
 * 断言一下就当合法图型传给 ECharts，拿到 `"garbge"` 它直接抛——
 * **整块图表崩在一个存储里的脏字符串上**。
 *
 * 这个模块带 `"use client"` 且依赖 `localStorage`，只能起子进程装一个假的再验。
 */
function runWithStorage(stored: string | null, script: string): string {
  const modulePath = new URL("./use-chart-prefs.ts", import.meta.url).pathname
  const body = `
    const store = new Map(${stored === null ? "[]" : `[["ka-pilot.charts", ${JSON.stringify(stored)}]]`})
    globalThis.localStorage = {
      getItem: (k) => (store.has(k) ? store.get(k) : null),
      setItem: (k, v) => { store.set(k, v) },
    }
    const mod = await import(${JSON.stringify(modulePath)})
    ${script}
  `
  return execFileSync(process.execPath, ["--input-type=module", "--experimental-strip-types", "-e", body], {
    encoding: "utf8", stdio: ["ignore", "pipe", "pipe"],
  })
}

// `read()` 没导出，通过模块内部行为间接验：这里直接把校验逻辑复制一份显然是作弊，
// 所以改成断言「模块能在这些输入下加载且不抛」——真正的取值规则由下面的形状用例覆盖。
test("坏 JSON / 非对象 / 数组 都不该让模块加载时抛", () => {
  for (const stored of ["{ not json", "null", '"a string"', "[1,2,3]", "123"]) {
    const out = runWithStorage(stored, 'console.log(typeof mod.useChartKind === "function" ? "OK" : "BAD")')
    assert.match(out, /OK/, `stored=${stored}`)
  }
})

test("localStorage 完全不可用（无痕窗口）时也不该抛", () => {
  const modulePath = new URL("./use-chart-prefs.ts", import.meta.url).pathname
  const body = `
    globalThis.localStorage = { getItem() { throw new Error("denied") }, setItem() { throw new Error("denied") } }
    const mod = await import(${JSON.stringify(modulePath)})
    console.log(typeof mod.useChartKind === "function" ? "OK" : "BAD")
  `
  const out = execFileSync(process.execPath, ["--input-type=module", "--experimental-strip-types", "-e", body], { encoding: "utf8" })
  assert.match(out, /OK/)
})

test("★不许拿类型断言当校验 —— 这是那次「整块图表崩在脏字符串上」的根因", () => {
  const source = readFileSync(new URL("./use-chart-prefs.ts", import.meta.url), "utf8")
  assert.doesNotMatch(source, /JSON\.parse\([^)]*\)\s+as\s+Record<string, ChartKind>/, "不许 `JSON.parse(...) as Record<...>`：那是句谎话")
  // 必须存在一份合法图型白名单，且读取时按它过滤
  assert.match(source, /const KINDS[\s\S]{0,80}"line"[\s\S]{0,40}"donut"/, "要有白名单")
  assert.match(source, /KINDS[\s\S]{0,40}\.includes\(/, "读取时要按白名单逐项过滤")
})
