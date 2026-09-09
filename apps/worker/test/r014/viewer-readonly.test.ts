import { describe, expect, it } from "vitest";

import { guardedRoute } from "../../src/r014/http.js";
import { fakeRequest, fakeResponse } from "./fake-http.js";

/**
 * v1.9.6 Q-022：访客（`viewer`）只读。写请求在**路由层统一挡**——
 * 指望每个仓储各自记得判，少判一处就是一个访客能写的洞。
 */
describe("viewer is read-only at the route layer", () => {
  let handled = 0;
  const route = guardedRoute((pathname) => pathname === "/api/v1/probe", async (context) => {
    handled += 1;
    const { sendData } = await import("../../src/r014/http.js");
    sendData(context.response, { touched: true }, context.requestId, 1_000_000);
  });

  const call = async (role: string, method: string): Promise<{ status: number; body: unknown }> => {
    const { response, captured } = fakeResponse();
    await route.handle({
      request: fakeRequest(method, method === "GET" ? undefined : { any: "payload" }),
      response,
      url: new URL("http://data-api.internal/api/v1/probe"),
      auth: { workspaceId: "w", userId: "u", role, workspaceKind: "personal",
        scope: { kind: "explicit_accounts", accounts: [] } } as never,
      requestId: "probe",
      maxResponseBytes: 1_000_000,
    });
    return captured();
  };

  it("refuses every write method for a viewer and never reaches the handler", async () => {
    const before = handled;
    for (const method of ["POST", "PATCH", "PUT", "DELETE"]) {
      const result = await call("viewer", method);
      expect(result.status, method).toBe(403);
      expect((result.body as { error: { code: string } }).error.code).toBe("READ_ONLY_ROLE");
    }
    // 挡在处理器之前：不是「跑完了再拒绝」，那样写已经落库了。
    expect(handled).toBe(before);
  });

  it("still lets a viewer read", async () => {
    const result = await call("viewer", "GET");
    expect(result.status).toBe(200);
  });

  it("leaves the other roles alone", async () => {
    for (const role of ["optimizer", "lead", "admin"]) {
      expect((await call(role, "POST")).status, role).toBe(200);
    }
  });
});
