import { createHash } from "node:crypto";

export type AdIdentifierSource = "kuaishou_unit_list" | "os_structured_result";
export type IdentifierCompleteness = "complete" | "unknown";
export type AdIdMappingStatus = "confirmed_equal" | "unverified" | "not_equal";
export type AdIdMappingEvidenceKind = "os_set_equality_probe" | "platform_contract";

export interface AdIdMappingEvidenceInput {
  kind: AdIdMappingEvidenceKind;
  fingerprint: string;
  verifiedAt: Date;
}

export interface AdIdMappingEvidence {
  kind: AdIdMappingEvidenceKind;
  fingerprint: string;
  verifiedAt: string;
}

export interface AdIdentifierEvidence {
  source: AdIdentifierSource;
  identifierCount: number;
  fingerprint: string;
  observedAt: string;
}

export interface AdIdentifierDiscovery {
  source: AdIdentifierSource;
  identifiers: readonly string[];
  completeness: IdentifierCompleteness;
  mappingToAdId: AdIdMappingStatus;
  mappingEvidence?: AdIdMappingEvidence;
  evidence: AdIdentifierEvidence;
}

export interface CreateAdIdentifierDiscoveryInput {
  source: AdIdentifierSource;
  identifiers: readonly string[];
  completeness: IdentifierCompleteness;
  mappingToAdId: AdIdMappingStatus;
  mappingEvidence?: AdIdMappingEvidenceInput;
  observedAt?: Date;
}

export interface AdIdentifierPage {
  page: number;
  pageSize: number;
  total: number;
  identifiers: readonly string[];
}

export interface DiscoverAdIdentifiersInput {
  source: AdIdentifierSource;
  mappingToAdId: AdIdMappingStatus;
  mappingEvidence?: AdIdMappingEvidenceInput;
  fetchPage: (request: { page: number; pageSize: number }) => Promise<AdIdentifierPage>;
  pageSize?: number;
  maxPages?: number;
  maxIdentifiers?: number;
  observedAt?: Date;
}

interface IdentifierDiscoveryState {
  collected: string[];
  rawCount: number;
  expectedTotal: number | null;
}

export class AdIdentifierSourceError extends Error {
  readonly code = "UNVERIFIED_ID_SOURCE";

  constructor(message = "Advertisement identifier source is not authoritative") {
    super(message);
    this.name = "AdIdentifierSourceError";
  }
}

export function createAdIdentifierDiscovery(
  input: CreateAdIdentifierDiscoveryInput,
): AdIdentifierDiscovery {
  const identifiers = normalizeIdentifiers(input.identifiers);
  const mappingEvidence = normalizeMappingEvidence(input.mappingToAdId, input.mappingEvidence);
  const observedAt = input.observedAt ?? new Date();
  if (!(observedAt instanceof Date) || Number.isNaN(observedAt.valueOf())) {
    throw new AdIdentifierSourceError("Advertisement identifier observation time is invalid");
  }
  return {
    source: input.source,
    identifiers,
    completeness: input.completeness,
    mappingToAdId: input.mappingToAdId,
    ...(mappingEvidence === undefined ? {} : { mappingEvidence }),
    evidence: {
      source: input.source,
      identifierCount: identifiers.length,
      fingerprint: fingerprintIdentifiers(identifiers),
      observedAt: observedAt.toISOString(),
    },
  };
}

export function requireAuthoritativeAdIds(
  discovery: AdIdentifierDiscovery,
): string[] {
  if (
    discovery.completeness !== "complete" ||
    discovery.mappingToAdId !== "confirmed_equal" ||
    discovery.identifiers.length === 0 ||
    !isValidStoredMappingEvidence(discovery.mappingEvidence)
  ) {
    throw new AdIdentifierSourceError();
  }
  return [...discovery.identifiers];
}

export async function discoverAdIdentifiers(
  input: DiscoverAdIdentifiersInput,
): Promise<AdIdentifierDiscovery> {
  const pageSize = boundedInteger(valueOr(input.pageSize, 100), 1, 500, "pageSize");
  const maxPages = boundedInteger(valueOr(input.maxPages, 1000), 1, 1000, "maxPages");
  const maxIdentifiers = boundedInteger(
    valueOr(input.maxIdentifiers, 100_000),
    1,
    1_000_000,
    "maxIdentifiers",
  );
  const state: IdentifierDiscoveryState = { collected: [], rawCount: 0, expectedTotal: null };

  for (let page = 1; page <= maxPages; page += 1) {
    const result = await fetchIdentifierPage(input.fetchPage, page, pageSize);
    const complete = applyIdentifierPage(state, result, page, pageSize, maxIdentifiers);
    if (complete) return finalizeDiscovery(input, state.collected);
    assertIdentifierPageCanContinue(result, page, maxPages);
  }
  throw new AdIdentifierSourceError("Identifier pagination is incomplete");
}

function finalizeDiscovery(
  input: DiscoverAdIdentifiersInput,
  identifiers: readonly string[],
): AdIdentifierDiscovery {
  const common = {
    source: input.source,
    identifiers,
    completeness: "complete" as const,
    mappingToAdId: input.mappingToAdId,
    ...(input.mappingEvidence === undefined ? {} : { mappingEvidence: input.mappingEvidence }),
  };
  if (input.observedAt === undefined) return createAdIdentifierDiscovery(common);
  return createAdIdentifierDiscovery({
    ...common,
    observedAt: input.observedAt,
  });
}

function normalizeMappingEvidence(
  status: AdIdMappingStatus,
  evidence: AdIdMappingEvidenceInput | undefined,
): AdIdMappingEvidence | undefined {
  if (status !== "confirmed_equal") {
    if (evidence !== undefined) {
      throw new AdIdentifierSourceError("Unconfirmed mappings cannot carry confirmation evidence");
    }
    return undefined;
  }
  if (
    evidence === undefined ||
    !["os_set_equality_probe", "platform_contract"].includes(evidence.kind) ||
    !/^[a-f0-9]{64}$/.test(evidence.fingerprint)
  ) {
    throw new AdIdentifierSourceError("Confirmed mapping requires a valid evidence fingerprint");
  }
  if (!(evidence.verifiedAt instanceof Date) || Number.isNaN(evidence.verifiedAt.valueOf())) {
    throw new AdIdentifierSourceError("Mapping evidence time is invalid");
  }
  return {
    kind: evidence.kind,
    fingerprint: evidence.fingerprint,
    verifiedAt: evidence.verifiedAt.toISOString(),
  };
}

function isValidStoredMappingEvidence(
  evidence: AdIdMappingEvidence | undefined,
): evidence is AdIdMappingEvidence {
  if (evidence === undefined) return false;
  if (!["os_set_equality_probe", "platform_contract"].includes(evidence.kind)) return false;
  if (!/^[a-f0-9]{64}$/.test(evidence.fingerprint)) return false;
  const verifiedAt = new Date(evidence.verifiedAt);
  return !Number.isNaN(verifiedAt.valueOf()) && verifiedAt.toISOString() === evidence.verifiedAt;
}

function applyIdentifierPage(
  state: IdentifierDiscoveryState,
  result: AdIdentifierPage,
  requestedPage: number,
  requestedPageSize: number,
  maxIdentifiers: number,
): boolean {
  assertIdentifierPage(result, requestedPage, requestedPageSize, state.expectedTotal);
  state.expectedTotal = valueOr(state.expectedTotal, result.total);
  if (state.expectedTotal > maxIdentifiers) {
    throw new AdIdentifierSourceError("Identifier total exceeds limit");
  }
  const identifiers = normalizeIdentifiers(result.identifiers);
  state.rawCount += result.identifiers.length;
  if (state.rawCount > state.expectedTotal || state.rawCount > maxIdentifiers) {
    throw new AdIdentifierSourceError("Identifier count exceeds declared boundary");
  }
  state.collected.push(...identifiers);
  return state.rawCount === state.expectedTotal;
}

function assertIdentifierPageCanContinue(
  result: AdIdentifierPage,
  page: number,
  maxPages: number,
): void {
  if (result.identifiers.length === 0) {
    throw new AdIdentifierSourceError("Identifier pagination stopped before total");
  }
  if (page === maxPages) throw new AdIdentifierSourceError("Identifier page count exceeds limit");
}

async function fetchIdentifierPage(
  fetchPage: DiscoverAdIdentifiersInput["fetchPage"],
  page: number,
  pageSize: number,
): Promise<AdIdentifierPage> {
  try {
    return await fetchPage({ page, pageSize });
  } catch (error) {
    if (error instanceof AdIdentifierSourceError) throw error;
    throw new AdIdentifierSourceError("Identifier source request failed");
  }
}

function assertIdentifierPage(
  result: AdIdentifierPage,
  requestedPage: number,
  requestedPageSize: number,
  expectedTotal: number | null,
): void {
  if (
    !Number.isSafeInteger(result.page) ||
    !Number.isSafeInteger(result.pageSize) ||
    !Number.isSafeInteger(result.total) ||
    result.total < 0 ||
    result.page !== requestedPage ||
    result.pageSize !== requestedPageSize ||
    result.identifiers.length > requestedPageSize
  ) {
    throw new AdIdentifierSourceError("Identifier pagination metadata is invalid");
  }
  if (expectedTotal !== null && result.total !== expectedTotal) {
    throw new AdIdentifierSourceError("Identifier pagination total changed between pages");
  }
}

function normalizeIdentifiers(values: readonly string[]): string[] {
  if (!Array.isArray(values) || values.length === 0) {
    throw new AdIdentifierSourceError("Advertisement identifier source is empty");
  }
  if (!values.every((value) => typeof value === "string")) {
    throw new AdIdentifierSourceError("Advertisement identifier source contains an invalid value");
  }
  const normalized = values.map((value) => value.trim());
  if (normalized.some((value) => value === "")) {
    throw new AdIdentifierSourceError("Advertisement identifier source contains a blank value");
  }
  return [...new Set(normalized)];
}

function fingerprintIdentifiers(values: readonly string[]): string {
  return createHash("sha256")
    .update(JSON.stringify([...values].sort()))
    .digest("hex");
}

function boundedInteger(value: number, minimum: number, maximum: number, name: string): number {
  if (!Number.isInteger(value) || value < minimum || value > maximum) {
    throw new AdIdentifierSourceError(`${name} is outside its configured boundary`);
  }
  return value;
}

function valueOr<T>(value: T | null | undefined, fallback: T): T {
  return value === null || value === undefined ? fallback : value;
}
