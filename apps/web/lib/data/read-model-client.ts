import { changeSetDetailResponseSchema, workItemDetailResponseSchema, type ChangeSetDetailResponse, type WorkItemDetailResponse } from "./contracts.ts"
import type { ReadModelKind } from "./read-model-bff.ts"

type FetchLike = (input: string, init?: RequestInit) => Promise<Response>
export type ReadModelResponse = WorkItemDetailResponse | ChangeSetDetailResponse

export async function readInternalModel(kind: ReadModelKind, id: string, fetchImpl: FetchLike = fetch): Promise<ReadModelResponse> {
  if (!/^[A-Za-z0-9_-]{1,128}$/.test(id)) throw new Error("Invalid read-model id")
  const response = await fetchImpl(`/api/internal/${kind}/${id}`, { method: "GET", cache: "no-store", signal: AbortSignal.timeout(12_000) })
  const payload = await response.json() as unknown
  return (kind === "work-items" ? workItemDetailResponseSchema : changeSetDetailResponseSchema).parse(payload)
}
