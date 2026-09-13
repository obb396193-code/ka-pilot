import assert from "node:assert/strict"
import { execFileSync } from "node:child_process"
import test from "node:test"

import { FIXTURES_ENABLED, isOk } from "../fixtures/contract.ts"

/**
 * A35 / F8-25 ① 的门禁：**真实模式下 fixture 一个字节都不许到界面**。
 *
 * 老板拍板「内网不放假数据」。devix 用改库探针证实过：改 account-6 的名字，
 * 页面纹丝不动；账户池九态合计 39 户，库里只有 6 户——一屏看着很真、其实和库对不上的数字，
 * 比空页面坏得多（空页面只是没做完，假数字是错的且看不出来）。
 *
 * 开关收在 `isOk()` 一个函数上：所有 fixture 消费者都得先过它才拿得到 `.data`
 * （这点由 TypeScript 保证——`Fixture<T>` 是联合类型，不窄化编译不过）。
 * 所以这里验的就是那个函数。
 */

test("★真实模式（不设 provider 变量）下 isOk 恒 false —— fixture 到不了界面", () => {
  // `npm test` 本身就跑在没有 NEXT_PUBLIC_KA_DATA_PROVIDER 的环境里，即真实模式
  assert.equal(FIXTURES_ENABLED, false, "测试环境应当等同真实模式")
  assert.equal(isOk({ ok: true, data: { items: [1, 2, 3] } }), false, "真实模式下再「ok」的 fixture 也不许用")
  assert.equal(isOk({ ok: false, error: { code: "X", message: "y" } }), false)
})

test("mock 模式下 fixture 照常可用 —— 开关不是把 fixture 废掉", () => {
  // 同一个模块在两种环境下行为不同，只能起子进程验（模块常量在加载时就定了）
  const script = `
    import assert from "node:assert/strict"
    const { FIXTURES_ENABLED, isOk } = await import("${new URL("../fixtures/contract.ts", import.meta.url).pathname}")
    assert.equal(FIXTURES_ENABLED, true)
    assert.equal(isOk({ ok: true, data: {} }), true)
    assert.equal(isOk({ ok: false, error: { code: "X", message: "y" } }), false)
    console.log("MOCK_OK")
  `
  const out = execFileSync(process.execPath, ["--input-type=module", "--experimental-strip-types", "-e", script], {
    env: { ...process.env, NEXT_PUBLIC_KA_DATA_PROVIDER: "mock" },
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  })
  assert.match(out, /MOCK_OK/)
})
