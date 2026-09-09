import { z } from "zod";

type Json = null | boolean | number | string | Json[] | { [key: string]: Json };
const utf8 = new TextEncoder();
const MAX_BYTES = 16 * 1024 * 1024;

/** Validate a transport JSON tree without invoking accessors or toJSON. Resource
 * bounds are local defensive limits, not claimed upstream media API limits. */
function boundedJson(input: unknown): input is Json {
  let nodes = 0, bytes = 0;
  const path = new Set<object>();
  const add = (text: string) => { bytes += utf8.encode(text).byteLength; return bytes < MAX_BYTES; };
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
export const transportSchema = z.unknown().refine(boundedJson, "Invalid or oversized JSON value");
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

// Callers validate the complete transport tree first. Keep serialization and
// typed equality shared by draft hashing, Worker proofs and the BFF validator.
export function canonicalChangeJson(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalChangeJson).join(",")}]`;
  const object = value as Record<string, unknown>;
  return `{${Object.keys(object).sort().map(key => `${JSON.stringify(key)}:${canonicalChangeJson(object[key])}`).join(",")}}`;
}
export function sameChangeValue(left: unknown, right: unknown): boolean {
  return canonicalChangeJson(changeValueSchema.parse(left)) === canonicalChangeJson(changeValueSchema.parse(right));
}
