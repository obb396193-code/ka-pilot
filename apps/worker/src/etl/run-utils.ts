export function errorSummary(error: unknown): string {
  const message = error instanceof Error ? error.message : "Unknown ETL error";
  return message.slice(0, 2_000);
}
