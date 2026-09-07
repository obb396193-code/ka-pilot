import type { IncomingMessage, ServerResponse } from "node:http";

import type { ApprovedWorkspaceAuthContext } from "@ka/domain";

/** R-014 追加路由的执行上下文：服务令牌 + 会话鉴权都已由壳层做完，这里只拿结果。 */
export interface R014RouteContext {
  request: IncomingMessage;
  response: ServerResponse;
  url: URL;
  /** 已通过鉴权的调用方；壳层保证非 null。 */
  auth: ApprovedWorkspaceAuthContext;
  requestId: string;
  maxResponseBytes: number;
}

export interface R014Route {
  /** 这条路径归我吗？壳层在 404 兜底前先问，鉴权前调用。 */
  matches(pathname: string): boolean;
  /** 处理请求；壳层保证鉴权已通过。自行写响应。 */
  handle(context: R014RouteContext): Promise<void>;
}

/**
 * arch 开的缝（老板 2026-09-07：共享文件的结构性改造由 arch 做，两边只接自己那一头）。
 * be2 只往这个数组里 push 自己的路由，永不修改 `apps/worker/src/data/http-server.ts`。
 */
export const r014Routes: R014Route[] = [];

export function findR014Route(pathname: string): R014Route | null {
  return r014Routes.find((route) => route.matches(pathname)) ?? null;
}
