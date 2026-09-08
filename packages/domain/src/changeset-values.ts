import { createHash } from "node:crypto";
import { z } from "zod";
import { changeValueSchema, transportSchema, canonicalChangeJson as canonicalJson } from "./change-value-schema.js";
export { changeValueSchema, sameChangeValue, type ChangeValue } from "./change-value-schema.js";

const identity = z.string().min(1).max(256);
const itemSchema = z.object({
  target_type: z.enum(["account", "campaign", "unit", "creative"]),
  target_id: identity, field: identity,
  from_value: changeValueSchema, to_value: changeValueSchema,
}).strict();
const draftSchema = transportSchema.pipe(z.object({
  items: z.array(itemSchema).min(1), ttlExpireAt: z.string().datetime({ offset: true }),
}).strict());

/** Internal P006 payload encoding. Persist it only with the subsequent
 * dry-run/confirm Repository integration, never as an authorization token. */
export function hashChangeSetDraft(input: unknown): string {
  const draft = draftSchema.parse(input);
  const key = (item: z.infer<typeof itemSchema>) => JSON.stringify([item.target_type, item.target_id, item.field]);
  const items = [...draft.items].sort((left, right) => key(left) < key(right) ? -1 : key(left) > key(right) ? 1 : 0);
  if (items.some((item, i) => i > 0 && key(item) === key(items[i - 1]!))) throw new Error("Duplicate changeset target field");
  // Hash the exact persisted TTL, not Date's millisecond projection: PostgreSQL
  // timestamps may contain microseconds which must not silently disappear.
  return createHash("sha256").update(canonicalJson(items) + draft.ttlExpireAt).digest("hex");
}
