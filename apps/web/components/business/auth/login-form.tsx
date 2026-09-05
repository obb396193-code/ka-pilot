"use client"

import { useState, type FormEvent } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { IconInnerShadowTop } from "@tabler/icons-react"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Field, FieldDescription, FieldGroup, FieldLabel, FieldSeparator } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { loginSession, readSession } from "@/lib/data/session-client"
import { cn } from "@/lib/utils"

// 登录表单业务件：老板 2026-09-05 定「账号密码为主 + BUC 次」。
// 接 AUTH-001 `POST /api/internal/auth/login {provider:"internal_test"}`；401 统一「用户名或密码错误」不区分原因；BUC 按钮占位 disabled。
// frame="card"：shadcn login-03 壳（/login 现用）；frame="plain"：只出表单，壳由三种登录方向页自己给。
export function LoginForm({ className, frame = "card", ...props }: React.ComponentProps<"div"> & { frame?: "card" | "plain" }) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const isMock = process.env.NEXT_PUBLIC_KA_DATA_PROVIDER === "mock"
  const [username, setUsername] = useState("")
  const [password, setPassword] = useState("")
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const nextPath = (() => { const next = searchParams.get("next"); return next && next.startsWith("/") && !next.startsWith("//") ? next : "/" })()

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError(null)
    if (isMock) { router.replace(nextPath); return }
    setPending(true)
    try {
      const response = await loginSession({ provider: "internal_test", username: username.trim(), password })
      if (!response.ok) { setError(response.error.code === "UNAUTHORIZED" ? "用户名或密码错误" : "登录失败，请稍后重试"); return }
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

  const form = (
    <form onSubmit={onSubmit}>
      <FieldGroup>
        <Field>
          <FieldLabel htmlFor="username">用户名</FieldLabel>
          <Input id="username" autoComplete="username" placeholder="内测账号" required={!isMock} value={username} onChange={(event) => setUsername(event.target.value)} disabled={pending} />
        </Field>
        <Field>
          <FieldLabel htmlFor="password">密码</FieldLabel>
          <Input id="password" type="password" autoComplete="current-password" required={!isMock} value={password} onChange={(event) => setPassword(event.target.value)} disabled={pending} />
        </Field>
        {error ? <p role="alert" className="text-sm text-status-critical">{error}</p> : null}
        <Field>
          <Button type="submit" disabled={pending}>{pending ? "登录中…" : isMock ? "进入工作台" : "登录"}</Button>
        </Field>
        <FieldSeparator className={cn(frame === "card" && "*:data-[slot=field-separator-content]:bg-card")}>或</FieldSeparator>
        <Field>
          <Button variant="outline" type="button" disabled title="内测后开放">
            <IconInnerShadowTop className="size-4" />
            BUC 登录（内测后开放）
          </Button>
          <FieldDescription className="text-center">登录后默认进入你的个人空间；团队数据可在侧栏切换。</FieldDescription>
        </Field>
      </FieldGroup>
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
