import { AccountMuteRepositoryError, type AccountMuteRepository, type AccountMuteRecord } from "@ka/db";
import { accountMuteDaysSchema, accountMuteDeadline, accountMuteRequestSchema, accountMuteResultSchema,
  approvedAccountAccessSchema, approvedWorkspaceAuthContextSchema, type ApprovedWorkspaceAuthContext } from "@ka/domain";
import { z } from "zod";

type Personal = Extract<ApprovedWorkspaceAuthContext, { workspaceKind: "personal" }>;
type Target = { media: string; accountId: string };
const targetSchema = approvedAccountAccessSchema.pick({ media: true, accountId: true });
const ignoreMuteSchema = z.object({ mute_days: accountMuteDaysSchema, reason_chip: z.string().max(4096).optional() }).strict();
export class AccountMuteServiceError extends Error {
  constructor(readonly code: "FORBIDDEN" | "INVALID_REQUEST" | "NOT_FOUND" | "INVALID_STATE" | "UPSTREAM_INVALID_RESPONSE" | "INTERNAL_ERROR") {
    super(`Account mute ${code}`); this.name = "AccountMuteServiceError";
  }
}
function authorize(raw: unknown): Personal {
  const parsed = approvedWorkspaceAuthContextSchema.safeParse(raw);
  if (!parsed.success || parsed.data.workspaceKind !== "personal" || parsed.data.scope.accounts.length === 0) throw new AccountMuteServiceError("FORBIDDEN");
  return parsed.data;
}
function allows(auth: Personal, target: Target): boolean {
  return auth.scope.accounts.some(a => a.media === target.media && a.accountId === target.accountId);
}
function failure(error: unknown): never {
  if (error instanceof AccountMuteServiceError) throw error;
  if (error instanceof AccountMuteRepositoryError) {
    const code = error.code === "INVALID_INPUT" ? "INVALID_REQUEST" : error.code === "INVALID_RESULT" ? "UPSTREAM_INVALID_RESPONSE" : error.code;
    throw new AccountMuteServiceError(code);
  }
  throw new AccountMuteServiceError("INTERNAL_ERROR");
}
function validateResult(row: AccountMuteRecord, auth: Personal, expectedDate: string, reason: string | null, target?: Target): void {
  if (!row || row.workspaceId !== auth.workspaceId || row.mutedBy !== auth.userId || row.mutedUntil !== expectedDate || row.reasonChip !== reason ||
    !targetSchema.safeParse({ media: row.media, accountId: row.accountId }).success || !allows(auth, row) ||
    (target !== undefined && (row.media !== target.media || row.accountId !== target.accountId)) ||
    (row.createdAt !== null && (!(row.createdAt instanceof Date) || !Number.isFinite(row.createdAt.valueOf())))) {
    throw new AccountMuteServiceError("UPSTREAM_INVALID_RESPONSE");
  }
}

/** Server-only commands. No deadline Promise.race around a database mutation: the
 * repository owns short transaction timeouts and atomic rollback. No media/Job calls.
 */
export class AccountMuteService {
  constructor(private readonly store: Pick<AccountMuteRepository, "set" | "ignoreAndMute">, private readonly now: () => Date = () => new Date()) {}

  async mute(rawAuth: unknown, rawTarget: unknown, rawRequest: unknown) {
    const auth = authorize(rawAuth), target = targetSchema.safeParse(rawTarget), request = accountMuteRequestSchema.safeParse(rawRequest);
    if (!target.success || !request.success) throw new AccountMuteServiceError("INVALID_REQUEST");
    if (!allows(auth, target.data)) throw new AccountMuteServiceError("FORBIDDEN");
    try {
      const deadline = accountMuteDeadline(request.data.days, this.now());
      const row = await this.store.set(structuredClone(auth), { ...target.data, mutedUntil: deadline.storedDate, reasonChip: request.data.reason_chip });
      validateResult(row, auth, deadline.storedDate, request.data.reason_chip, target.data);
      return accountMuteResultSchema.parse({ mutedUntil: deadline.mutedUntil, scope: deadline.scope });
    } catch (error) { return failure(error); }
  }

  async ignoreAndMute(rawAuth: unknown, rawId: unknown, rawRequest: unknown) {
    const auth = authorize(rawAuth), id = z.string().uuid().safeParse(rawId), request = ignoreMuteSchema.safeParse(rawRequest);
    if (!id.success || !request.success) throw new AccountMuteServiceError("INVALID_REQUEST");
    try {
      const deadline = accountMuteDeadline(request.data.mute_days, this.now()), reason = request.data.reason_chip ?? null;
      const row = await this.store.ignoreAndMute(structuredClone(auth), { workItemId: id.data, mutedUntil: deadline.storedDate, reasonChip: reason });
      validateResult(row, auth, deadline.storedDate, reason);
      return accountMuteResultSchema.parse({ mutedUntil: deadline.mutedUntil, scope: deadline.scope });
    } catch (error) { return failure(error); }
  }
}
