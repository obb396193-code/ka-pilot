import { aggregateExecutionResult, approvedWorkspaceAuthContextSchema, preflightPresentationDataSchema, type ApprovedWorkspaceAuthContext,
  type ChangeSetItemSnapshot } from "@ka/domain";
import { ChangeSetAuthorizationError, ChangeSetPreconditionError, type ChangeSetRecord, type ChangeSetRepository } from "@ka/db";
import { z } from "zod";
import { DryRunServiceError, preflightDraftItemsSchema, preflightProofSchema, preflightObservedProofSchema } from "./dry-run-contract.js";
import { observedPreflightSnapshot } from "./observed-preflight.js";

type PersonalAuth = Extract<ApprovedWorkspaceAuthContext, { workspaceKind: "personal" }>;
export interface ChangeSetPreflightInput {
  workspaceId: string; media: string; accountId: string; credentialOwnerUserId: string;
  draftHash: string; items: ChangeSetItemSnapshot[]; signal: AbortSignal;
  requireObservedValues?: true;
}
export interface ChangeSetPreflightPort {
  /** Trusted, read-only checks of live target/field/permission/value. No execute,
   * confirm, job enqueue or browser-supplied item results allowed. */
  check(input: ChangeSetPreflightInput): Promise<unknown>;
}
export interface DryRunServiceDependencies {
  // This HTTP-facing port deliberately does not expose the repository's legacy
  // auth-less overloads. Forgetting Session context must also fail typecheck.
  store: Pick<ChangeSetRepository, "recordDryRun"> & {
    find(workspaceId: string, changeSetId: string, auth: ApprovedWorkspaceAuthContext): ReturnType<ChangeSetRepository["find"]>;
    prepareDryRun(input: Parameters<ChangeSetRepository["prepareDryRun"]>[0], auth: ApprovedWorkspaceAuthContext): ReturnType<ChangeSetRepository["prepareDryRun"]>;
  };
  preflight?: ChangeSetPreflightPort;
  now?: () => Date;
  timeoutMs?: number;
}
const uuid = z.string().uuid();
const recordResult = z.object({ executionRunId: uuid, hash: z.string().regex(/^[a-f0-9]{64}$/),
  status: z.enum(["success", "partial", "failed", "unknown"]) }).strict();
const limit = 16 * 1024 * 1024;

function bounded(input: unknown): void {
  try {
    const encoded = JSON.stringify(input);
    if (encoded === undefined || Buffer.byteLength(encoded) >= limit) throw new Error();
  } catch { throw new DryRunServiceError("UPSTREAM_INVALID_RESPONSE"); }
}
function clock(now: () => Date): Date {
  const value = now();
  if (!(value instanceof Date) || !Number.isFinite(value.getTime())) throw new DryRunServiceError("INTERNAL_ERROR");
  return new Date(value.getTime());
}
function authorize(record: ChangeSetRecord, id: string, auth: PersonalAuth, at: Date): void {
  if (record.id !== id || record.workspaceId !== auth.workspaceId || record.initiator !== auth.userId ||
    record.credentialOwnerUserId !== auth.userId || !auth.scope.accounts.some(grant =>
      grant.media === record.media && grant.accountId === record.accountId && grant.accessLevel !== "read")) {
    throw new DryRunServiceError("FORBIDDEN");
  }
  if (record.status !== "draft" || !(record.ttlExpireAt instanceof Date) ||
    !Number.isFinite(record.ttlExpireAt.getTime()) || record.ttlExpireAt <= at) throw new DryRunServiceError("INVALID_STATE");
  bounded(record.items);
  if (!preflightDraftItemsSchema.safeParse(record.items).success) throw new DryRunServiceError("UPSTREAM_INVALID_RESPONSE");
}

export class ChangeSetDryRunService {
  private readonly timeoutMs: number;
  private readonly now: () => Date;
  constructor(private readonly dependencies: DryRunServiceDependencies) {
    this.timeoutMs = dependencies.timeoutMs ?? 10_000;
    if (!Number.isSafeInteger(this.timeoutMs) || this.timeoutMs < 1 || this.timeoutMs > 60_000) throw new Error("Invalid preflight timeout");
    this.now = dependencies.now ?? (() => new Date());
  }

  async run(changeSetId: string, approved: unknown) {
    return (await this.perform(changeSetId, approved, false)).result;
  }

  async preview(changeSetId: string, approved: unknown) {
    const result = await this.perform(changeSetId, approved, true);
    if (!result.presentation) throw new DryRunServiceError("UPSTREAM_INVALID_RESPONSE");
    return result.presentation;
  }

  private async perform(changeSetId: string, approved: unknown, requireObservedValues: boolean) {
    if (!uuid.safeParse(changeSetId).success) throw new DryRunServiceError("INVALID_REQUEST");
    const parsed = approvedWorkspaceAuthContextSchema.safeParse(approved);
    if (!parsed.success || parsed.data.workspaceKind !== "personal" || parsed.data.scope.accounts.length === 0) {
      throw new DryRunServiceError("FORBIDDEN");
    }
    const auth = parsed.data; // Zod clone stays private, never passed to provider.
    try {
      const found = await this.dependencies.store.find(auth.workspaceId, changeSetId, auth);
      if (found === null) throw new DryRunServiceError("NOT_FOUND");
      authorize(found, changeSetId, auth, clock(this.now));
      if (!this.dependencies.preflight) throw new DryRunServiceError("SOURCE_UNAVAILABLE");
      const prepared = await this.dependencies.store.prepareDryRun({ workspaceId: auth.workspaceId, changeSetId, now: clock(this.now) }, auth);
      const draft = structuredClone(prepared.changeset);
      authorize(draft, changeSetId, auth, clock(this.now));
      if (!/^[a-f0-9]{64}$/.test(prepared.hash)) throw new DryRunServiceError("UPSTREAM_INVALID_RESPONSE");
      const hash = prepared.hash;
      const binding = { workspaceId: auth.workspaceId, media: draft.media!, accountId: draft.accountId!,
        credentialOwnerUserId: auth.userId, draftHash: hash };
      const proof = await this.check({ ...binding, items: structuredClone(draft.items), ...(requireObservedValues ? { requireObservedValues: true as const } : {}) });
      bounded(proof);
      const validated = requireObservedValues ? preflightObservedProofSchema.safeParse(proof) : preflightProofSchema.safeParse(proof);
      if (!validated.success) throw new DryRunServiceError("UPSTREAM_INVALID_RESPONSE");
      const evidence = validated.data;
      const ids = new Set(evidence.items.map(item => item.itemId));
      if (Object.entries(binding).some(([key, value]) => evidence[key as keyof typeof binding] !== value) ||
        evidence.items.length !== draft.items.length || ids.size !== draft.items.length || draft.items.some(item => !ids.has(item.id))) {
        throw new DryRunServiceError("UPSTREAM_INVALID_RESPONSE");
      }
      const finished = clock(this.now);
      authorize(draft, changeSetId, auth, finished);
      const observations = requireObservedValues ? observedPreflightSnapshot(draft.items, preflightObservedProofSchema.parse(proof), finished) : undefined;
      if (observations) bounded(observations);
      const items = evidence.items.map(item => ({ itemId: item.itemId, status: item.status,
        ...(item.failReason === null ? {} : { failReason: item.failReason }) }));
      const result = recordResult.safeParse(await this.dependencies.store.recordDryRun({ workspaceId: auth.workspaceId,
        changeSetId, expectedHash: hash, now: finished, items,
        ...(observations === undefined ? {} : { observations }),
        expectedScope: { media: binding.media, accountId: binding.accountId, initiatorUserId: auth.userId, credentialOwnerUserId: auth.userId } }));
      if (!result.success || result.data.hash !== hash || result.data.status !== aggregateExecutionResult(items)) {
        throw new DryRunServiceError("UPSTREAM_INVALID_RESPONSE");
      }
      if (!observations) return { result: result.data };
      const summary = { total: observations.items.length, ok: 0, changed: 0, unknown: 0, blocked: 0 };
      for (const item of observations.items) summary[item.verdict]++;
      const canExecute = auth.scope.accounts.some(grant => grant.media === binding.media && grant.accountId === binding.accountId && grant.accessLevel === "execute");
      const confirmAllowed = summary.ok === summary.total && canExecute;
      const presentation = preflightPresentationDataSchema.safeParse({ changesetId: changeSetId, executionRunId: result.data.executionRunId,
        status: "ready", hash, checkedAt: finished.toISOString(), ttlExpireAt: draft.ttlExpireAt!.toISOString(),
        items: observations.items, summary, confirmAllowed,
        confirmBlockedReason: confirmAllowed ? null : summary.ok !== summary.total
          ? `有 ${summary.changed} 项与媒体现值不一致、${summary.unknown} 项读不回来、${summary.blocked} 项受限，需逐项复核`
          : "当前账户仅允许预检，未获授执行权限" });
      if (!presentation.success) throw new DryRunServiceError("UPSTREAM_INVALID_RESPONSE");
      return { result: result.data, presentation: { data: presentation.data, dataAsOf: observations.dataAsOf } };
    } catch (error) {
      if (error instanceof DryRunServiceError) throw error;
      if (error instanceof ChangeSetAuthorizationError) throw new DryRunServiceError("FORBIDDEN");
      if (error instanceof ChangeSetPreconditionError) throw new DryRunServiceError(error.code === "FROM_VALUE_CHANGED" ? "FROM_VALUE_CHANGED" : "INVALID_STATE");
      throw new DryRunServiceError("INTERNAL_ERROR");
    }
  }

  private async check(input: Omit<ChangeSetPreflightInput, "signal">): Promise<unknown> {
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      return await Promise.race([
        Promise.resolve().then(() => this.dependencies.preflight!.check({ ...input, signal: controller.signal })),
        new Promise<never>((_, reject) => { timer = setTimeout(() => {
          controller.abort(); reject(new DryRunServiceError("UPSTREAM_TIMEOUT"));
        }, this.timeoutMs); }),
      ]);
    } catch {
      if (controller.signal.aborted) throw new DryRunServiceError("UPSTREAM_TIMEOUT");
      // Never expose even a provider-thrown lookalike typed error/message.
      throw new DryRunServiceError("SOURCE_UNAVAILABLE");
    } finally { if (timer !== undefined) clearTimeout(timer); }
  }
}
