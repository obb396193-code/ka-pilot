import {
  parseQueryResponse,
  type QueryData,
  type QueryId,
  type QueryRequest,
} from "./contracts.ts"
import type { DataResponse, SourceLineage } from "./data-view.ts"
import { getMockResponse } from "./mock-data.ts"

export const INTERNAL_DATA_QUERY_PATH = "/api/internal/data-query"
type FetchLike = (input: string, init?: RequestInit) => Promise<Response>
type ClientOptions = { mode?: "mock" | "internal_api"; fetchImpl?: FetchLike }

export interface DataClient {
  query<T extends QueryId>(
    request: QueryRequest<T>,
  ): Promise<DataResponse<QueryData<T>>>
}

class MockDataClient implements DataClient {
  async query<T extends QueryId>(request: QueryRequest<T>) {
    return getMockResponse(request)
  }
}

class InternalApiDataClient implements DataClient {
  private readonly fetchImpl: FetchLike

  constructor(fetchImpl: FetchLike) {
    this.fetchImpl = fetchImpl
  }

  async query<T extends QueryId>(request: QueryRequest<T>) {
    const { queryId, dataView, params = {} } = request
    const response = await this.fetchImpl(INTERNAL_DATA_QUERY_PATH, {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({ queryId, dataView, params }),
      cache: "no-store",
      signal: AbortSignal.timeout(10_000),
    })

    if (!response.ok) {
      throw new Error(`KA data query failed with HTTP ${response.status}`)
    }

    return parseQueryResponse(request.queryId, await response.json())
  }
}

export function createDataClient(options: ClientOptions = {}): DataClient {
  const unknownKeys = Object.keys(options).filter((key) => !["mode", "fetchImpl"].includes(key))
  if (unknownKeys.length) throw new Error(`Unsupported data client configuration: ${unknownKeys.join(", ")}`)

  const mode = options.mode ?? process.env.KA_DATA_PROVIDER ?? "mock"
  if (mode === "mock") return new MockDataClient()

  if (mode !== "internal_api") {
    throw new Error(`Unsupported KA_DATA_PROVIDER: ${mode}`)
  }

  return new InternalApiDataClient(options.fetchImpl ?? fetch)
}

export const dataClient = createDataClient()

export async function queryData<T extends QueryId>(
  request: QueryRequest<T>,
): Promise<DataResponse<QueryData<T>>> {
  try {
    return await dataClient.query(request)
  } catch {
    const errorResponse = getMockResponse({ ...request, state: "error" })
    return {
      ...errorResponse,
      lineage: markLineageError(errorResponse.lineage),
      message: "内网数据查询失败，请检查端点、权限和 Contract 映射。",
    }
  }
}

function markLineageError(lineage: DataResponse<unknown>["lineage"]): DataResponse<unknown>["lineage"] {
  const mark = (source: SourceLineage): SourceLineage => ({
    ...source,
    sourceLabel: `内网 API · ${source.sourceLabel}`,
    coverage: "不可用",
    partial: true,
    warnings: ["请求失败或响应未通过候选 Schema；未静默回退到 mock 数据"],
  })
  if (lineage.mode === "single") return { mode: "single", source: mark(lineage.source) }
  return { ...lineage, kaData: mark(lineage.kaData), platform: mark(lineage.platform), comparability: { comparable: false, reason: "内网请求失败" } }
}
