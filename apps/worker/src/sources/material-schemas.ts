import { z } from "zod";

const numericInteger = z.union([
  z.number().int().nonnegative(),
  z.string().regex(/^\d+$/).transform(Number),
]);

export const materialPoolRowSchema = z
  .object({
    signature: z.string().trim().min(1),
    material_name: z.string().nullish(),
    material_type: z.string().trim().min(1),
    item_id: z.union([z.string(), z.number()]).nullish(),
    material_url: z.string().nullish(),
    poster_url: z.string().nullish(),
    pict_url: z.string().nullish(),
    width: z.union([z.number(), z.string()]).nullish(),
    height: z.union([z.number(), z.string()]).nullish(),
    inventory_name: z.string().nullish(),
    material_spec_name: z.string().nullish(),
  })
  .passthrough();

export const materialPoolEnvelopeSchema = z
  .object({
    errCode: z.union([z.number(), z.string()]),
    errMsg: z.string().optional(),
    data: z
      .object({
        rows: z.array(materialPoolRowSchema),
        pageNum: numericInteger,
        pageSize: numericInteger,
        totalNum: numericInteger,
      })
      .optional(),
  })
  .passthrough();

export type MaterialPoolRow = z.infer<typeof materialPoolRowSchema>;
