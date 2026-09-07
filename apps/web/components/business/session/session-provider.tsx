"use client"

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react"
import { useRouter } from "next/navigation"

import { logoutSession, readSession, switchWorkspace as requestWorkspaceSwitch } from "@/lib/data/session-client"
import type { SessionHttpResponse, SessionView } from "@/lib/data/session-contracts"
import { mockSessionView } from "./mock-session"

export type SessionStatus = "loading" | "ready" | "unauthenticated" | "error"

type SwitchResult = { ok: true } | { ok: false; message: string }

type SessionContextValue = {
  status: SessionStatus
  session: SessionView | null
  isMock: boolean
  switching: boolean
  switchWorkspace(workspaceId: string): Promise<SwitchResult>
  logout(): Promise<void>
  refresh(): Promise<void>
}

const SessionContext = createContext<SessionContextValue | null>(null)

function isSessionView(response: SessionHttpResponse): response is Extract<SessionHttpResponse, { ok: true; data: SessionView }> {
  return response.ok && "activeWorkspace" in response.data
}

// 浏览器只消费服务端 session（AUTH-001）；这里不保存任何 token、scope 或账户明细。
export function SessionProvider({ children }: { children: ReactNode }) {
  const isMock = process.env.NEXT_PUBLIC_KA_DATA_PROVIDER === "mock"
  const router = useRouter()
  const [status, setStatus] = useState<SessionStatus>(isMock ? "ready" : "loading")
  const [session, setSession] = useState<SessionView | null>(isMock ? mockSessionView : null)
  const [switching, setSwitching] = useState(false)

  const refresh = useCallback(async () => {
    if (isMock) return
    try {
      const response = await readSession()
      if (isSessionView(response)) { setSession(response.data); setStatus("ready"); return }
      if (!response.ok && (response.error.code === "UNAUTHORIZED" || response.error.code === "FORBIDDEN")) { setSession(null); setStatus("unauthenticated"); return }
      setSession(null); setStatus("error")
    } catch {
      // 会话接口尚未部署或返回非 JSON：不猜身份，按未知处理
      setSession(null); setStatus("error")
    }
  }, [isMock])

  useEffect(() => { void refresh() }, [refresh])

  const switchWorkspace = useCallback(async (workspaceId: string): Promise<SwitchResult> => {
    if (!session) return { ok: false, message: "当前没有可用会话" }
    if (workspaceId === session.activeWorkspace.id) return { ok: true }
    const target = session.workspaces.find((workspace) => workspace.id === workspaceId)
    if (!target) return { ok: false, message: "没有进入该空间的权限" }
    if (isMock) { setSession({ ...session, activeWorkspace: target }); return { ok: true } }
    setSwitching(true)
    try {
      const response = await requestWorkspaceSwitch({ workspaceId })
      if (isSessionView(response)) { setSession(response.data); router.refresh(); return { ok: true } }
      return { ok: false, message: response.ok ? "切换未生效" : response.error.message }
    } catch {
      return { ok: false, message: "切换空间失败，请稍后重试" }
    } finally {
      setSwitching(false)
    }
  }, [isMock, router, session])

  const logout = useCallback(async () => {
    if (!isMock) { try { await logoutSession() } catch { /* 幂等；失败也回登录页 */ } }
    setSession(null); setStatus("unauthenticated")
    router.replace("/login")
  }, [isMock, router])

  const value = useMemo<SessionContextValue>(() => ({ status, session, isMock, switching, switchWorkspace, logout, refresh }), [status, session, isMock, switching, switchWorkspace, logout, refresh])
  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>
}

export function useSession(): SessionContextValue {
  const value = useContext(SessionContext)
  if (!value) throw new Error("useSession must be used inside SessionProvider")
  return value
}

// 切空间 = 切数据源：以 activeWorkspace.id 作 key 重挂内容区，所有页面查询随之重新发起。
export function WorkspaceScope({ children }: { children: ReactNode }) {
  const { session } = useSession()
  return <div key={session?.activeWorkspace.id ?? "anonymous"} className="contents">{children}</div>
}
