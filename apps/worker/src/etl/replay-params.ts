import type { QihangQuery } from "../qihang/client.js";

export function replayRequestParams(query: QihangQuery): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(query).filter(([key]) => key !== "resource" && key !== "userId"),
  );
}
