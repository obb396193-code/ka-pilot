import { describe, expect, it } from "vitest";

import {
  isValidRequestId,
  resolveRequestId,
} from "../src/data/request-id.js";

describe("data API request IDs", () => {
  it("accepts a bounded log-safe BFF correlation ID", () => {
    const requestId = "bff_20260824:01.abc-123";
    expect(isValidRequestId(requestId)).toBe(true);
    expect(resolveRequestId(requestId, () => "fallback-id")).toBe(requestId);
  });

  it.each([
    null,
    "",
    " leading-space",
    "line\nbreak",
    "carriage\rreturn",
    "unicode-请求",
    "slash/not-log-safe",
    "x".repeat(129),
  ])("regenerates an absent or unsafe value without reflecting it: %j", (candidate) => {
    expect(resolveRequestId(candidate, () => "safe-fallback-id")).toBe("safe-fallback-id");
  });

  it("fails closed when a configured fallback generator is itself unsafe", () => {
    expect(() => resolveRequestId("bad\nheader", () => "bad\nfallback")).toThrow(
      /generated request ID/i,
    );
  });
});
