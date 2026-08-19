import type {
  AgentRunEvent,
  AgentTaskKind,
  ProviderCapability,
} from "@ka/domain";

export type ProviderProtocol = "anthropic_messages" | "openai_chat_completions";

export interface ProviderProfile {
  id: string;
  protocol: ProviderProtocol;
  baseUrl: string;
  models: string[];
  defaultModel: string;
  enabled: boolean;
  taskKinds: AgentTaskKind[];
  fallbackProviderIds: string[];
}

export interface ProviderCandidate {
  providerId: string;
  model: string;
  profileVersion: string;
  protocol: ProviderProtocol;
}

export interface RejectedProviderCandidate {
  providerId: string;
  model: string | null;
  reasons: string[];
}

export interface ProviderRouteDecision {
  taskKind: AgentTaskKind;
  selected: ProviderCandidate | null;
  candidates: ProviderCandidate[];
  rejected: RejectedProviderCandidate[];
}

export interface ProviderProbeInput {
  capability: ProviderCapability;
  profile: ProviderProfile;
  model: string;
  signal: AbortSignal;
}

export interface ProviderProbeTransport {
  probe(input: ProviderProbeInput): Promise<boolean>;
}

export type ProviderFailureKind =
  | "rate_limited"
  | "server_error"
  | "timeout"
  | "auth_error"
  | "invalid_request"
  | "capability_error";

export interface ProviderFallbackInput {
  candidates: readonly ProviderCandidate[];
  currentIndex: number;
  events: readonly AgentRunEvent[];
  failure: ProviderFailureKind;
}
