import type { QihangQuery } from "../qihang/client.js";
import type { QihangObservation } from "../qihang/observation.js";
import type { EtlQueryObservation } from "./types.js";

export function toEtlQueryObservation(
  query: QihangQuery,
  observation: QihangObservation,
): EtlQueryObservation {
  return Object.freeze({
    ...observation,
    ...(hasDate(query, "ds") ? { ds: query.ds } : {}),
    ...(hasDate(query, "beginDate") ? { beginDate: query.beginDate } : {}),
    ...(hasDate(query, "endDate") ? { endDate: query.endDate } : {}),
    ...((query.resource === "ad_realtime" || query.resource === "account_realtime") && query.hh !== undefined ? { hh: query.hh } : {}),
  });
}

function hasDate<T extends "ds" | "beginDate" | "endDate">(
  query: QihangQuery,
  key: T,
): query is QihangQuery & Record<T, string> {
  return key in query && typeof (query as Record<string, unknown>)[key] === "string";
}
