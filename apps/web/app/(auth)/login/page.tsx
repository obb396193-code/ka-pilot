import { LoginDirection } from "@/components/business/auth/login-directions"

// 正式登录页：左右分屏 + 「光谱」动效。老板 2026-09-07 定案——不用 Codex 出图，就用这版；
// 候选对比页 /login/directions 与 /login/candidates 已按 F8-7 删除。
export default function LoginPage() {
  return <LoginDirection variant="split" panel="iridescence" />
}
