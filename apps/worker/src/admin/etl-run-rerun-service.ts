import { approvedWorkspaceAuthContextSchema, etlRunIdSchema, etlRunRerunDataSchema, requestIdSchema,
  type ApprovedWorkspaceAuthContext } from "@ka/domain";
import { EtlRunRerunError } from "@ka/db";

export class EtlRunRerunService {
  constructor(private readonly repository: { rerun(auth: ApprovedWorkspaceAuthContext, runId: string): Promise<unknown> }) {}
  async rerun(rawAuth: unknown, rawId: unknown, requestId: string) {
    const auth = approvedWorkspaceAuthContextSchema.safeParse(rawAuth), id = etlRunIdSchema.safeParse(rawId);
    if (!auth.success || auth.data.role !== "admin") throw new EtlRunRerunError("FORBIDDEN");
    if (!id.success || !requestIdSchema.safeParse(requestId).success) throw new EtlRunRerunError("INVALID_REQUEST");
    const raw = await this.repository.rerun(auth.data, id.data);
    if (!raw || typeof raw !== "object" || Array.isArray(raw) || !("workspaceId" in raw) || raw.workspaceId !== auth.data.workspaceId ||
      !("data" in raw) || Object.keys(raw).some(key => !["workspaceId", "data"].includes(key))) throw new EtlRunRerunError("UPSTREAM_INVALID_RESPONSE");
    const parsed = etlRunRerunDataSchema.safeParse(raw.data);
    if (!parsed.success || parsed.data.sourceRunId !== id.data) throw new EtlRunRerunError("UPSTREAM_INVALID_RESPONSE");
    return { ok: true as const, data: parsed.data, meta: { requestId } };
  }
}
