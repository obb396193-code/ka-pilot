import { approvedWorkspaceAuthContextSchema, settingsChangeLogDataSchema, settingsChangeLogRequestSchema,
  settingsChangeLogResponseSchema, shanghaiTaskBusinessDate, type ApprovedWorkspaceAuthContext } from "@ka/domain";
import { SettingsChangeLogError } from "@ka/db";

interface ChangeLogReadPort {
  page(auth: ApprovedWorkspaceAuthContext, input: unknown, businessDate: string): Promise<unknown>;
}
/** Internal service only until arch approves the production registration hunk. */
export class SettingsChangeLogService {
  constructor(private readonly repository: ChangeLogReadPort, private readonly now: () => Date = () => new Date()) {}
  async read(rawAuth: unknown, rawInput: unknown, requestId: string) {
    const approved = approvedWorkspaceAuthContextSchema.safeParse(rawAuth), input = settingsChangeLogRequestSchema.safeParse(rawInput);
    if (!approved.success) throw new SettingsChangeLogError("FORBIDDEN");
    if (!input.success) throw new SettingsChangeLogError("INVALID_REQUEST");
    try {
      const auth = approved.data;
      const raw = await this.repository.page(structuredClone(auth), structuredClone(input.data), shanghaiTaskBusinessDate(this.now()));
      if (!raw || typeof raw !== "object" || Array.isArray(raw) || !('workspaceId' in raw) || raw.workspaceId !== auth.workspaceId ||
        !('data' in raw) || Object.keys(raw).some(key => !["workspaceId", "data"].includes(key))) throw new SettingsChangeLogError("UPSTREAM_INVALID_RESPONSE");
      const parsed = settingsChangeLogDataSchema.safeParse(raw.data);
      if (!parsed.success || parsed.data.items.some(row =>
        (input.data.kinds !== undefined && !input.data.kinds.includes(row.kind)) ||
        (input.data.task_id !== undefined && (!("taskId" in row.scope) || row.scope.taskId !== input.data.task_id)) ||
        (input.data.media !== undefined && "media" in row.scope && row.scope.media !== input.data.media))) {
        throw new SettingsChangeLogError("UPSTREAM_INVALID_RESPONSE");
      }
      const result = settingsChangeLogResponseSchema.safeParse({ ok: true, data: parsed.data, meta: { requestId } });
      if (!result.success) throw new SettingsChangeLogError("UPSTREAM_INVALID_RESPONSE");
      return result.data;
    } catch (error) {
      if (error instanceof SettingsChangeLogError) throw error;
      throw new SettingsChangeLogError("SOURCE_UNAVAILABLE");
    }
  }
}
