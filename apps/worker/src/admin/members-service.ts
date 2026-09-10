import { adminMemberGrantsDataSchema, adminMembersV195DataSchema, adminMemberCreatedDataSchema, adminMemberResetPasswordDataSchema,
  adminMemberCreateRequestSchema, approvedWorkspaceAuthContextSchema, shanghaiTaskBusinessDate, type ApprovedWorkspaceAuthContext } from "@ka/domain";
import { AdminMembersError, AdminMemberProvisioningError } from "@ka/db";
interface ProvisioningPort {
  read(auth: ApprovedWorkspaceAuthContext): Promise<unknown>;
  create(auth: ApprovedWorkspaceAuthContext, input: unknown): Promise<unknown>;
  resetPassword(auth: ApprovedWorkspaceAuthContext, identityId: string): Promise<unknown>;
}
export class AdminMembersService {
  constructor(private readonly repository: { read(auth: ApprovedWorkspaceAuthContext, identityId?: string): Promise<unknown> },
    private readonly now: () => Date = () => new Date(), private readonly provisioning?: ProvisioningPort) {}
  private context(rawAuth: unknown) {
    const parsed = approvedWorkspaceAuthContextSchema.safeParse(rawAuth);
    if (!parsed.success || parsed.data.role === "viewer") throw new AdminMemberProvisioningError("FORBIDDEN");
    if (!this.provisioning) throw new AdminMemberProvisioningError("SOURCE_UNAVAILABLE");
    return { auth: parsed.data, port: this.provisioning };
  }
  private response<T>(data: T, auth: ApprovedWorkspaceAuthContext, requestId: string) {
    return { ok: true as const, data, meta: { requestId, dataAsOf: null,
      businessDate: shanghaiTaskBusinessDate(this.now()), workspaceKind: auth.workspaceKind, selectedSource: "platform" as const } };
  }
  async create(rawAuth: unknown, requestId: string, input: unknown) {
    const { auth, port } = this.context(rawAuth), parsed = adminMemberCreateRequestSchema.safeParse(input);
    if (!parsed.success) throw new AdminMemberProvisioningError("INVALID_REQUEST");
    const result = adminMemberCreatedDataSchema.safeParse(await port.create(auth, parsed.data));
    if (!result.success || result.data.provider !== parsed.data.provider || result.data.loginName !== parsed.data.provider_subject ||
        result.data.displayName !== parsed.data.display_name || result.data.role !== parsed.data.role) throw new AdminMemberProvisioningError("UPSTREAM_INVALID_RESPONSE");
    return this.response(result.data, auth, requestId);
  }
  async resetPassword(rawAuth: unknown, requestId: string, identityId: string) {
    const { auth, port } = this.context(rawAuth);
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(identityId)) throw new AdminMemberProvisioningError("INVALID_REQUEST");
    const target = identityId.toLowerCase(), result = adminMemberResetPasswordDataSchema.safeParse(await port.resetPassword(auth, target));
    if (!result.success || result.data.identityId !== target) throw new AdminMemberProvisioningError("UPSTREAM_INVALID_RESPONSE");
    return this.response(result.data, auth, requestId);
  }
  async read(rawAuth: unknown, requestId: string, identityId?: string) {
    if (identityId === undefined) {
      const { auth, port } = this.context(rawAuth), result = adminMembersV195DataSchema.safeParse(await port.read(auth));
      if (!result.success) throw new AdminMemberProvisioningError("UPSTREAM_INVALID_RESPONSE");
      return this.response(result.data, auth, requestId);
    }
    const parsed = approvedWorkspaceAuthContextSchema.safeParse(rawAuth);
    if (!parsed.success || parsed.data.role !== "admin") throw new AdminMembersError("FORBIDDEN");
    const auth = parsed.data;
    const raw = await this.repository.read(auth, identityId);
    if (!raw || typeof raw !== "object" || Array.isArray(raw) || !("workspaceId" in raw) || raw.workspaceId !== auth.workspaceId || !("data" in raw) || Object.keys(raw).some(k => !["workspaceId", "data"].includes(k))) throw new AdminMembersError("UPSTREAM_INVALID_RESPONSE");
    const data = adminMemberGrantsDataSchema.safeParse(raw.data);
    if (!data.success || (identityId !== undefined && (!("identityId" in data.data) || data.data.identityId !== identityId.toLowerCase()))) throw new AdminMembersError("UPSTREAM_INVALID_RESPONSE");
    if (auth.workspaceKind === "team" && data.data.items.some(row => !("grantsCount" in row) || row.grantsCount !== 0)) throw new AdminMembersError("UPSTREAM_INVALID_RESPONSE");
    return { ok: true as const, data: data.data, meta: { requestId, dataAsOf: null,
      businessDate: shanghaiTaskBusinessDate(this.now()), workspaceKind: auth.workspaceKind, selectedSource: "platform" as const } };
  }
}
