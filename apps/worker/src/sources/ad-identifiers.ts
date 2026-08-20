import { createHash } from "node:crypto";

export type AdIdentifierSource = "kuaishou_unit_list" | "os_structured_result";
export type IdentifierCompleteness = "complete" | "unknown";
export type AdIdMappingStatus = "confirmed_equal" | "unverified" | "not_equal";

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
  evidence: AdIdentifierEvidence;
}

export interface CreateAdIdentifierDiscoveryInput {
  source: AdIdentifierSource;
  identifiers: readonly string[];
  completeness: IdentifierCompleteness;
  mappingToAdId: AdIdMappingStatus;
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
  fetchPage: (request: { page: number; pageSize: number }) => Promise<AdIdentifierPage>;
  pageSize?: number;
  maxPages?: number;
  maxIdentifiers?: number;
  observedAt?: Date;
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
  const observedAt = input.observedAt ?? new Date();
  if (Number.isNaN(observedAt.valueOf())) {
    throw new AdIdentifierSourceError("Advertisement identifier observation time is invalid");
  }
  return {
    source: input.source,
    identifiers,
    completeness: input.completeness,
    mappingToAdId: input.mappingToAdId,
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
    discovery.identifiers.length === 0
  ) {
    throw new AdIdentifierSourceError();
  }
  return [...discovery.identifiers];
}

export async function discoverAdIdentifiers(
  input: DiscoverAdIdentifiersInput,
): Promise<AdIdentifierDiscovery> {
  const pageSize = boundedInteger(input.pageSize ?? 100, 1, 500, "pageSize");
  const maxPages = boundedInteger(input.maxPages ?? 1000, 1, 1000, "maxPages");
  const maxIdentifiers = boundedInteger(
    input.maxIdentifiers ?? 100_000,
    1,
    1_000_000,
    "maxIdentifiers",
  );
  const collected: string[] = [];
  let rawCount = 0;
  let expectedTotal: number | null = null;

  for (let page = 1; page <= maxPages; page += 1) {
    const result = await fetchIdentifierPage(input.fetchPage, page, pageSize);
    assertIdentifierPage(result, page, pageSize, expectedTotal);
    expectedTotal ??= result.total;
    if (expectedTotal > maxIdentifiers) throw new AdIdentifierSourceError("Identifier total exceeds limit");
    const identifiers = normalizeIdentifiers(result.identifiers);
    rawCount += result.identifiers.length;
    if (rawCount > expectedTotal || rawCount > maxIdentifiers) {
      throw new AdIdentifierSourceError("Identifier count exceeds declared boundary");
    }
    collected.push(...identifiers);
    if (rawCount === expectedTotal) break;
    if (result.identifiers.length === 0) {
      throw new AdIdentifierSourceError("Identifier pagination stopped before total");
    }
    if (page === maxPages) throw new AdIdentifierSourceError("Identifier page count exceeds limit");
  }

  if (expectedTotal === null || rawCount !== expectedTotal) {
    throw new AdIdentifierSourceError("Identifier pagination is incomplete");
  }
  return createAdIdentifierDiscovery({
    source: input.source,
    identifiers: collected,
    completeness: "complete",
    mappingToAdId: input.mappingToAdId,
    ...(input.observedAt === undefined ? {} : { observedAt: input.observedAt }),
  });
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
  if (values.length === 0) {
    throw new AdIdentifierSourceError("Advertisement identifier source is empty");
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
