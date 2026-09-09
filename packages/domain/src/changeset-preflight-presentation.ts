import { z } from "zod";
import { changeValueSchema, sameChangeValue } from "./change-value-schema.js";
import { createPreflightPresentationSchemas } from "./changeset-preflight-wire.js";

export const { classifyPreflightObservation, preflightPresentationItemSchema, preflightPresentationDataSchema,
  preflightPresentationResponseSchema, preflightObservationSnapshotSchema } =
  createPreflightPresentationSchemas({ changeValueSchema, sameChangeValue });
export type PreflightPresentationData = z.infer<typeof preflightPresentationDataSchema>;
export type PreflightPresentationResponse = z.infer<typeof preflightPresentationResponseSchema>;
