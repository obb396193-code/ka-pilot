import type { SessionView } from "@/lib/data/session-contracts"

// 仅 NEXT_PUBLIC_KA_DATA_PROVIDER=mock 时使用；形状 = AUTH-001 冻结的 session 成功响应。
// personal id 与 .env.example 的 KA_DATA_DEV_WORKSPACE_ID 一致，保证 mock 下前后一致。
export const MOCK_PERSONAL_WORKSPACE_ID = "00000000-0000-4000-8000-000000000024"
export const MOCK_TEAM_WORKSPACE_ID = "00000000-0000-4000-8000-000000000099"

const personal = { id: MOCK_PERSONAL_WORKSPACE_ID, name: "我的工作台", kind: "personal" as const, role: "admin" as const, readOnly: false }
const team = { id: MOCK_TEAM_WORKSPACE_ID, name: "团队数据", kind: "team" as const, role: "optimizer" as const, readOnly: true }

export const mockSessionView: SessionView = {
  identity: { displayName: "内测用户" },
  activeWorkspace: personal,
  workspaces: [personal, team],
}
