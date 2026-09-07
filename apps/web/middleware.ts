import { NextResponse, type NextRequest } from "next/server"

// 未登录跳 /login（AUTH-001：浏览器只认服务端 HttpOnly ka_session cookie；这里只看有没有，真伪由 BFF fail-closed）。
// mock 模式没有会话服务，跳过；/login、静态资源、api 不拦。
const SESSION_COOKIE = "ka_session"
const PUBLIC_PATHS = ["/login"]

export function middleware(request: NextRequest) {
  if (process.env.NEXT_PUBLIC_KA_DATA_PROVIDER === "mock") return NextResponse.next()
  const { pathname } = request.nextUrl
  if (PUBLIC_PATHS.some((path) => pathname === path || pathname.startsWith(`${path}/`))) return NextResponse.next()
  if (request.cookies.has(SESSION_COOKIE)) return NextResponse.next()
  const login = request.nextUrl.clone()
  login.pathname = "/login"
  login.search = pathname === "/" ? "" : `?next=${encodeURIComponent(pathname + request.nextUrl.search)}`
  return NextResponse.redirect(login)
}

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico|avatars|fonts).*)"],
}
