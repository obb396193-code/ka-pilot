import { z } from "zod";

import type {
  KnowledgeDocumentEnvelope,
  KnowledgeJsonObject,
  KnowledgeJsonValue,
} from "./knowledge-document.js";

export const KNOWLEDGE_BUSINESS_OBJECT_TYPES = [
  "task",
  "account",
  "report",
  "workflow",
  "workflow_run",
  "dataset",
  "changeset",
  "product",
  "material",
] as const;

export type KnowledgeBusinessObjectType = (typeof KNOWLEDGE_BUSINESS_OBJECT_TYPES)[number];
export type KnowledgeReferencePathPart = string | number;
export type KnowledgeReferencePath = readonly KnowledgeReferencePathPart[];
export type KnowledgeReferenceType = "wikilink" | "business_ref";
export type KnowledgeReferenceDiagnosticCode =
  | "malformed_reference"
  | "invalid_id"
  | "self_link"
  | "target_unavailable";

export interface KnowledgeReferenceDiagnostic {
  readonly referenceType: KnowledgeReferenceType;
  readonly code: KnowledgeReferenceDiagnosticCode;
  readonly path: KnowledgeReferencePath;
}

export interface KnowledgeWikilinkReference {
  readonly targetDocumentId: string;
  readonly title: string;
  readonly path: KnowledgeReferencePath;
}

export interface KnowledgeBusinessReference {
  readonly objectType: KnowledgeBusinessObjectType;
  readonly objectId: string;
  readonly label?: string;
  readonly snapshotVersion?: string;
  readonly dataCutoffAt?: string;
  readonly path: KnowledgeReferencePath;
}

export interface ExtractedKnowledgeReferences {
  readonly wikilinks: readonly KnowledgeWikilinkReference[];
  readonly businessRefs: readonly KnowledgeBusinessReference[];
  readonly diagnostics: readonly KnowledgeReferenceDiagnostic[];
}

export interface KnowledgeDocumentTargetResolutionInput {
  readonly workspaceId: string;
  readonly actorUserId: string;
  readonly targetDocumentIds: readonly string[];
}

export interface KnowledgeDocumentTargetResolver {
  resolveAvailableDocumentIds(
    input: KnowledgeDocumentTargetResolutionInput,
  ): Promise<readonly string[]>;
}

export interface KnowledgeDocumentLinkReplacementInput {
  readonly workspaceId: string;
  readonly actorUserId: string;
  readonly sourceDocumentId: string;
  readonly document: KnowledgeDocumentEnvelope;
  readonly resolver: KnowledgeDocumentTargetResolver;
}

export interface KnowledgeDocumentLinkReplacementPlan {
  readonly replaceAll: true;
  readonly acceptedTargetIds: readonly string[];
  readonly rejected: readonly KnowledgeReferenceDiagnostic[];
}

const uuidSchema = z.string().uuid().transform((value) => value.toLowerCase());
const safeOpaqueIdSchema = z
  .string()
  .regex(/^[A-Za-z0-9][A-Za-z0-9._:-]{0,199}$/, "unsafe opaque id");
const safeSnapshotSchema = z
  .string()
  .regex(/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/, "unsafe snapshot version");

const wikilinkNodeSchema = z
  .object({
    type: z.literal("wikilink"),
    props: z
      .object({
        itemId: uuidSchema,
        title: z.string().trim().min(1).max(200),
      })
      .strict(),
  })
  .strict();

const businessReferenceNodeSchema = z
  .object({
    type: z.literal("business_ref"),
    props: z
      .object({
        objectType: z.enum(KNOWLEDGE_BUSINESS_OBJECT_TYPES),
        objectId: safeOpaqueIdSchema,
        label: z.string().trim().min(1).max(200).optional(),
        snapshotVersion: safeSnapshotSchema.optional(),
        dataCutoffAt: z.string().datetime({ offset: true }).optional(),
      })
      .strict(),
  })
  .strict();

interface MutableExtraction {
  wikilinks: KnowledgeWikilinkReference[];
  businessRefs: KnowledgeBusinessReference[];
  diagnostics: KnowledgeReferenceDiagnostic[];
  wikilinkKeys: Set<string>;
  businessKeys: Set<string>;
}

export function extractKnowledgeReferences(
  document: KnowledgeDocumentEnvelope,
): ExtractedKnowledgeReferences {
  const result: MutableExtraction = {
    wikilinks: [],
    businessRefs: [],
    diagnostics: [],
    wikilinkKeys: new Set(),
    businessKeys: new Set(),
  };
  visitKnowledgeValue(document.blocks, ["blocks"], result);
  return Object.freeze({
    wikilinks: Object.freeze(result.wikilinks),
    businessRefs: Object.freeze(result.businessRefs),
    diagnostics: Object.freeze(result.diagnostics),
  });
}

export async function planKnowledgeDocumentLinkReplacement(
  input: KnowledgeDocumentLinkReplacementInput,
): Promise<KnowledgeDocumentLinkReplacementPlan> {
  const context = parseLinkContext(input);
  const extracted = extractKnowledgeReferences(input.document);
  const rejected = extracted.diagnostics.filter(
    (diagnostic) => diagnostic.referenceType === "wikilink",
  );
  const external = rejectSelfLinks(extracted.wikilinks, context.sourceDocumentId, rejected);
  const available = await resolveTargets(input.resolver, context, external);
  const acceptedTargetIds: string[] = [];
  for (const reference of external) {
    if (available.has(reference.targetDocumentId)) acceptedTargetIds.push(reference.targetDocumentId);
    else rejected.push(diagnostic("wikilink", "target_unavailable", reference.path));
  }
  return Object.freeze({
    replaceAll: true,
    acceptedTargetIds: Object.freeze(acceptedTargetIds),
    rejected: Object.freeze(rejected),
  });
}

function visitKnowledgeValue(
  value: KnowledgeJsonValue,
  path: readonly KnowledgeReferencePathPart[],
  result: MutableExtraction,
): void {
  if (Array.isArray(value)) {
    value.forEach((item, index) => visitKnowledgeValue(item, [...path, index], result));
    return;
  }
  if (!isKnowledgeObject(value)) return;
  if (value.type === "wikilink") {
    collectWikilink(value, path, result);
    return;
  }
  if (value.type === "business_ref") {
    collectBusinessReference(value, path, result);
    return;
  }
  for (const [key, child] of Object.entries(value)) {
    visitKnowledgeValue(child, [...path, key], result);
  }
}

function collectWikilink(
  value: KnowledgeJsonObject,
  path: readonly KnowledgeReferencePathPart[],
  result: MutableExtraction,
): void {
  const parsed = wikilinkNodeSchema.safeParse(value);
  if (!parsed.success) {
    const code = hasOnlyInvalidWikilinkId(value) ? "invalid_id" : "malformed_reference";
    result.diagnostics.push(diagnostic("wikilink", code, path));
    return;
  }
  if (result.wikilinkKeys.has(parsed.data.props.itemId)) return;
  result.wikilinkKeys.add(parsed.data.props.itemId);
  result.wikilinks.push(
    Object.freeze({
      targetDocumentId: parsed.data.props.itemId,
      title: parsed.data.props.title,
      path: freezePath(path),
    }),
  );
}

function hasOnlyInvalidWikilinkId(value: KnowledgeJsonObject): boolean {
  if (!hasExactKeys(value, ["type", "props"]) || !isKnowledgeObject(value.props)) return false;
  if (!hasExactKeys(value.props, ["itemId", "title"])) return false;
  if (typeof value.props.itemId !== "string" || typeof value.props.title !== "string") return false;
  return !uuidSchema.safeParse(value.props.itemId).success;
}

function collectBusinessReference(
  value: KnowledgeJsonObject,
  path: readonly KnowledgeReferencePathPart[],
  result: MutableExtraction,
): void {
  const parsed = businessReferenceNodeSchema.safeParse(value);
  if (!parsed.success) {
    result.diagnostics.push(diagnostic("business_ref", "malformed_reference", path));
    return;
  }
  const key = businessReferenceKey(parsed.data.props);
  if (result.businessKeys.has(key)) return;
  result.businessKeys.add(key);
  result.businessRefs.push(buildBusinessReference(parsed.data.props, path));
}

function buildBusinessReference(
  props: z.infer<typeof businessReferenceNodeSchema>["props"],
  path: readonly KnowledgeReferencePathPart[],
): KnowledgeBusinessReference {
  return Object.freeze({
    objectType: props.objectType,
    objectId: props.objectId,
    ...(props.label === undefined ? {} : { label: props.label }),
    ...(props.snapshotVersion === undefined ? {} : { snapshotVersion: props.snapshotVersion }),
    ...(props.dataCutoffAt === undefined ? {} : { dataCutoffAt: props.dataCutoffAt }),
    path: freezePath(path),
  });
}

function businessReferenceKey(
  props: z.infer<typeof businessReferenceNodeSchema>["props"],
): string {
  return [
    props.objectType,
    props.objectId,
    props.snapshotVersion ?? "",
    props.dataCutoffAt ?? "",
  ].join("\0");
}

function parseLinkContext(input: KnowledgeDocumentLinkReplacementInput) {
  return {
    workspaceId: uuidSchema.parse(input.workspaceId),
    actorUserId: uuidSchema.parse(input.actorUserId),
    sourceDocumentId: uuidSchema.parse(input.sourceDocumentId),
  };
}

function rejectSelfLinks(
  references: readonly KnowledgeWikilinkReference[],
  sourceDocumentId: string,
  rejected: KnowledgeReferenceDiagnostic[],
): readonly KnowledgeWikilinkReference[] {
  const external: KnowledgeWikilinkReference[] = [];
  for (const reference of references) {
    if (reference.targetDocumentId === sourceDocumentId) {
      rejected.push(diagnostic("wikilink", "self_link", reference.path));
    } else external.push(reference);
  }
  return external;
}

async function resolveTargets(
  resolver: KnowledgeDocumentTargetResolver,
  context: ReturnType<typeof parseLinkContext>,
  references: readonly KnowledgeWikilinkReference[],
): Promise<ReadonlySet<string>> {
  if (references.length === 0) return new Set();
  const requested = references.map((reference) => reference.targetDocumentId);
  const resolved = await resolver.resolveAvailableDocumentIds({
    workspaceId: context.workspaceId,
    actorUserId: context.actorUserId,
    targetDocumentIds: Object.freeze(requested),
  });
  if (!Array.isArray(resolved)) throw new Error("knowledge target resolver returned invalid data");
  const allowed = new Set(requested);
  const available = new Set<string>();
  for (const rawId of resolved) {
    const parsed = uuidSchema.safeParse(rawId);
    if (!parsed.success || !allowed.has(parsed.data)) {
      throw new Error("knowledge target resolver returned an invalid or unrequested target");
    }
    available.add(parsed.data);
  }
  return available;
}

function diagnostic(
  referenceType: KnowledgeReferenceType,
  code: KnowledgeReferenceDiagnosticCode,
  path: readonly KnowledgeReferencePathPart[],
): KnowledgeReferenceDiagnostic {
  return Object.freeze({ referenceType, code, path: freezePath(path) });
}

function freezePath(path: readonly KnowledgeReferencePathPart[]): KnowledgeReferencePath {
  return Object.freeze([...path]);
}

function hasExactKeys(value: KnowledgeJsonObject, expected: readonly string[]): boolean {
  const keys = Object.keys(value).sort();
  return keys.length === expected.length && keys.every((key, index) => key === [...expected].sort()[index]);
}

function isKnowledgeObject(value: unknown): value is KnowledgeJsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
