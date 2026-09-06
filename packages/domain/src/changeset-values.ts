import { createHash } from "node:crypto";
import { z } from "zod";

type Json = null | boolean | number | string | Json[] | { [key: string]: Json };
const MAX_BYTES = 16 * 1024 * 1024;

/** Validate a transport JSON tree without invoking accessors or toJSON. Resource
 * bounds are local defensive limits, not claimed upstream media API limits. */
function boundedJson(input: unknown): input is Json {
  let nodes = 0, bytes = 0;
  const path = new Set<object>();
  const add = (text: string) => { bytes += Buffer.byteLength(text); return bytes < MAX_BYTES; };
  function visit(value: unknown, depth: number): boolean {
    if (++nodes > 10000 || depth > 64) return false;
    if (value === null || typeof value === "boolean" || (typeof value === "number" && Number.isFinite(value))) return add(JSON.stringify(value));
    if (typeof value === "string") return value.length < MAX_BYTES && add(JSON.stringify(value));
    if (typeof value !== "object" || value === null || path.has(value)) return false;
    const array = Array.isArray(value);
    if (!array && Object.getPrototypeOf(value) !== Object.prototype && Object.getPrototypeOf(value) !== null) return false;
    const keys = Reflect.ownKeys(value);
    if (keys.some((key) => typeof key !== "string") || keys.length > 10001) return false;
    path.add(value);
    try {
      if (!add("{}")) return false;
      if (array) {
        if (value.length > 10000 || keys.length !== value.length + 1) return false;
        for (let i = 0; i < value.length; i++) {
          const descriptor = Object.getOwnPropertyDescriptor(value, String(i));
          if (!descriptor || !descriptor.enumerable || !("value" in descriptor) || !add(",") || !visit(descriptor.value, depth + 1)) return false;
        }
      } else {
        for (const key of keys as string[]) {
          const descriptor = Object.getOwnPropertyDescriptor(value, key)!;
          if (!descriptor.enumerable || !("value" in descriptor) || !add(JSON.stringify(key) + ":,") || !visit(descriptor.value, depth + 1)) return false;
        }
      }
      return true;
    } finally { path.delete(value); }
  }
  try { return visit(input, 0); } catch { return false; }
}

const jsonSchema = z.custom<Json>(boundedJson, "Invalid or oversized JSON value");
const transportSchema = z.unknown().refine(boundedJson, "Invalid or oversized JSON value");
const common = { media_default: z.literal(true).optional() };
const typedSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("number"), value: z.number().finite(), ...common }).strict(),
  z.object({ type: z.literal("boolean"), value: z.boolean(), ...common }).strict(),
  z.object({ type: z.literal("string"), value: z.string(), ...common }).strict(),
  z.object({ type: z.literal("json"), value: jsonSchema, ...common }).strict(),
  z.object({ type: z.literal("schedule168"), value: z.string().regex(/^[01]{168}$/), ...common }).strict(),
]);
export const changeValueSchema = transportSchema.pipe(typedSchema);
export type ChangeValue = z.infer<typeof changeValueSchema>;

// Private: callers have already validated the whole transport tree. Keeping the
// input unknown accommodates optional Zod properties without weakening validation.
function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  const object = value as Record<string, unknown>;
  return `{${Object.keys(object).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(object[key])}`).join(",")}}`;
}

export function sameChangeValue(left: unknown, right: unknown): boolean {
  return canonicalJson(changeValueSchema.parse(left)) === canonicalJson(changeValueSchema.parse(right));
}

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
