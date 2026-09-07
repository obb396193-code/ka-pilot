import type { Pool } from "pg";
import { z } from "zod";

/** Session advisory lock: retain this dedicated connection until child close. */
export function workerOnceLock(pool: Pool, workspaceId: string) {
  const key = `ka-worker-once:${z.string().uuid().parse(workspaceId)}`;
  return async (controller: AbortController): Promise<(() => Promise<void>) | null> => {
    const client = await pool.connect();
    const lost = (): void => controller.abort();
    client.on("error", lost);
    client.on("end", lost);
    let handedOff = false;
    try {
      const result = await client.query<{ acquired: boolean }>(
        "SELECT pg_try_advisory_lock(hashtextextended($1::text,0)) AS acquired", [key]);
      if (result.rows.length !== 1 || typeof result.rows[0]?.acquired !== "boolean") throw new Error("Worker lock failed");
      if (!result.rows[0].acquired) return null;
      handedOff = true;
      let released = false;
      return async () => {
        if (released) return; released = true;
        try { await client.query("SELECT pg_advisory_unlock(hashtextextended($1::text,0))", [key]); }
        finally { client.removeListener("error", lost); client.removeListener("end", lost); client.release(true); }
      };
    } finally {
      if (!handedOff) { client.removeListener("error", lost); client.removeListener("end", lost); client.release(true); }
    }
  };
}
