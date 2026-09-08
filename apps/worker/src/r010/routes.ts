import type { IncomingMessage, ServerResponse } from "node:http";
import type { ApprovedWorkspaceAuthContext } from "@ka/domain";

/** Server shell must perform internal bearer + session resolution first.
 * Structurally compatible with the existing hook; no R014 global registration.
 */
export interface R010RouteContext {
  request: IncomingMessage;
  response: ServerResponse;
  url: URL;
  auth: ApprovedWorkspaceAuthContext;
  requestId: string;
  maxResponseBytes: number;
  maxRequestBytes?: number;
}
export interface R010Route {
  matches(pathname: string): boolean;
  handle(context: R010RouteContext): Promise<void>;
}
