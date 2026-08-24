export function retryDelayMs(
  attempt: number,
  baseMs: number,
  maximumMs = 15 * 60_000,
): number {
  const safeAttempt = Math.max(1, attempt);
  return Math.min(baseMs * 2 ** (safeAttempt - 1), maximumMs);
}
