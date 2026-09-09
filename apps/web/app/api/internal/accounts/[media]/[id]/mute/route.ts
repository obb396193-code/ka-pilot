import { handleR010CommandRoute } from "@/lib/data/r010-command-server"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export const POST = handleR010CommandRoute
// Explicit rejection preserves the error envelope/requestId instead of Next's
// automatic, unrelated 405. These aliases do not enable mutation methods.
export const GET = handleR010CommandRoute
export const HEAD = handleR010CommandRoute
export const PUT = handleR010CommandRoute
export const PATCH = handleR010CommandRoute
export const DELETE = handleR010CommandRoute
export const OPTIONS = handleR010CommandRoute
