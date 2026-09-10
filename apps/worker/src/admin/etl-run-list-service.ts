import { approvedWorkspaceAuthContextSchema, etlRunListRequestSchema, etlRunListResponseSchema, requestIdSchema,
  shanghaiTaskBusinessDate, ETL_RUN_OBSERVATION_NOTE, type ApprovedWorkspaceAuthContext, type EtlRunListRequest } from "@ka/domain";
import { EtlRunListError } from "@ka/db";

export class EtlRunListService {
  constructor(private readonly repository: { list(auth: ApprovedWorkspaceAuthContext, request: EtlRunListRequest): Promise<unknown> },
    private readonly now: () => Date = () => new Date()) {}

  async list(rawAuth: unknown, rawRequest: unknown, requestId: string) {
    const auth = approvedWorkspaceAuthContextSchema.safeParse(rawAuth);
    if (!auth.success || auth.data.role !== "admin") throw new EtlRunListError("FORBIDDEN");
    const request = etlRunListRequestSchema.safeParse(rawRequest);
    if (!request.success || !requestIdSchema.safeParse(requestId).success) throw new EtlRunListError("INVALID_REQUEST");
    const raw = await this.repository.list(auth.data, request.data);
    if (!raw || typeof raw !== "object" || Array.isArray(raw) || !("workspaceId" in raw) || raw.workspaceId !== auth.data.workspaceId ||
      !("data" in raw) || !("dataAsOf" in raw) || Object.keys(raw).some(key => !["workspaceId", "data", "dataAsOf"].includes(key)))
      throw new EtlRunListError("UPSTREAM_INVALID_RESPONSE");
    const parsed = etlRunListResponseSchema.safeParse({ ok: true, data: raw.data, meta: { requestId, dataAsOf: raw.dataAsOf,
      businessDate: shanghaiTaskBusinessDate(this.now()), workspaceKind: auth.data.workspaceKind, selectedSource: "platform", _note: ETL_RUN_OBSERVATION_NOTE } });
    if (!parsed.success || !parsed.data.ok || parsed.data.data.page !== request.data.page || parsed.data.data.pageSize !== request.data.pageSize)
      throw new EtlRunListError("UPSTREAM_INVALID_RESPONSE");
    return parsed.data;
  }
}
