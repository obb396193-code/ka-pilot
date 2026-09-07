import { z } from "zod";
import { canonicalMetricValueSchema } from "./metric-value.js";
import { ratioValueSchema } from "./data-query-base-rows.js";

const leafSchema = z.object({
  metric: z.string().regex(/^[a-z][a-z0-9_]{0,127}$/).refine(value => value !== "cost"),
  operator: z.enum([">", ">=", "<", "<=", "==", "!="]),
  threshold: z.union([z.number().finite(), z.literal("assessment_price")]),
  window_hours: z.number().int().positive().max(Number.MAX_SAFE_INTEGER).optional(),
  consecutive_days: z.number().int().positive().max(Number.MAX_SAFE_INTEGER).optional(),
}).strict();
type Leaf = z.infer<typeof leafSchema>;
type Group = "all" | "any" | "not";
type Node = { leaf: Leaf } | { groups: Partial<Record<Group, Node[]>> };
const groups: readonly Group[] = ["all", "any", "not"];
const valueSchema = z.union([canonicalMetricValueSchema, ratioValueSchema]);
const observationSchema = z.object({ value: valueSchema, granularity: z.enum(["daily", "hourly"]) }).strict();
type Value = z.infer<typeof valueSchema>;
export interface ConditionReadRequest { metric: string; windowHours: number | null; dayOffset: number }
export interface ConditionLeafResult extends ConditionReadRequest {
  operator: Leaf["operator"];
  threshold: number | Value;
  value: Value;
  pass: boolean | null;
}
function invalid(): never { throw new Error("Invalid rule condition or evidence"); }

/** Validate bounded structure before invoking any reader; cycles are rejected,
 * repeated object references (equivalent JSON leaves) are not mistaken for cycles. */
function parseTree(input: unknown): Node {
  let leaves = 0, nodes = 0, observations = 0;
  const ancestors = new Set<object>();
  function parse(raw: unknown, depth: number): Node {
    if (++nodes > 1024 || depth > 8 || !raw || typeof raw !== "object" || Array.isArray(raw) || ancestors.has(raw)) return invalid();
    const prototype = Object.getPrototypeOf(raw);
    if (prototype !== Object.prototype && prototype !== null) return invalid();
    ancestors.add(raw);
    try {
      const object = raw as Record<string, unknown>;
      if (depth > 1 && "metric" in object) {
        const result = leafSchema.safeParse(raw);
        if (!result.success || ++leaves > 128) return invalid();
        observations += (result.data.consecutive_days ?? 1) * (typeof result.data.threshold === "string" ? 2 : 1);
        if (!Number.isSafeInteger(observations) || observations > 4096) return invalid();
        return { leaf: result.data };
      }
      if (depth === 1 && object.version !== "v1") return invalid();
      if (Object.keys(object).some(key => !(groups as readonly string[]).includes(key) && !(depth === 1 && key === "version"))) return invalid();
      const parsed: Partial<Record<Group, Node[]>> = {};
      for (const group of groups) {
        if (!Object.hasOwn(object, group)) continue;
        const children = object[group];
        if (!Array.isArray(children) || children.length === 0 || children.length > 128) return invalid();
        parsed[group] = Array.from(children, child => parse(child, depth + 1));
      }
      if (Object.keys(parsed).length === 0) return invalid();
      return { groups: parsed };
    } finally { ancestors.delete(raw); }
  }
  const tree = parse(input, 1);
  if (leaves === 0) return invalid();
  return tree;
}

function number(value: Value): number | null {
  if ("availability" in value) return value.availability === "available" ? value.value : null;
  return value.state === "infinite" ? Infinity : value.value;
}
function compare(actual: number, threshold: number, operator: Leaf["operator"]): boolean {
  switch (operator) {
    case ">": return actual > threshold;
    case ">=": return actual >= threshold;
    case "<": return actual < threshold;
    case "<=": return actual <= threshold;
    case "==": return actual === threshold;
    case "!=": return actual !== threshold;
  }
}

/** Internal evidence interpreter, not a trigger/authorization/freshness decision.
 * Reader must resolve each business-day window and the weighted cash assessment
 * price. A missing window means caller's current window, not an invented 24h.
 * Missing evidence anywhere dominates AND/OR/NOT (no trigger, no clear).
 */
export function evaluateConditionTree(input: unknown, reader: (request: ConditionReadRequest) => unknown): {
  pass: boolean | null; reason: "METRIC_MISSING" | "CONDITION_FALSE" | null; leaves: ConditionLeafResult[];
} {
  const root = parseTree(input), leaves: ConditionLeafResult[] = [];
  const cache = new Map<string, Value>();
  function read(request: ConditionReadRequest): Value {
    const key = JSON.stringify([request.metric, request.windowHours, request.dayOffset]);
    const cached = cache.get(key);
    if (cached !== undefined) return cached;
    const parsed = observationSchema.safeParse(reader({ ...request }));
    if (!parsed.success || (parsed.data.granularity === "daily" && request.windowHours !== null && request.windowHours % 24 !== 0)) return invalid();
    cache.set(key, parsed.data.value);
    return parsed.data.value;
  }
  function evaluate(node: Node): boolean {
    if ("leaf" in node) {
      const leaf = node.leaf, results: boolean[] = [];
      for (let dayOffset = 0; dayOffset < (leaf.consecutive_days ?? 1); dayOffset++) {
        const request = { metric: leaf.metric, windowHours: leaf.window_hours ?? null, dayOffset };
        const value = read(request);
        const threshold = typeof leaf.threshold === "number" ? leaf.threshold : read({ ...request, metric: "assessment_price" });
        const actualNumber = number(value), thresholdNumber = typeof threshold === "number" ? threshold : number(threshold);
        if (thresholdNumber !== null && !Number.isFinite(thresholdNumber)) return invalid();
        const pass = actualNumber === null || thresholdNumber === null ? null : compare(actualNumber, thresholdNumber, leaf.operator);
        leaves.push({ ...request, operator: leaf.operator, value, threshold, pass });
        results.push(pass === true);
      }
      return results.every(Boolean);
    }
    // Evaluate every branch first. Never use every/some as a short-circuit reader.
    const results = groups.flatMap(group => {
      const children = node.groups[group];
      if (!children) return [];
      const values = children.map(evaluate);
      return [group === "all" ? values.every(Boolean) : group === "any" ? values.some(Boolean) : !values.some(Boolean)];
    });
    return results.every(Boolean);
  }
  const matched = evaluate(root);
  if (leaves.some(leaf => leaf.pass === null)) return { pass: null, reason: "METRIC_MISSING", leaves };
  return { pass: matched, reason: matched ? null : "CONDITION_FALSE", leaves };
}
