import { z } from "zod";

import {
  KNOWLEDGE_BUSINESS_OBJECT_TYPES,
  type KnowledgeBusinessObjectType,
} from "./knowledge-references.js";

export const KNOWLEDGE_SOURCE_TYPES = [
  "manual",
  "ai_report",
  "report_snapshot",
  "workflow_case",
  "lesson",
  "imported",
] as const;
export const KNOWLEDGE_VISIBILITIES = ["private", "team"] as const;
export const KNOWLEDGE_ASSET_STATES = [
  "draft",
  "shared",
  "verified",
  "official",
  "deprecated",
] as const;

export type KnowledgeSourceType = (typeof KNOWLEDGE_SOURCE_TYPES)[number];
export type KnowledgeVisibility = (typeof KNOWLEDGE_VISIBILITIES)[number];
export type KnowledgeAssetState = (typeof KNOWLEDGE_ASSET_STATES)[number];
export type KnowledgePermissionAction = "read" | "write";

export interface KnowledgeAssetMetadata {
  readonly source: KnowledgeSourceType;
  readonly visibility: KnowledgeVisibility;
  readonly assetState: KnowledgeAssetState;
}

export interface KnowledgeBusinessObjectIdentity {
  readonly objectType: KnowledgeBusinessObjectType;
  readonly objectId: string;
}

export interface KnowledgeSearchRequest {
  readonly workspaceId: string;
  readonly actorUserId: string;
  readonly query: string;
  readonly limit: number;
  readonly sourceTypes?: readonly KnowledgeSourceType[];
  readonly businessScope?: readonly KnowledgeBusinessObjectIdentity[];
}

export interface KnowledgeCitationBusinessReference extends KnowledgeBusinessObjectIdentity {
  readonly label?: string;
  readonly snapshotVersion?: string;
  readonly dataCutoffAt?: string;
}

export interface KnowledgeAgentCitation extends KnowledgeAssetMetadata {
  readonly workspaceId: string;
  readonly documentId: string;
  readonly title: string;
  readonly revision: number;
  readonly fragmentId: string;
  readonly fragmentText: string;
  readonly score: number;
  readonly evidenceKey: string;
  readonly businessRefs: readonly KnowledgeCitationBusinessReference[];
  readonly dataCutoffAt?: string;
  readonly snapshotVersion?: string;
}

export interface KnowledgeDocumentPermissionInput {
  readonly workspaceId: string;
  readonly actorUserId: string;
  readonly action: KnowledgePermissionAction;
  readonly documentIds: readonly string[];
}

export interface KnowledgeBusinessPermissionInput {
  readonly workspaceId: string;
  readonly actorUserId: string;
  readonly action: KnowledgePermissionAction;
  readonly objects: readonly KnowledgeBusinessObjectIdentity[];
}

export interface KnowledgePermissionPort {
  resolveAuthorizedDocumentIds(input: KnowledgeDocumentPermissionInput): Promise<readonly string[]>;
  resolveAuthorizedBusinessObjects(
    input: KnowledgeBusinessPermissionInput,
  ): Promise<readonly KnowledgeBusinessObjectIdentity[]>;
}

export interface KnowledgeSearchPort {
  /** Implementations must apply workspace and actor filters before returning plaintext. */
  searchAuthorized(input: KnowledgeSearchRequest): Promise<unknown>;
}

export type KnowledgeAccessErrorCode =
  | "invalid_metadata"
  | "invalid_search_request"
  | "invalid_search_result"
  | "invalid_permission_result";

export class KnowledgeAccessValidationError extends Error {
  readonly code: KnowledgeAccessErrorCode;

  constructor(code: KnowledgeAccessErrorCode, message: string) {
    super(message);
    this.name = "KnowledgeAccessValidationError";
    this.code = code;
  }
}

const uuidSchema = z.string().uuid().transform((value) => value.toLowerCase());
const safeOpaqueIdSchema = z
  .string()
  .regex(/^[A-Za-z0-9][A-Za-z0-9._:-]{0,199}$/, "unsafe opaque id");
const safeSnapshotSchema = z
  .string()
  .regex(/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/, "unsafe snapshot version");
const safeEvidenceKeySchema = z
  .string()
  .regex(/^[A-Za-z0-9][A-Za-z0-9._:/-]{0,255}$/, "unsafe evidence key");

const assetMetadataSchema = z
  .object({
    source: z.enum(KNOWLEDGE_SOURCE_TYPES),
    visibility: z.enum(KNOWLEDGE_VISIBILITIES),
    assetState: z.enum(KNOWLEDGE_ASSET_STATES),
  })
  .strict();

const businessIdentitySchema = z
  .object({
    objectType: z.enum(KNOWLEDGE_BUSINESS_OBJECT_TYPES),
    objectId: safeOpaqueIdSchema,
  })
  .strict();

const searchRequestSchema = z
  .object({
    workspaceId: uuidSchema,
    actorUserId: uuidSchema,
    query: z.string().trim().min(1).max(500),
    limit: z.number().int().min(1).max(50).default(10),
    sourceTypes: z.array(z.enum(KNOWLEDGE_SOURCE_TYPES)).max(6).optional(),
    businessScope: z.array(businessIdentitySchema).max(20).optional(),
  })
  .strict();

const citationBusinessReferenceSchema = businessIdentitySchema.extend({
  label: z.string().trim().min(1).max(200).optional(),
  snapshotVersion: safeSnapshotSchema.optional(),
  dataCutoffAt: z.string().datetime({ offset: true }).optional(),
});

const agentCitationSchema = assetMetadataSchema.extend({
  workspaceId: uuidSchema,
  documentId: uuidSchema,
  title: z.string().trim().min(1).max(200),
  revision: z.number().int().min(1).max(Number.MAX_SAFE_INTEGER),
  fragmentId: safeEvidenceKeySchema,
  fragmentText: z.string().trim().min(1).max(4_000),
  score: z.number().finite().min(0).max(1),
  evidenceKey: safeEvidenceKeySchema,
  businessRefs: z.array(citationBusinessReferenceSchema).max(20),
  dataCutoffAt: z.string().datetime({ offset: true }).optional(),
  snapshotVersion: safeSnapshotSchema.optional(),
});

export function parseKnowledgeAssetMetadata(input: unknown): KnowledgeAssetMetadata {
  const parsed = assetMetadataSchema.safeParse(input);
  if (!parsed.success) {
    throw new KnowledgeAccessValidationError(
      "invalid_metadata",
      "knowledge asset metadata is invalid",
    );
  }
  return Object.freeze(parsed.data);
}

export function parseKnowledgeSearchRequest(input: unknown): KnowledgeSearchRequest {
  const parsed = searchRequestSchema.safeParse(input);
  if (!parsed.success) throw invalidSearchRequest();
  return Object.freeze({
    workspaceId: parsed.data.workspaceId,
    actorUserId: parsed.data.actorUserId,
    query: parsed.data.query,
    limit: parsed.data.limit,
    ...(parsed.data.sourceTypes === undefined
      ? {}
      : { sourceTypes: Object.freeze(uniqueStrings(parsed.data.sourceTypes)) }),
    ...(parsed.data.businessScope === undefined
      ? {}
      : { businessScope: freezeBusinessIdentities(parsed.data.businessScope) }),
  });
}

export async function searchKnowledgeForAgent(
  input: unknown,
  searchPort: KnowledgeSearchPort,
  permissionPort: KnowledgePermissionPort,
): Promise<readonly KnowledgeAgentCitation[]> {
  const request = parseKnowledgeSearchRequest(input);
  const candidates = parseSearchResults(await searchPort.searchAuthorized(request), request);
  if (candidates.length === 0) return Object.freeze([]);
  const readableDocuments = await resolveReadableDocuments(request, candidates, permissionPort);
  const readableCitations = candidates.filter((item) => readableDocuments.has(item.documentId));
  if (readableCitations.length === 0) return Object.freeze([]);
  const readableBusinessObjects = await resolveReadableBusinessObjects(
    request,
    readableCitations,
    permissionPort,
  );
  return Object.freeze(
    readableCitations
      .filter((citation) =>
        citation.businessRefs.every((reference) =>
          readableBusinessObjects.has(businessIdentityKey(reference)),
        ),
      )
      .map((citation) => freezeCitation(citation, citation.businessRefs)),
  );
}

function parseSearchResults(
  raw: unknown,
  request: KnowledgeSearchRequest,
): readonly z.infer<typeof agentCitationSchema>[] {
  if (!Array.isArray(raw) || raw.length > request.limit) throw invalidSearchResult();
  const citations: z.infer<typeof agentCitationSchema>[] = [];
  const evidenceKeys = new Set<string>();
  for (const item of raw) {
    const parsed = agentCitationSchema.safeParse(item);
    if (!parsed.success || parsed.data.workspaceId !== request.workspaceId) {
      throw invalidSearchResult();
    }
    if (evidenceKeys.has(parsed.data.evidenceKey)) throw invalidSearchResult();
    evidenceKeys.add(parsed.data.evidenceKey);
    citations.push(parsed.data);
  }
  return citations;
}

async function resolveReadableDocuments(
  request: KnowledgeSearchRequest,
  citations: readonly z.infer<typeof agentCitationSchema>[],
  permissionPort: KnowledgePermissionPort,
): Promise<ReadonlySet<string>> {
  const requested = uniqueStrings(citations.map((citation) => citation.documentId));
  const raw = await permissionPort.resolveAuthorizedDocumentIds({
    workspaceId: request.workspaceId,
    actorUserId: request.actorUserId,
    action: "read",
    documentIds: Object.freeze(requested),
  });
  return validateAuthorizedDocumentIds(raw, requested);
}

async function resolveReadableBusinessObjects(
  request: KnowledgeSearchRequest,
  citations: readonly z.infer<typeof agentCitationSchema>[],
  permissionPort: KnowledgePermissionPort,
): Promise<ReadonlySet<string>> {
  const requested = uniqueBusinessIdentities(citations.flatMap((citation) => citation.businessRefs));
  if (requested.length === 0) return new Set();
  const raw = await permissionPort.resolveAuthorizedBusinessObjects({
    workspaceId: request.workspaceId,
    actorUserId: request.actorUserId,
    action: "read",
    objects: Object.freeze(requested),
  });
  return validateAuthorizedBusinessObjects(raw, requested);
}

function validateAuthorizedDocumentIds(
  raw: readonly string[],
  requested: readonly string[],
): ReadonlySet<string> {
  if (!Array.isArray(raw)) throw invalidPermissionResult();
  const allowed = new Set(requested);
  const result = new Set<string>();
  for (const item of raw) {
    const parsed = uuidSchema.safeParse(item);
    if (!parsed.success || !allowed.has(parsed.data)) throw invalidPermissionResult();
    result.add(parsed.data);
  }
  return result;
}

function validateAuthorizedBusinessObjects(
  raw: readonly KnowledgeBusinessObjectIdentity[],
  requested: readonly KnowledgeBusinessObjectIdentity[],
): ReadonlySet<string> {
  if (!Array.isArray(raw)) throw invalidPermissionResult();
  const allowed = new Set(requested.map(businessIdentityKey));
  const result = new Set<string>();
  for (const item of raw) {
    const parsed = businessIdentitySchema.safeParse(item);
    if (!parsed.success || !allowed.has(businessIdentityKey(parsed.data))) {
      throw invalidPermissionResult();
    }
    result.add(businessIdentityKey(parsed.data));
  }
  return result;
}

function freezeCitation(
  citation: z.infer<typeof agentCitationSchema>,
  authorizedBusinessRefs: readonly z.infer<typeof citationBusinessReferenceSchema>[],
): KnowledgeAgentCitation {
  return Object.freeze({
    workspaceId: citation.workspaceId,
    documentId: citation.documentId,
    title: citation.title,
    revision: citation.revision,
    fragmentId: citation.fragmentId,
    fragmentText: citation.fragmentText,
    score: citation.score,
    evidenceKey: citation.evidenceKey,
    source: citation.source,
    visibility: citation.visibility,
    assetState: citation.assetState,
    businessRefs: Object.freeze(
      authorizedBusinessRefs.map(freezeCitationBusinessReference),
    ),
    ...(citation.dataCutoffAt === undefined ? {} : { dataCutoffAt: citation.dataCutoffAt }),
    ...(citation.snapshotVersion === undefined
      ? {}
      : { snapshotVersion: citation.snapshotVersion }),
  });
}

function freezeCitationBusinessReference(
  reference: z.infer<typeof citationBusinessReferenceSchema>,
): KnowledgeCitationBusinessReference {
  return Object.freeze({
    objectType: reference.objectType,
    objectId: reference.objectId,
    ...(reference.label === undefined ? {} : { label: reference.label }),
    ...(reference.snapshotVersion === undefined
      ? {}
      : { snapshotVersion: reference.snapshotVersion }),
    ...(reference.dataCutoffAt === undefined
      ? {}
      : { dataCutoffAt: reference.dataCutoffAt }),
  });
}

function freezeBusinessIdentities(
  input: readonly KnowledgeBusinessObjectIdentity[],
): readonly KnowledgeBusinessObjectIdentity[] {
  return Object.freeze(uniqueBusinessIdentities(input).map((item) => Object.freeze({ ...item })));
}

function uniqueBusinessIdentities(
  input: readonly KnowledgeBusinessObjectIdentity[],
): KnowledgeBusinessObjectIdentity[] {
  const seen = new Set<string>();
  const result: KnowledgeBusinessObjectIdentity[] = [];
  for (const item of input) {
    const key = businessIdentityKey(item);
    if (seen.has(key)) continue;
    seen.add(key);
    result.push({ objectType: item.objectType, objectId: item.objectId });
  }
  return result;
}

function businessIdentityKey(input: KnowledgeBusinessObjectIdentity): string {
  return `${input.objectType}\0${input.objectId}`;
}

function uniqueStrings<T extends string>(input: readonly T[]): T[] {
  return [...new Set(input)];
}

function invalidSearchRequest(): KnowledgeAccessValidationError {
  return new KnowledgeAccessValidationError(
    "invalid_search_request",
    "knowledge search request is invalid",
  );
}

function invalidSearchResult(): KnowledgeAccessValidationError {
  return new KnowledgeAccessValidationError(
    "invalid_search_result",
    "knowledge search result is invalid",
  );
}

function invalidPermissionResult(): KnowledgeAccessValidationError {
  return new KnowledgeAccessValidationError(
    "invalid_permission_result",
    "knowledge permission resolver returned invalid data",
  );
}
