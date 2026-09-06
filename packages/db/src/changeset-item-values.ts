import { changeValueSchema } from "@ka/domain";
import type { NewChangeSetItem } from "./changeset-repository.js";

/** Encode all items before awaiting a DB connection. The immutable strings,
 * rather than caller-owned JSON subtrees, are the exact values persisted. */
export function encodeChangeSetItems(items: readonly NewChangeSetItem[]) {
  if (items.length === 0) throw new Error("changeset requires at least one item");
  const targets = new Set<string>();
  return items.map((item) => {
    const key = JSON.stringify([item.targetType, item.targetId, item.field]);
    if (targets.has(key)) throw new Error("Duplicate changeset target field");
    targets.add(key);
    return {
      targetType: item.targetType, targetId: item.targetId, field: item.field,
      fromJson: JSON.stringify(changeValueSchema.parse(item.fromValue)),
      toJson: JSON.stringify(changeValueSchema.parse(item.toValue)),
    };
  });
}

/** A historical JSONB string is not a typed number/string: do not guess it. */
export function decodeChangeSetValues(fromValue: unknown, toValue: unknown) {
  const from = changeValueSchema.safeParse(fromValue), to = changeValueSchema.safeParse(toValue);
  if (!from.success || !to.success) throw new Error("Changeset contains invalid or legacy untyped values");
  return { fromValue: from.data, toValue: to.data };
}
