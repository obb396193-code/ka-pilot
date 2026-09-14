import { adminMemberGrantsDataSchema, adminMembersV195DataSchema, adminMemberCreatedDataSchema, adminMemberResetPasswordDataSchema,
  adminMemberCreateRequestSchema, adminMemberPatchRequestSchema, adminMemberReplaceGrantsRequestSchema, adminMemberV195Schema,
  approvedWorkspaceAuthContextSchema, shanghaiTaskBusinessDate,
  type AdminMemberPatchRequest, type AdminMemberReplaceGrantsRequest, type ApprovedWorkspaceAuthContext } from "@ka/domain";
import { AdminMemberProvisioningError } from "@ka/db";
import type { z } from "zod";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const fail = (code: AdminMemberProvisioningError["code"]): never => { throw new AdminMemberProvisioningError(code); };
interface ProvisioningPort {
  read(auth: ApprovedWorkspaceAuthContext): Promise<unknown>;
  create(auth: ApprovedWorkspaceAuthContext, input: unknown): Promise<unknown>;
  resetPassword(auth: ApprovedWorkspaceAuthContext, identityId: string): Promise<unknown>;
}
/**
 * v1.9.46 ①：按 identity 定位的治理命令。live team-admin 校验、目标个人空间解析、审计都在仓储的同一事务里；
 * 这里只收口形状，并核对「改到的是那个人、值就是请求的值」。
 */
interface ManagementPort {
  grants(auth: ApprovedWorkspaceAuthContext, identityId: string): Promise<unknown>;
  patch(auth: ApprovedWorkspaceAuthContext, identityId: string, input: AdminMemberPatchRequest): Promise<unknown>;
  replaceGrants(auth: ApprovedWorkspaceAuthContext, identityId: string, input: AdminMemberReplaceGrantsRequest): Promise<unknown>;
}
export class AdminMembersService {
  constructor(private readonly now: () => Date = () => new Date(), private readonly provisioning?: ProvisioningPort,
    private readonly management?: ManagementPort) {}
  private approve(rawAuth: unknown): ApprovedWorkspaceAuthContext {
    const parsed = approvedWorkspaceAuthContextSchema.safeParse(rawAuth);
    // 本地会话角色不授予治理权——来源是任一有效 team 空间的 admin，由仓储实时校验；这里只挡只读角色。
    if (!parsed.success || parsed.data.role === "viewer") return fail("FORBIDDEN");
    return parsed.data;
  }
  private context(rawAuth: unknown) {
    const auth = this.approve(rawAuth);
    if (!this.provisioning) return fail("SOURCE_UNAVAILABLE");
    return { auth, port: this.provisioning };
  }
  private governance(rawAuth: unknown, identityId: string) {
    const auth = this.approve(rawAuth);
    if (!UUID.test(identityId)) return fail("INVALID_REQUEST");
    if (!this.management) return fail("SOURCE_UNAVAILABLE");
    return { auth, port: this.management, target: identityId.toLowerCase() };
  }
  private response<T>(data: T, auth: ApprovedWorkspaceAuthContext, requestId: string) {
    return { ok: true as const, data, meta: { requestId, dataAsOf: null,
      businessDate: shanghaiTaskBusinessDate(this.now()), workspaceKind: auth.workspaceKind, selectedSource: "platform" as const } };
  }
  /** 仓储回 `{workspaceId, data}`；这个 workspaceId 是**目标身份的个人空间**，不是调用方当前空间，所以只验形状。 */
  private targeted<T extends z.ZodType>(raw: unknown, schema: T): z.infer<T> {
    if (!raw || typeof raw !== "object" || Array.isArray(raw) || Object.keys(raw).some(key => key !== "workspaceId" && key !== "data")) {
      return fail("UPSTREAM_INVALID_RESPONSE");
    }
    const { workspaceId, data } = raw as { workspaceId?: unknown; data?: unknown };
    if (typeof workspaceId !== "string" || !UUID.test(workspaceId)) return fail("UPSTREAM_INVALID_RESPONSE");
    const parsed = schema.safeParse(data);
    if (!parsed.success) return fail("UPSTREAM_INVALID_RESPONSE");
    return parsed.data;
  }
  async create(rawAuth: unknown, requestId: string, input: unknown) {
    const { auth, port } = this.context(rawAuth), parsed = adminMemberCreateRequestSchema.safeParse(input);
    if (!parsed.success) return fail("INVALID_REQUEST");
    const result = adminMemberCreatedDataSchema.safeParse(await port.create(auth, parsed.data));
    if (!result.success || result.data.provider !== parsed.data.provider || result.data.loginName !== parsed.data.provider_subject ||
        result.data.displayName !== parsed.data.display_name || result.data.role !== parsed.data.role) return fail("UPSTREAM_INVALID_RESPONSE");
    return this.response(result.data, auth, requestId);
  }
  async resetPassword(rawAuth: unknown, requestId: string, identityId: string) {
    const { auth, port } = this.context(rawAuth);
    if (!UUID.test(identityId)) return fail("INVALID_REQUEST");
    const target = identityId.toLowerCase(), result = adminMemberResetPasswordDataSchema.safeParse(await port.resetPassword(auth, target));
    if (!result.success || result.data.identityId !== target) return fail("UPSTREAM_INVALID_RESPONSE");
    return this.response(result.data, auth, requestId);
  }
  /** v1.9.21 全局成员列表。 */
  async read(rawAuth: unknown, requestId: string) {
    const { auth, port } = this.context(rawAuth), result = adminMembersV195DataSchema.safeParse(await port.read(auth));
    if (!result.success) return fail("UPSTREAM_INVALID_RESPONSE");
    return this.response(result.data, auth, requestId);
  }
  /** v1.9.46 ①：读目标身份个人空间的账户授权（调用方在哪个空间都一样）。 */
  async grants(rawAuth: unknown, requestId: string, identityId: string) {
    const { auth, port, target } = this.governance(rawAuth, identityId);
    const data = this.targeted(await port.grants(auth, target), adminMemberGrantsDataSchema);
    if (data.identityId !== target) return fail("UPSTREAM_INVALID_RESPONSE");
    return this.response(data, auth, requestId);
  }
  /** v1.9.46 ①：改角色 / 停用。停用是身份级，仓储同事务撤该身份全部会话。 */
  async patch(rawAuth: unknown, requestId: string, identityId: string, input: unknown) {
    const { auth, port, target } = this.governance(rawAuth, identityId), parsed = adminMemberPatchRequestSchema.safeParse(input);
    if (!parsed.success) return fail("INVALID_REQUEST");
    const data = this.targeted(await port.patch(auth, target, parsed.data), adminMemberV195Schema);
    // 回来的必须是被改的那个人，且改到的值就是请求的值。启用后 isActive 仍可能因成员/空间停用而为 false，只核停用。
    if (data.identityId !== target || (parsed.data.role !== undefined && data.role !== parsed.data.role) ||
        (parsed.data.is_active === false && data.isActive !== false)) return fail("UPSTREAM_INVALID_RESPONSE");
    return this.response(data, auth, requestId);
  }
  /** v1.9.46 ①：整体替换授权。读回来的清单必须与请求的清单一模一样，多一条少一条都不认。 */
  async replaceGrants(rawAuth: unknown, requestId: string, identityId: string, input: unknown) {
    const { auth, port, target } = this.governance(rawAuth, identityId), parsed = adminMemberReplaceGrantsRequestSchema.safeParse(input);
    if (!parsed.success) return fail("INVALID_REQUEST");
    const data = this.targeted(await port.replaceGrants(auth, target, parsed.data), adminMemberGrantsDataSchema);
    const key = (row: { media: string; accountId: string; accessLevel: string }) => JSON.stringify([row.media, row.accountId, row.accessLevel]);
    const wanted = new Set(parsed.data.items.map(key));
    if (data.identityId !== target || data.items.length !== wanted.size || data.items.some(row => !wanted.has(key(row)))) {
      return fail("UPSTREAM_INVALID_RESPONSE");
    }
    return this.response(data, auth, requestId);
  }
}
