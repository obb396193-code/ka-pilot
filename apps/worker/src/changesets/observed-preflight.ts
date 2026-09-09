import { preflightPresentationItemSchema, type ChangeSetItemSnapshot } from "@ka/domain";
import type { z } from "zod";
import { DryRunServiceError, type preflightObservedProofSchema } from "./dry-run-contract.js";

export function observedPreflightSnapshot(draft: ChangeSetItemSnapshot[], proof: z.infer<typeof preflightObservedProofSchema>, finished: Date) {
  if (proof.dataAsOf !== null && Date.parse(proof.dataAsOf) > finished.getTime()) throw new DryRunServiceError("UPSTREAM_INVALID_RESPONSE");
  const observations = new Map(proof.items.map(item => [item.itemId, item]));
  const items = draft.map(item => {
    const evidence = observations.get(item.id);
    if (!evidence) throw new DryRunServiceError("UPSTREAM_INVALID_RESPONSE");
    const verdict = evidence.status === "success" ? "ok" : evidence.status === "unknown" ? "unknown" : evidence.failReason === "FROM_VALUE_CHANGED" ? "changed" : "blocked";
    const reasons = { ok: null, changed: "媒体侧现值与你起草时不同，确认前请复核", unknown: "媒体侧本项读不回来，不猜；确认时会再读一次", blocked: "本项未通过权限、目标或字段预检，不能确认" };
    const parsed = preflightPresentationItemSchema.safeParse({ itemId: String(item.id), targetType: item.targetType,
      targetId: item.targetId, field: item.field, fromValue: item.fromValue, toValue: item.toValue,
      observed: evidence.observed, verdict, reason: reasons[verdict] });
    if (!parsed.success) throw new DryRunServiceError("UPSTREAM_INVALID_RESPONSE");
    return parsed.data;
  });
  return { checkedAt: finished.toISOString(), dataAsOf: proof.dataAsOf, items };
}
