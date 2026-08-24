export type CredentialEnvelopeErrorCode =
  | "invalid_token"
  | "expired"
  | "not_yet_valid"
  | "binding_mismatch";

export interface CredentialEnvelopeBinding {
  workspaceId: string;
  userId: string;
  runId: string;
  providerId: string;
  model: string;
}

export interface CredentialEnvelopeClaims extends CredentialEnvelopeBinding {
  credential: string;
  issuedAt: string;
  expiresAt: string;
}

export class CredentialEnvelopeError extends Error {
  readonly code: CredentialEnvelopeErrorCode;
}

export function sealCredentialEnvelope(
  input: CredentialEnvelopeBinding & { credential: string },
  encodedKey: string,
  options?: { now?: Date; ttlMs?: number },
): string;

export function openCredentialEnvelope(
  token: string,
  encodedKey: string,
  options: { expected: CredentialEnvelopeBinding; now?: Date },
): CredentialEnvelopeClaims;

export interface GatewayProviderHook {
  key: string;
  providerName?: string;
  authenticate(input: {
    request: { headers: Record<string, string | string[] | undefined> };
    targetProvider?: string;
    targetProviderConfig?: { name?: string; type?: string };
    model?: string;
    upstreamRequest: {
      method?: string;
      url: string;
      headers: Record<string, string>;
      body: unknown;
    };
  }): Promise<
    | {
        ok: true;
        value: {
          method?: string;
          url: string;
          headers: Record<string, string>;
          body: unknown;
        };
      }
    | { ok: false; error: string }
  >;
}

export function createKaCredentialProviderHook(options: {
  envelopeKey: string;
  now: () => Date;
  providerName?: string;
}): GatewayProviderHook;

export function createGatewayPlugin(input?: {
  plugin?: { match?: { providerName?: string } };
}): { providerHooks: GatewayProviderHook[] };
