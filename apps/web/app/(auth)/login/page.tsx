import { LoginDirection } from "@/components/business/auth/login-directions"

// 正式登录页：左右分屏 + 「光谱」动效。老板 2026-09-07 定案——不用 Codex 出图，就用这版；
// 候选对比页 /login/directions 与 /login/candidates 已按 F8-7 删除。
// F8-12 访客浏览：后端只在 GUEST_ACCESS_ENABLED=1 时受理 {provider:"guest"}，
// 所以这里在服务端读同一个开关决定按钮显不显——没开就不给入口，而不是点了才说不行。
// 这页本来就是服务端渲染，读 env 不用额外开一条 capabilities 请求。
export default function LoginPage() {
  const guestEnabled = process.env.GUEST_ACCESS_ENABLED === "1" || process.env.NEXT_PUBLIC_KA_DATA_PROVIDER === "mock"
  return <LoginDirection variant="split" panel="iridescence" guestEnabled={guestEnabled} />
}
