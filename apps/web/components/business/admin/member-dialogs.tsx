"use client"

import { useState } from "react"
import { IconCheck, IconCopy, IconKey, IconPlus } from "@tabler/icons-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { useSession } from "@/components/business/session/session-provider"
import { isOk } from "@/lib/fixtures/contract"
import { resolveErrorMessage } from "@/lib/data/contracts"
import { MEMBER_USERNAME_PATTERN, memberCreatedFixture, memberResetPasswordFixture, roleLabel, type Member } from "@/lib/fixtures/admin"

// F8-11（契约 v1.9.5）：现在没有自助注册入口，内测同事由管理员在这里开号。
// 两条端点都回一次性 initialPassword —— 关掉面板后**任何接口都拿不回来**，只能再重置一次。

/** 一次性初始密码面板：两条端点共用。等宽显示 + 复制 + 把「关掉就没了」写在人眼前。 */
function OneTimePassword({ password, note }: { password: string; note: string }) {
  const [copied, setCopied] = useState(false)
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(password)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 2000)
    } catch {
      // 非 https / 无剪贴板权限时不假装成功：让用户自己选中复制
      toast("复制失败", { description: "手动选中上面的密码复制" })
    }
  }
  return (
    <div className="flex flex-col gap-2 rounded-lg border border-status-warning/40 bg-status-warning/5 p-3">
      <div className="flex items-center gap-2">
        <code className="flex-1 rounded bg-background px-2 py-1.5 font-mono text-sm break-all select-all">{password}</code>
        <Button size="sm" variant="outline" onClick={copy} aria-label="复制初始密码">
          {copied ? <IconCheck className="text-status-success" /> : <IconCopy />}{copied ? "已复制" : "复制"}
        </Button>
      </div>
      <p className="text-xs text-status-warning">关闭后不再显示：这串密码只在这一次返回，关掉就查不回来了，只能重新重置一次。</p>
      <p className="text-xs text-muted-foreground">{note}</p>
    </div>
  )
}

// 按「给谁开号最常见」排，不按字母序
const ROLES: Member["role"][] = ["operator", "lead", "admin", "viewer"]

export function AddMemberDialog({ open, onOpenChange, onCreated }: {
  open: boolean
  onOpenChange: (open: boolean) => void
  onCreated: (member: Member) => void
}) {
  const { isMock } = useSession()
  const [displayName, setDisplayName] = useState("")
  const [username, setUsername] = useState("")
  const [role, setRole] = useState<Member["role"]>("operator")
  const [password, setPassword] = useState("")
  const [pending, setPending] = useState(false)
  const [created, setCreated] = useState<{ displayName: string; initialPassword: string; loginName: string } | null>(null)

  // 登录名当场校验：中文名不能当用户名（后端规则 ^[A-Za-z0-9._@-]{1,128}$），提交后才报错太晚
  const usernameBad = username.length > 0 && !MEMBER_USERNAME_PATTERN.test(username)
  const hasChinese = /[一-龥]/.test(username)
  const canSubmit = displayName.trim().length > 0 && username.length > 0 && !usernameBad && !pending

  const reset = () => { setDisplayName(""); setUsername(""); setRole("operator"); setPassword(""); setCreated(null) }
  const close = (next: boolean) => { onOpenChange(next); if (!next) reset() }

  const submit = async () => {
    setPending(true)
    try {
      if (isMock) {
        const fixture = isOk(memberCreatedFixture) ? memberCreatedFixture.data : null
        if (!fixture) { toast.error("新增失败", { description: "示例数据缺失" }); return }
        setCreated({ displayName: displayName.trim(), initialPassword: fixture.initialPassword, loginName: username })
        onCreated({ ...fixture, displayName: displayName.trim(), role, mustChangePassword: true })
        return
      }
      const response = await fetch("/api/internal/admin/members", {
        method: "POST", credentials: "same-origin",
        headers: { "content-type": "application/json", accept: "application/json" },
        body: JSON.stringify({
          display_name: displayName.trim(),
          provider: "internal_test",
          provider_subject: username,
          role,
          // 不填就让服务端生成 16 位随机密码，比人拍的强
          ...(password.length > 0 ? { initial_password: password } : {}),
        }),
      })
      const body = await response.json().catch(() => null)
      if (!response.ok || !body?.ok) {
        toast.error("新增成员失败", { description: resolveErrorMessage(body?.error?.code ?? "", body?.error?.message ?? `请求失败（${response.status}）`) })
        return
      }
      // 登录名以后端回的 loginName 为准（v1.9.21）：服务端可能规范化过，显示我们输入的那份会对不上
      setCreated({ displayName: body.data.displayName, initialPassword: body.data.initialPassword, loginName: body.data.loginName ?? username })
      onCreated(body.data as Member)
    } catch {
      toast.error("新增成员失败", { description: "网络异常，稍后重试" })
    } finally {
      setPending(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent className="sm:max-w-md">
        {created ? (
          <>
            <DialogHeader>
              <DialogTitle>{created.displayName} 的初始密码</DialogTitle>
              <DialogDescription>把用户名和这串密码一起发给 TA，首次登录后让 TA 自己改掉。</DialogDescription>
            </DialogHeader>
            <OneTimePassword password={created.initialPassword} note={`登录名：${created.loginName}`} />
            <DialogFooter><Button size="sm" onClick={() => close(false)}>我已保存，关闭</Button></DialogFooter>
          </>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle>新增成员</DialogTitle>
              <DialogDescription>内测期没有自助注册，管理员在这里开号；建完会给一串一次性初始密码。</DialogDescription>
            </DialogHeader>
            <div className="flex flex-col gap-3">
              <div className="grid gap-1.5">
                <Label htmlFor="member-display-name">显示名</Label>
                <Input id="member-display-name" value={displayName} onChange={(event) => setDisplayName(event.target.value)} placeholder="张三" disabled={pending} />
                <p className="text-xs text-muted-foreground">界面上显示的名字，可以是中文。</p>
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="member-username">登录名</Label>
                <Input id="member-username" value={username} onChange={(event) => setUsername(event.target.value)} placeholder="zhangsan / 工号" autoComplete="off" disabled={pending} aria-invalid={usernameBad} />
                <p className={usernameBad ? "text-xs text-status-critical" : "text-xs text-muted-foreground"}>
                  {hasChinese ? "登录名不能用中文，用拼音或工号" : usernameBad ? "只能用字母、数字和 . _ @ -" : "只能用字母、数字和 . _ @ -（中文名用拼音或工号）"}
                </p>
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="member-role">角色</Label>
                <Select value={role} onValueChange={(value) => setRole(value as Member["role"])}>
                  <SelectTrigger id="member-role" size="sm" className="w-full"><SelectValue /></SelectTrigger>
                  <SelectContent>{ROLES.map((item) => <SelectItem key={item} value={item}>{roleLabel[item]}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="member-password">初始密码（可不填）</Label>
                <Input id="member-password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder="留空 = 系统生成 16 位随机密码" autoComplete="off" disabled={pending} />
                <p className="text-xs text-muted-foreground">留空更安全：系统随机生成，同样只显示这一次。</p>
              </div>
            </div>
            <DialogFooter>
              <Button size="sm" variant="outline" onClick={() => close(false)} disabled={pending}>取消</Button>
              <Button size="sm" onClick={submit} disabled={!canSubmit}><IconPlus />{pending ? "创建中…" : "创建"}</Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}

export function ResetPasswordDialog({ member, onOpenChange, onReset }: {
  member: Member | null
  onOpenChange: (open: boolean) => void
  onReset: (identityId: string) => void
}) {
  const { isMock } = useSession()
  const [pending, setPending] = useState(false)
  const [result, setResult] = useState<{ initialPassword: string; sessionsRevoked: number } | null>(null)

  const close = (next: boolean) => { onOpenChange(next); if (!next) setResult(null) }

  const submit = async () => {
    if (!member) return
    setPending(true)
    try {
      if (isMock) {
        const fixture = isOk(memberResetPasswordFixture) ? memberResetPasswordFixture.data : null
        if (!fixture) { toast.error("重置失败", { description: "示例数据缺失" }); return }
        setResult({ initialPassword: fixture.initialPassword, sessionsRevoked: fixture.sessionsRevoked })
        onReset(member.identityId)
        return
      }
      const response = await fetch(`/api/internal/admin/members/${encodeURIComponent(member.identityId)}/reset-password`, {
        method: "POST", credentials: "same-origin",
        headers: { "content-type": "application/json", accept: "application/json" },
        body: "{}",
      })
      const body = await response.json().catch(() => null)
      if (!response.ok || !body?.ok) {
        toast.error("重置密码失败", { description: resolveErrorMessage(body?.error?.code ?? "", body?.error?.message ?? `请求失败（${response.status}）`) })
        return
      }
      setResult({ initialPassword: body.data.initialPassword, sessionsRevoked: body.data.sessionsRevoked })
      onReset(member.identityId)
    } catch {
      toast.error("重置密码失败", { description: "网络异常，稍后重试" })
    } finally {
      setPending(false)
    }
  }

  return (
    <Dialog open={member !== null} onOpenChange={close}>
      <DialogContent className="sm:max-w-md">
        {result ? (
          <>
            <DialogHeader>
              <DialogTitle>{member?.displayName} 的新初始密码</DialogTitle>
              <DialogDescription>已把 TA 在 {result.sessionsRevoked} 台设备上的登录踢下线，需要用新密码重新登录。</DialogDescription>
            </DialogHeader>
            <OneTimePassword password={result.initialPassword} note="发给本人后让 TA 首次登录就改掉。" />
            <DialogFooter><Button size="sm" onClick={() => close(false)}>我已保存，关闭</Button></DialogFooter>
          </>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle>重置 {member?.displayName} 的密码？</DialogTitle>
              <DialogDescription>会生成一串新的一次性初始密码，并把 TA 当前所有设备踢下线。原密码立即失效。</DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button size="sm" variant="outline" onClick={() => close(false)} disabled={pending}>取消</Button>
              <Button size="sm" variant="destructive" onClick={submit} disabled={pending}><IconKey />{pending ? "重置中…" : "确认重置"}</Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}
