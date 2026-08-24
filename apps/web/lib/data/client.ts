import {
  parseQueryResponse,
  type QueryData,
  type QueryId,
  type QueryRequest,
} from "./contracts"
import type { DataResponse } from "./data-view"
import { getMockResponse } from "./mock-data"

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
  constructor(
    private readonly endpoint: string,
    private readonly token?: string,
  ) {}

  async query<T extends QueryId>(request: QueryRequest<T>) {
    const response = await fetch(this.endpoint, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...(this.token ? { authorization: `Bearer ${this.token}` } : {}),
      },
      body: JSON.stringify(request),
      cache: "no-store",
      signal: AbortSignal.timeout(10_000),
    })

    if (!response.ok) {
      throw new Error(`KA data query failed with HTTP ${response.status}`)
    }

    return parseQueryResponse(request.queryId, await response.json())
  }
}

export function createDataClient(): DataClient {
  const mode = process.env.KA_DATA_PROVIDER ?? "mock"
  if (mode === "mock") return new MockDataClient()

  if (mode !== "internal_api") {
    throw new Error(`Unsupported KA_DATA_PROVIDER: ${mode}`)
  }

  const endpoint = process.env.KA_DATA_API_URL
  if (!endpoint) {
    throw new Error("KA_DATA_API_URL is required for internal_api provider")
  }

  return new InternalApiDataClient(endpoint, process.env.KA_DATA_API_TOKEN)
}

export const dataClient = createDataClient()
