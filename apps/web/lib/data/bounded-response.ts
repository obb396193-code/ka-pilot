export const MAX_UPSTREAM_BODY_BYTES = 16 * 1024 * 1024

export async function readBoundedResponseBody(upstream: Response): Promise<Uint8Array | null> {
  const contentLength = Number(upstream.headers.get("content-length") ?? "0")
  if (Number.isFinite(contentLength) && contentLength >= MAX_UPSTREAM_BODY_BYTES) return null
  if (upstream.body === null) return new Uint8Array()

  const reader = upstream.body.getReader()
  const chunks: Uint8Array[] = []
  let total = 0
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    total += value.byteLength
    if (total >= MAX_UPSTREAM_BODY_BYTES) {
      await reader.cancel()
      return null
    }
    chunks.push(value)
  }

  const bytes = new Uint8Array(total)
  let offset = 0
  for (const chunk of chunks) {
    bytes.set(chunk, offset)
    offset += chunk.byteLength
  }
  return bytes
}
