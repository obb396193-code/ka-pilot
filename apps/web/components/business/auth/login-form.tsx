"use client"

import { useState, type FormEvent } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { IconEye, IconInnerShadowTop } from "@tabler/icons-react"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Field, FieldDescription, FieldGroup, FieldLabel, FieldSeparator } from "@/components/ui/field"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { resolveErrorMessage } from "@/lib/data/contracts"
import { loginSession, readSession } from "@/lib/data/session-client"
import { cn } from "@/lib/utils"

// 登录表单业务件：老板 2026-09-05 定「账号密码为主 + BUC 次」。
// 接 AUTH-001 `POST /api/internal/auth/login {provider:"internal_test"}`；401 统一「用户名或密码错误」不区分原因；BUC 按钮占位 disabled。
// frame="card"：shadcn login-03 壳（/login 现用）；frame="plain"：只出表单，壳由三种登录方向页自己给。
export function LoginForm({ className, frame = "card", guestEnabled = false, ...props }: React.ComponentProps<"div"> & { frame?: "card" | "plain"; guestEnabled?: boolean }) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const isMock = process.env.NEXT_PUBLIC_KA_DATA_PROVIDER === "mock"
  const [username, setUsername] = useState("")
  const [password, setPassword] = useState("")
  const [helpOpen, setHelpOpen] = useState(false)
  const [pending, setPending] = useState(false)
  const [guestPending, setGuestPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const nextPath = (() => { const next = searchParams.get("next"); return next && next.startsWith("/") && !next.startsWith("//") ? next : "/" })()

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError(null)
    if (isMock) { router.replace(nextPath); return }
    setPending(true)
    try {
      const response = await loginSession({ provider: "internal_test", username: username.trim(), password })
      // 401 统一「用户名或密码错误」不区分原因；429 限速要说清等多久，不当「登录失败」（F8-14）。
      // 表单内容一律保留：报错后重填一遍用户名很招人烦。
      if (!response.ok) { setError(response.error.code === "UNAUTHORIZED" ? "用户名或密码错误" : resolveErrorMessage(response.error.code, "登录失败，请稍后重试")); return }
      const session = await readSession()
      if (!session.ok) { setError("登录成功但读取会话失败，请重试"); return }
      router.replace(nextPath)
      router.refresh()
    } catch {
      setError("登录服务暂时不可用，请稍后重试")
    } finally {
      setPending(false)
    }
  }

  // F8-12 访客浏览（契约 v1.9.6）：匿名会话，进的是只读演示空间；后端只在 GUEST_ACCESS_ENABLED=1 时开放，
  // 所以按钮由服务端传下来的 guestEnabled 决定显不显——没开时干脆不给这个入口，而不是点了才说不行。
  async function enterAsGuest() {
    setError(null)
    if (isMock) { router.replace("/?session=guest"); return }
    setGuestPending(true)
    try {
      const response = await loginSession({ provider: "guest" })
      if (!response.ok) { setError(resolveErrorMessage(response.error.code, "访客浏览暂时不可用，请用账号登录")); return }
      router.replace("/")
      router.refresh()
    } catch {
      setError("访客浏览暂时不可用，请用账号登录")
    } finally {
      setGuestPending(false)
    }
  }

  const form = (
    <form onSubmit={onSubmit}>
      <FieldGroup>
        <Field>
          <FieldLabel htmlFor="username">用户名</FieldLabel>
          <Input id="username" autoComplete="username" placeholder="内测账号" required={!isMock} value={username} onChange={(event) => setUsername(event.target.value)} disabled={pending} />
        </Field>
        <Field>
          <div className="flex items-center justify-between gap-2">
            <FieldLabel htmlFor="password">密码</FieldLabel>
            <button type="button" className="text-xs text-muted-foreground underline-offset-2 hover:underline" onClick={() => setHelpOpen(true)}>忘记密码？</button>
          </div>
          <Input id="password" type="password" autoComplete="current-password" required={!isMock} value={password} onChange={(event) => setPassword(event.target.value)} disabled={pending} />
        </Field>
        {error ? <p role="alert" className="text-sm text-status-critical">{error}</p> : null}
        <Field>
          <Button type="submit" disabled={pending}>{pending ? "登录中…" : isMock ? "进入工作台" : "登录"}</Button>
        </Field>
        <FieldSeparator className={cn(frame === "card" && "*:data-[slot=field-separator-content]:bg-card")}>或</FieldSeparator>
        <Field>
          {guestEnabled ? (
            <Button variant="outline" type="button" onClick={() => void enterAsGuest()} disabled={guestPending || pending}>
              <IconEye className="size-4" />
              {guestPending ? "进入中…" : "访客浏览（演示数据，只读）"}
            </Button>
          ) : null}
          <Button variant="outline" type="button" disabled title="内测后开放">
            <IconInnerShadowTop className="size-4" />
            BUC 登录（内测后开放）
          </Button>
          <FieldDescription className="text-center">
            {guestEnabled ? "访客看到的是脱敏样例，不能新建和改动；想用真数据找管理员开户。" : "登录后默认进入你的个人空间；团队数据可在侧栏切换。"}
          </FieldDescription>
        </Field>
      </FieldGroup>

      <Dialog open={helpOpen} onOpenChange={setHelpOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>忘记密码</DialogTitle><DialogDescription>内测期账号由管理员统一发放，还没有自助找回。</DialogDescription></DialogHeader>
          <ol className="flex list-decimal flex-col gap-1.5 pl-4 text-sm">
            <li>找你们的对接人或工作区管理员，说明用户名，请他在「治理后台 · 成员与授权」里重置。</li>
            <li>重置后会给你一个临时密码，登录后尽快在「设置 · 个人资料」里改掉（改密接口开放后可自助改）。</li>
            <li>连续输错不会锁号，但会记一条登录失败审计。</li>
          </ol>
          <p className="text-xs text-muted-foreground">正式期切 BUC 登录后，密码由公司统一身份管理，这里不再有密码。</p>
        </DialogContent>
      </Dialog>
    </form>
  )

  if (frame === "plain") return <div className={cn("flex flex-col gap-6", className)} {...props}>{form}</div>

  return (
    <div className={cn("flex flex-col gap-6", className)} {...props}>
      <Card>
        <CardHeader className="text-center">
          <CardTitle className="text-xl">登录 KA Pilot</CardTitle>
          <CardDescription>{isMock ? "本地 Mock 模式无需账号，直接进入" : "使用内测账号登录；正式期切换为 BUC"}</CardDescription>
        </CardHeader>
        <CardContent>{form}</CardContent>
      </Card>
    </div>
  )
}
