export type ProviderHealthState = "unknown" | "probing" | "healthy" | "degraded" | "blocked";
export type AgentTaskKind = "chat" | "diagnosis" | "background";
export type ProviderCapability =
  | "connectivity"
  | "streaming"
  | "toolCalling"
  | "structuredOutput"
  | "abort";

export interface ProviderCapabilities {
  connectivity: boolean;
  streaming: boolean;
  toolCalling: boolean;
  structuredOutput: boolean;
  abort: boolean;
}

export interface ProviderCapabilitySnapshot {
  providerId: string;
  model: string;
  state: ProviderHealthState;
  checkedAt: string;
  version: string;
  capabilities: ProviderCapabilities;
}

export interface ProviderReadiness {
  eligible: boolean;
  reasons: string[];
}

const TASK_REQUIREMENTS: Readonly<Record<AgentTaskKind, readonly ProviderCapability[]>> = {
  chat: ["connectivity", "streaming", "toolCalling", "abort"],
  diagnosis: ["connectivity", "structuredOutput", "abort"],
  background: ["connectivity", "toolCalling", "structuredOutput", "abort"],
};

export function requiredProviderCapabilities(taskKind: AgentTaskKind): ProviderCapability[] {
  return [...TASK_REQUIREMENTS[taskKind]];
}

export function assessProviderReadiness(
  snapshot: ProviderCapabilitySnapshot,
  taskKind: AgentTaskKind,
): ProviderReadiness {
  assertSnapshot(snapshot);
  if (snapshot.state !== "healthy") {
    return { eligible: false, reasons: [`provider_state_${snapshot.state}`] };
  }
  const reasons = requiredProviderCapabilities(taskKind)
    .filter((capability) => !snapshot.capabilities[capability])
    .map((capability) => `missing_${capability}`);
  return { eligible: reasons.length === 0, reasons };
}

function assertSnapshot(snapshot: ProviderCapabilitySnapshot): void {
  if (snapshot.providerId.trim() === "" || snapshot.model.trim() === "" || snapshot.version.trim() === "") {
    throw new Error("Provider capability snapshot identity fields are required");
  }
  if (!Number.isFinite(Date.parse(snapshot.checkedAt))) {
    throw new Error("Provider capability checkedAt must be a valid timestamp");
  }
}
