import { LoginDirection } from "@/components/business/auth/login-directions"

// 正式登录页（老板 2026-09-05）：左右分屏 + 「光谱」动效顶着，等 Codex 生的品牌图到了换图版（inbox-arch F-006-Q5）。
// 候选对比见 /login/directions；五块 shadcn 官方原样 Block 见 /login/candidates。
export default function LoginPage() {
  return <LoginDirection variant="split" panel="iridescence" />
}
