import { z } from "zod"
import { changeValueSchema, type ChangeValue } from "../../../../packages/domain/src/change-value-schema.ts"

// Share the exact runtime validator, but wrap its result with this app's Zod
// version. The shared module is browser-safe and never imports node:crypto.
export const readChangeValueSchema = z.custom<ChangeValue>((value) => changeValueSchema.safeParse(value).success)

export function formatChangeValue(input: ChangeValue): string {
  const value = changeValueSchema.parse(input)
  const text = value.type === "json" ? JSON.stringify(value.value) : String(value.value)
  return value.media_default ? `${text}（媒体默认）` : text
}
