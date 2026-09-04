import type { SourceQueryResult } from "@ka/domain";

import { KaDataClientError } from "./ka-data-client.js";

/**
 * Explicit diagnostic adapter for deployments that do not enable KA Data.
 * It never fabricates rows or lineage and cannot be switched on by a request.
 */
export class DisabledKaDataSource {
  async query(): Promise<SourceQueryResult> {
    throw new KaDataClientError(
      "SOURCE_UNAVAILABLE",
      "KA Data is disabled by server configuration",
      false,
    );
  }
}
