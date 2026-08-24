import { randomUUID } from "node:crypto";

import { requestIdSchema } from "@ka/domain";

export const REQUEST_ID_HEADER = "x-request-id";

export function isValidRequestId(value: string): boolean {
  return requestIdSchema.safeParse(value).success;
}

export function resolveRequestId(
  candidate: string | null,
  generate: () => string = randomUUID,
): string {
  if (candidate !== null && isValidRequestId(candidate)) return candidate;
  const generated = generate();
  if (!isValidRequestId(generated)) {
    throw new Error("Generated request ID is not log-safe");
  }
  return generated;
}
