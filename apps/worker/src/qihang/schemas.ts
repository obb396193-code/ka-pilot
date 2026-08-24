import { z } from "zod";

export const qihangEnvelopeSchema = z
  .object({
    successful: z.boolean(),
    code: z.union([z.string(), z.number()]).optional(),
    message: z.string().optional(),
    data: z.unknown().optional(),
  })
  .passthrough();

export const accountPageSchema = z
  .object({
    rows: z.array(z.record(z.string(), z.unknown())).default([]),
    totalNum: z.union([z.number(), z.string()]).nullish(),
    pageNum: z.union([z.number(), z.string()]).nullish(),
    pageSize: z.union([z.number(), z.string()]).nullish(),
  })
  .passthrough();

export const rowArraySchema = z.array(z.record(z.string(), z.unknown()));
