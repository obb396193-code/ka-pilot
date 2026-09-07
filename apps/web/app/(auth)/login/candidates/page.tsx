import Link from "next/link"

import Login01 from "@/components/blocks/login-01/page"
import Login02 from "@/components/blocks/login-02/page"
import Login03 from "@/components/blocks/login-03/page"
import Login04 from "@/components/blocks/login-04/page"
import Login05 from "@/components/blocks/login-05/page"

// 登录页候选（shadcn 官方 Blocks login-01～05 原样渲染，给老板挑）；正式页 /login 目前采用 login-03 的壳
const candidates = [
  { id: "login-01", title: "login-01 · 最简单的卡片", note: "一张卡，标题 + 两个输入 + 按钮", Block: Login01 },
  { id: "login-02", title: "login-02 · 左表单右大图", note: "两栏，右侧放品牌图；内网无图需自备", Block: Login02 },
  { id: "login-03", title: "login-03 · 灰底居中卡（正式页现用）", note: "顶部 logo，卡片带第三方登录位（我们放 BUC 占位）", Block: Login03 },
  { id: "login-04", title: "login-04 · 卡内左右分栏", note: "表单 + 图在同一张卡里", Block: Login04 },
  { id: "login-05", title: "login-05 · 只有邮箱的极简", note: "一栏输入；不适合用户名 + 密码", Block: Login05 },
]

export default function LoginCandidatesPage() {
  return (
    <div className="bg-[#ebebeb] px-6 py-8 font-sans">
      <div className="mx-auto max-w-[1320px]">
        <h1 className="text-2xl font-semibold tracking-tight">登录页候选 · shadcn 官方 Blocks</h1>
        <p className="mt-1 text-sm text-muted-foreground">五块官方登录 Block 原样渲染（英文文案、示例图均为上游原样）。正式页 <Link href="/login" className="underline underline-offset-4">/login</Link> 现在用 login-03 的壳做了业务适配。回编号即可换。</p>
        <div className="mt-6 flex flex-col gap-8">
          {candidates.map(({ id, title, note, Block }) => (
            <section key={id} className="overflow-hidden rounded-2xl border bg-background shadow-sm">
              <header className="flex items-baseline gap-3 border-b px-5 py-3">
                <span className="text-base font-semibold">{title}</span>
                <span className="text-xs text-muted-foreground">{note}</span>
              </header>
              <div className="max-h-[720px] overflow-hidden [&>div]:min-h-0! [&>div]:py-10">
                <Block />
              </div>
            </section>
          ))}
        </div>
      </div>
    </div>
  )
}
