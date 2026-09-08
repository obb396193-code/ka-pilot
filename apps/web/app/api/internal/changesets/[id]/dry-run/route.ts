import { handleR010CommandRoute } from "@/lib/data/r010-command-server"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export const POST = handleR010CommandRoute
export const GET = handleR010CommandRoute
export const HEAD = handleR010CommandRoute
export const PUT = handleR010CommandRoute
export const PATCH = handleR010CommandRoute
export const DELETE = handleR010CommandRoute
export const OPTIONS = handleR010CommandRoute
