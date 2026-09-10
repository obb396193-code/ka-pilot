import type { SessionView } from "@/lib/data/session-contracts"

// 仅 NEXT_PUBLIC_KA_DATA_PROVIDER=mock 时使用；形状 = AUTH-001 冻结的 session 成功响应。
// personal id 与 .env.example 的 KA_DATA_DEV_WORKSPACE_ID 一致，保证 mock 下前后一致。
export const MOCK_PERSONAL_WORKSPACE_ID = "00000000-0000-4000-8000-000000000024"
export const MOCK_TEAM_WORKSPACE_ID = "00000000-0000-4000-8000-000000000099"

const personal = { id: MOCK_PERSONAL_WORKSPACE_ID, name: "我的工作台", kind: "personal" as const, role: "admin" as const, readOnly: false, isDemo: false }
const team = { id: MOCK_TEAM_WORKSPACE_ID, name: "团队数据", kind: "team" as const, role: "optimizer" as const, readOnly: true, isDemo: false }

export const mockSessionView: SessionView = {
  identity: {
    id: "00000000-0000-4000-8000-0000000000c1",
    provider: "internal_test",
    displayName: "内测用户",
    mustChangePassword: false,
  },
  activeWorkspace: personal,
  workspaces: [personal, team],
}

// F8-12 访客态预览（仅 mock，`?session=guest`）：形状 = 契约 fixture session-http/guest.json，
// 演示空间是 kind:"team" + isDemo:true（v1.9.12 改口，不再有 demo kind）。
const demo = { id: "00000000-0000-4000-8000-0000000000de", name: "演示空间", kind: "team" as const, role: "viewer" as const, readOnly: true, isDemo: true }

export const mockGuestSessionView: SessionView = {
  identity: { id: "00000000-0000-4000-8000-00000000009e", displayName: "访客", provider: "guest", mustChangePassword: false },
  activeWorkspace: demo,
  workspaces: [demo],
}

// v1.9.14 预览（仅 mock，`?session=must-change`）：本人还没改初始密码，设置页顶部出提示条。
export const mockMustChangePasswordSessionView: SessionView = {
  identity: { id: "00000000-0000-4000-8000-000000000090", displayName: "内测用户", provider: "internal_test", mustChangePassword: true },
  activeWorkspace: personal,
  workspaces: [personal, team],
}
