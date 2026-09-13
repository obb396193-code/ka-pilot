import { dataQueryResponseSchema, type DataQueryResponse, type QueryRequest } from "./contracts.ts"
import { parseTolerant } from "./tolerant-parse.ts"
import { getMockResponse } from "./mock-data.ts"

export const INTERNAL_DATA_QUERY_PATH = "/api/internal/data-query"
/**
 * 盯盘（`account.hourly`）和差异对账（`account.gap`）走的是**另一条**：
 * `/api/internal/query` → 后端 `/api/v1/query`。它们的 params schema 也另有一套
 * （见 `query-params.ts` 里那段说明）。两条路不能混，混了就是 400。
 */
export const INTERNAL_OPERATIONAL_QUERY_PATH = "/api/internal/query"
type FetchLike = (input: string, init?: RequestInit) => Promise<Response>
type ClientOptions = { mode?: "mock" | "internal_api"; fetchImpl?: FetchLike; allowMock?: boolean; endpoint?: "data" | "operational" }
/**
 * `signal` 让调用方**真的取消**在飞的请求，而不只是丢弃它的结果。
 * 连点几次窗口时，丢结果只解决「显示对不对」，请求还是一个个发出去、后端照样算——
 * 取消才省掉那几次白算（审查员 D 的 P1）。
 */
export interface DataClient { query(request: QueryRequest, signal?: AbortSignal): Promise<DataQueryResponse> }

class MockDataClient implements DataClient { async query(request: QueryRequest) { return getMockResponse(request) } }
class InternalApiDataClient implements DataClient {
  private readonly fetchImpl: FetchLike
  private readonly path: string
  constructor(fetchImpl: FetchLike, path: string = INTERNAL_DATA_QUERY_PATH) { this.fetchImpl = fetchImpl; this.path = path }
  async query(request: QueryRequest, signal?: AbortSignal) {
    const { queryId, params } = request
    // 超时仍然要有（12s 是浏览器侧预算）；调用方给了 signal 就两个一起生效，
    // 谁先触发都算取消——不能因为接了取消就把超时兜底丢了
    const abort = signal ? AbortSignal.any([signal, AbortSignal.timeout(12_000)]) : AbortSignal.timeout(12_000)
    const response = await this.fetchImpl(this.path, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ queryId, params }), cache: "no-store", signal: abort })
    const payload = await response.json()
    // 同 F8-28 的规则：多出来的字段不该把整条响应打死
    const tolerant = parseTolerant(dataQueryResponseSchema, payload, `data/query ${queryId}`)
    if (!tolerant.ok) return dataQueryResponseSchema.parse(payload) // 让 zod 抛出可读的错，交由上层的 catch 呈现
    return tolerant.data
  }
}
export function createDataClient(options: ClientOptions = {}): DataClient {
  const unknownKeys = Object.keys(options).filter((key) => !["mode", "fetchImpl", "allowMock", "endpoint"].includes(key))
  if (unknownKeys.length) throw new Error(`Unsupported data client configuration: ${unknownKeys.join(", ")}`)
  // ★只查键名不够：`endpoint: "https://evil.example/query"` 键名是对的、值是个任意 URL。
  // 这个客户端只许指向自家那两条内部路径，别的一律不认（client.test.ts 里那条绊线就是防这个）。
  if (options.endpoint !== undefined && options.endpoint !== "data" && options.endpoint !== "operational") {
    throw new Error(`Unsupported data client endpoint: ${String(options.endpoint)}`)
  }
  const mode = options.mode ?? "internal_api"
  if (mode === "mock") {
    if (!options.allowMock) throw new Error("Mock provider must be explicitly enabled for local development")
    return new MockDataClient()
  }
  if (mode !== "internal_api") throw new Error(`Unsupported data provider: ${mode}`)
  // 浏览器里 `fetch` 必须以 window 为 this 调用；把裸 `fetch` 存成实例方法再 `this.fetchImpl(...)` 会抛
  // "Failed to execute 'fetch' on 'Window': Illegal invocation"（2026-09-10 概览页真实模式整页读取失败，arch 热修）。
  // 之前只有服务端用这条路，Node 的 fetch 不挑 this，所以没炸。
  return new InternalApiDataClient(
    options.fetchImpl ?? ((input, init) => fetch(input, init)),
    options.endpoint === "operational" ? INTERNAL_OPERATIONAL_QUERY_PATH : INTERNAL_DATA_QUERY_PATH,
  )
}
export function runtimeDataClient(endpoint: "data" | "operational" = "data"): { client: DataClient; isMock: boolean } {
  const isMock = process.env.NEXT_PUBLIC_KA_DATA_PROVIDER === "mock"
  if (isMock && process.env.NODE_ENV === "production") throw new Error("Mock provider is disabled in production")
  return { client: createDataClient({ mode: isMock ? "mock" : "internal_api", allowMock: isMock, endpoint }), isMock }
}
