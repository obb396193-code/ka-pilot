import { adminMembersDataSchema, adminMemberGrantsDataSchema, approvedWorkspaceAuthContextSchema, shanghaiTaskBusinessDate, type ApprovedWorkspaceAuthContext } from "@ka/domain";
import { AdminMembersError } from "@ka/db";
export class AdminMembersService {
  constructor(private readonly repository: { read(auth: ApprovedWorkspaceAuthContext, identityId?: string): Promise<unknown> }, private readonly now: () => Date = () => new Date()) {}
  async read(rawAuth: unknown, requestId: string, identityId?: string) {
    const parsed = approvedWorkspaceAuthContextSchema.safeParse(rawAuth);
    if (!parsed.success || parsed.data.role !== "admin") throw new AdminMembersError("FORBIDDEN");
    const auth = parsed.data;
    const raw = await this.repository.read(auth, identityId);
    if (!raw || typeof raw !== "object" || Array.isArray(raw) || !("workspaceId" in raw) || raw.workspaceId !== auth.workspaceId || !("data" in raw) || Object.keys(raw).some(k => !["workspaceId", "data"].includes(k))) throw new AdminMembersError("UPSTREAM_INVALID_RESPONSE");
    const data = identityId === undefined ? adminMembersDataSchema.safeParse(raw.data) : adminMemberGrantsDataSchema.safeParse(raw.data);
    if (!data.success || (identityId !== undefined && (!("identityId" in data.data) || data.data.identityId !== identityId.toLowerCase()))) throw new AdminMembersError("UPSTREAM_INVALID_RESPONSE");
    if (auth.workspaceKind === "team" && data.data.items.some(row => !("grantsCount" in row) || row.grantsCount !== 0)) throw new AdminMembersError("UPSTREAM_INVALID_RESPONSE");
    return { ok: true as const, data: data.data, meta: { requestId, dataAsOf: null,
      businessDate: shanghaiTaskBusinessDate(this.now()), workspaceKind: auth.workspaceKind, selectedSource: "platform" as const } };
  }
}
