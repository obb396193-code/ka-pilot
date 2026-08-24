import { dataQueryResponseSchema, type DataQueryResponse, type QueryRequest } from "./contracts.ts"
import { getMockResponse } from "./mock-data.ts"

export const INTERNAL_DATA_QUERY_PATH = "/api/internal/data-query"
type FetchLike = (input: string, init?: RequestInit) => Promise<Response>
type ClientOptions = { mode?: "mock" | "internal_api"; fetchImpl?: FetchLike; allowMock?: boolean }
export interface DataClient { query(request: QueryRequest): Promise<DataQueryResponse> }

class MockDataClient implements DataClient { async query(request: QueryRequest) { return getMockResponse(request) } }
class InternalApiDataClient implements DataClient {
  private readonly fetchImpl: FetchLike
  constructor(fetchImpl: FetchLike) { this.fetchImpl = fetchImpl }
  async query(request: QueryRequest) {
    const { queryId, dataView, params } = request
    const response = await this.fetchImpl(INTERNAL_DATA_QUERY_PATH, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ queryId, dataView, params }), cache: "no-store", signal: AbortSignal.timeout(12_000) })
    const payload = await response.json()
    return dataQueryResponseSchema.parse(payload)
  }
}
export function createDataClient(options: ClientOptions = {}): DataClient {
  const unknownKeys = Object.keys(options).filter((key) => !["mode", "fetchImpl", "allowMock"].includes(key))
  if (unknownKeys.length) throw new Error(`Unsupported data client configuration: ${unknownKeys.join(", ")}`)
  const mode = options.mode ?? "internal_api"
  if (mode === "mock") {
    if (!options.allowMock) throw new Error("Mock provider must be explicitly enabled for local development")
    return new MockDataClient()
  }
  if (mode !== "internal_api") throw new Error(`Unsupported data provider: ${mode}`)
  return new InternalApiDataClient(options.fetchImpl ?? fetch)
}
export function runtimeDataClient(): { client: DataClient; isMock: boolean } {
  const isMock = process.env.NEXT_PUBLIC_KA_DATA_PROVIDER === "mock"
  if (isMock && process.env.NODE_ENV === "production") throw new Error("Mock provider is disabled in production")
  return { client: createDataClient({ mode: isMock ? "mock" : "internal_api", allowMock: isMock }), isMock }
}
