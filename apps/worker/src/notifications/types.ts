export interface OutboundMessage {
  workspaceId: string | null;
  channel: "dingtalk";
  target: string;
  kind: "job_failed" | "job_blocked_auth" | "data_quality_failed";
  payload: Record<string, unknown>;
}

export interface OutboundStore {
  enqueue(message: OutboundMessage): Promise<void>;
}
