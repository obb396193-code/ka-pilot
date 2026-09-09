import { adminCalendarDataSchema, adminCalendarResponseSchema, approvedWorkspaceAuthContextSchema,
  shanghaiTaskBusinessDate, type ApprovedWorkspaceAuthContext } from "@ka/domain";
import { AdminCalendarError } from "@ka/db";
export class AdminCalendarService {
  constructor(private readonly repository: { list(auth: ApprovedWorkspaceAuthContext): Promise<unknown> }, private readonly now: () => Date = () => new Date()) {}
  async list(rawAuth: unknown, requestId: string) {
    const auth = approvedWorkspaceAuthContextSchema.safeParse(rawAuth);
    if (!auth.success || auth.data.role !== "admin") throw new AdminCalendarError("FORBIDDEN");
    const raw = await this.repository.list(auth.data);
    if (!raw || typeof raw !== "object" || Array.isArray(raw) || !("workspaceId" in raw) || raw.workspaceId !== auth.data.workspaceId ||
      !("items" in raw) || Object.keys(raw).some(key => !["items", "workspaceId"].includes(key))) throw new AdminCalendarError("UPSTREAM_INVALID_RESPONSE");
    const data = adminCalendarDataSchema.safeParse({ items: raw.items });
    if (!data.success) throw new AdminCalendarError("UPSTREAM_INVALID_RESPONSE");
    return adminCalendarResponseSchema.parse({ ok: true, data: data.data, meta: { requestId,
      dataAsOf: null, businessDate: shanghaiTaskBusinessDate(this.now()), workspaceKind: auth.data.workspaceKind, selectedSource: "platform" } });
  }
}
