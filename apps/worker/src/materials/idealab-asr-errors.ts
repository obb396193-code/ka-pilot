export type IdeaLabAsrTransportFailureReason =
  | "invalid_config"
  | "invalid_input"
  | "auth_failed"
  | "invalid_request"
  | "rate_limited"
  | "retryable_transport"
  | "invalid_response"
  | "cleanup_failed";

export class IdeaLabAsrTransportError extends Error {
  constructor(
    readonly reason: IdeaLabAsrTransportFailureReason,
    readonly httpStatus?: number,
  ) {
    super(`IdeaLab ASR transport failed: ${reason}`);
    this.name = "IdeaLabAsrTransportError";
  }
}
