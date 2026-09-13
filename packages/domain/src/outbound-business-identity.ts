import { createHash } from "node:crypto";
import { z } from "zod";
import { outboundDedupeKey, outboundInstantSchema } from "./outbound-delivery.js";
import { shanghaiTaskBusinessDate } from "./task-list-contract.js";

const rowSchema = z.object({ workspaceId: z.uuid(), kind: z.string().min(1).max(2048),
  target: z.string().min(1).max(2048), payload: z.record(z.string(), z.unknown()), createdAt: outboundInstantSchema,
  jobBusinessDate: z.iso.date().nullish(), runBusinessDate: z.iso.date().nullish(),
}).strict();

/** Stable JSON, not locale collation. Reject non-JSON, depth/node/byte overflow. */
function stableHash(value: unknown): string {
  let nodes = 0;
  const visit = (item: unknown, depth: number): unknown => {
    if (++nodes > 100_000 || depth > 32) throw new Error("OUTBOUND_PAYLOAD_INVALID");
    if (item === null || typeof item === "boolean" || typeof item === "string") return item;
    if (typeof item === "number" && Number.isFinite(item)) return item;
    if (Array.isArray(item)) return Array.from(item, v => visit(v, depth + 1));
    if (!item || typeof item !== "object" || Object.getPrototypeOf(item) !== Object.prototype) throw new Error("OUTBOUND_PAYLOAD_INVALID");
    return Object.fromEntries(Object.keys(item).sort().map(key => [key, visit((item as Record<string, unknown>)[key], depth + 1)]));
  };
  const encoded = JSON.stringify(visit(value, 0));
  if (Buffer.byteLength(encoded) >= 16 * 1024 * 1024) throw new Error("OUTBOUND_PAYLOAD_INVALID");
  return createHash("sha256").update(encoded).digest("hex");
}

/** arch v1.9.48. Hints come from a same-workspace DB lookup, never a browser. */
export function prepareOutboundBusinessIdentity(input: unknown) {
  const row = rowSchema.parse(input), payloadHash = stableHash(row.payload);
  let businessDate = shanghaiTaskBusinessDate(new Date(row.createdAt));
  let businessKey: string;
  if (row.kind === "job_failed" || row.kind === "job_blocked_auth") {
    businessKey = z.uuid().parse(row.payload.jobId).toLowerCase();
    businessDate = row.jobBusinessDate ?? row.runBusinessDate ?? businessDate;
  } else if (row.kind === "data_quality_failed") {
    const ds = z.iso.date().parse(row.payload.ds);
    const checks = z.array(z.string().min(1).max(256)).max(1000).parse(row.payload.failedChecks);
    businessKey = stableHash({ ds, failedChecks: [...new Set(checks)].sort() });
    businessDate = ds;
  } else {
    businessKey = row.payload.refId == null ? payloadHash : z.string().min(1).max(2048).parse(row.payload.refId);
  }
  return { businessKey, businessDate, dedupeKey: outboundDedupeKey({ workspaceId: row.workspaceId, kind: row.kind,
    target: row.target, businessKey, businessDate }) };
}
