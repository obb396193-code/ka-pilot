"use client"

import { useState } from "react"
import { IconLock } from "@tabler/icons-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { fmtTime, isOk } from "@/lib/fixtures/contract"
import { passwordChangedFixture, passwordErrorFixture } from "@/lib/fixtures/settings"

// F8-3 账号安全（契约 v1.7.6 `POST /auth/password`）：改密成功后其他设备下线。
// 接口接入前走 fixture：当前密码填 `wrong` 演示失败分支，其余走成功分支。
const MIN_LENGTH = 8

export function PasswordForm() {
  const [current, setCurrent] = useState("")
  const [next, setNext] = useState("")
  const [confirm, setConfirm] = useState("")
  const [pending, setPending] = useState(false)

  const tooShort = next.length > 0 && next.length < MIN_LENGTH
  const mismatch = confirm.length > 0 && confirm !== next
  const sameAsCurrent = next.length > 0 && next === current
  const canSubmit = current.length > 0 && next.length >= MIN_LENGTH && confirm === next && !sameAsCurrent && !pending

  const submit = () => {
    setPending(true)
    // 演示分支：当前密码填 wrong 时走 fixture 的失败响应
    const failed = current.trim().toLowerCase() === "wrong"
    window.setTimeout(() => {
      setPending(false)
      if (failed) {
        const message = !isOk(passwordErrorFixture) ? passwordErrorFixture.error.message : "当前密码不正确"
        toast.error("改密码失败", { description: message })
        return
      }
      const data = isOk(passwordChangedFixture) ? passwordChangedFixture.data : null
      toast.success("密码已修改", { description: data ? `${fmtTime(data.changedAt)} · 其他 ${data.otherSessionsRevoked} 台设备已下线` : "其他设备已下线" })
      setCurrent(""); setNext(""); setConfirm("")
    }, 300)
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base"><IconLock className="size-4" />账号安全</CardTitle>
        <CardDescription>改密码后，你在其他设备上的登录会立刻失效，需要重新登录。</CardDescription>
      </CardHeader>
      <CardContent className="flex max-w-md flex-col gap-3">
        <div className="grid gap-1.5">
          <Label htmlFor="current-password">当前密码</Label>
          <Input id="current-password" type="password" autoComplete="current-password" value={current} onChange={(event) => setCurrent(event.target.value)} disabled={pending} />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="new-password">新密码</Label>
          <Input id="new-password" type="password" autoComplete="new-password" value={next} onChange={(event) => setNext(event.target.value)} disabled={pending} aria-invalid={tooShort || sameAsCurrent} />
          <p className={tooShort || sameAsCurrent ? "text-xs text-status-critical" : "text-xs text-muted-foreground"}>
            {sameAsCurrent ? "新密码不能和当前密码一样" : tooShort ? `至少 ${MIN_LENGTH} 位` : `至少 ${MIN_LENGTH} 位，建议混合字母和数字`}
          </p>
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="confirm-password">确认新密码</Label>
          <Input id="confirm-password" type="password" autoComplete="new-password" value={confirm} onChange={(event) => setConfirm(event.target.value)} disabled={pending} aria-invalid={mismatch} />
          {mismatch ? <p className="text-xs text-status-critical">两次输入不一致</p> : null}
        </div>
        <div className="flex items-center gap-3">
          <Button size="sm" disabled={!canSubmit} onClick={submit}>{pending ? "提交中…" : "修改密码"}</Button>
          <span className="text-xs text-muted-foreground">忘了当前密码就找管理员重置</span>
        </div>
      </CardContent>
    </Card>
  )
}
