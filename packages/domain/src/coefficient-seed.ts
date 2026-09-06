import { z } from "zod";

const effectiveDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine((value) => {
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number(value.slice(0, 4)) > 0 && Number.isFinite(date.valueOf()) && date.toISOString().slice(0, 10) === value;
});

export const coefficientSeedSchema = z.object({
  workspace_id: z.string().uuid(),
  effective_date: effectiveDate,
}).strict();
export type CoefficientSeed = z.infer<typeof coefficientSeedSchema>;

export function parseCoefficientSeed(value: unknown): CoefficientSeed {
  const parsed = coefficientSeedSchema.safeParse(value);
  if (!parsed.success) throw new Error("Invalid coefficient seed");
  return parsed.data;
}

/** Deployment initial data only. Runtime metric formulas must read versioned DB rows. */
export function initialCoefficientSeedRows(): { media: string; op: "multiply" | "divide"; coefficient: string }[] {
  return [
    { media: "KUAISHOU", op: "multiply", coefficient: "0.7812" },
    { media: "TENCENT", op: "divide", coefficient: "1.045" },
    { media: "TOUTIAO", op: "divide", coefficient: "1.09" },
    { media: "BAIDU", op: "divide", coefficient: "1.51" },
  ];
}
