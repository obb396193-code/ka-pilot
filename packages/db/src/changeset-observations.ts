import { preflightObservationSnapshotSchema, sameChangeValue, type ChangeSetItemSnapshot, type ItemExecutionResult } from "@ka/domain";
/** Recheck presentation evidence against the locked draft, never caller metadata. */
export function validateDryRunObservations(raw: unknown, draft: ChangeSetItemSnapshot[], results: ItemExecutionResult[], now: Date) {
  if (raw === undefined) return undefined; // Legacy internal status-only path, never public preview.
  const bytes = JSON.stringify(raw);
  if (bytes === undefined || Buffer.byteLength(bytes) >= 16 * 1024 * 1024) throw new Error("Invalid dry-run observations");
  const parsed = preflightObservationSnapshotSchema.safeParse(raw);
  if (!parsed.success) throw new Error("Invalid dry-run observations");
  const data = parsed.data;
  if (Date.parse(data.checkedAt) !== now.getTime() || (data.dataAsOf !== null && Date.parse(data.dataAsOf) > now.getTime()) || data.items.length !== draft.length)
    throw new Error("Invalid dry-run observations");
  const drafts = new Map(draft.map(item => [String(item.id), item]));
  const statuses = new Map(results.map(item => [String(item.itemId), item]));
  const seen = new Set<string>();
  for (const row of data.items) {
    const item = drafts.get(row.itemId), result = statuses.get(row.itemId);
    const status = row.verdict === "ok" ? "success" : row.verdict === "unknown" ? "unknown" : "failed";
    if (!item || !result || seen.has(row.itemId) || row.targetType !== item.targetType || row.targetId !== item.targetId || row.field !== item.field ||
      !sameChangeValue(row.fromValue, item.fromValue) || !sameChangeValue(row.toValue, item.toValue) || result.status !== status ||
      (row.verdict === "changed" && result.failReason !== "FROM_VALUE_CHANGED") ||
      (row.verdict === "blocked" && result.failReason === "FROM_VALUE_CHANGED")) throw new Error("Invalid dry-run observations");
    seen.add(row.itemId);
  }
  return data;
}
