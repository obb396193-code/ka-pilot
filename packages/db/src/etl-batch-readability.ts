/** A partial cumulative account sample is not a daily canonical input.
 * JSONB equality avoids unsafe casts of malformed historical request params.
 */
export function accountRealtimeDaySampleSql(alias: string): string {
  if (!/^[a-z][a-z0-9_]*$/.test(alias)) throw new Error("Invalid readability alias");
  return `(${alias}.resource <> 'account_realtime'
    OR NOT (${alias}.request_params ? 'hh')
    OR ${alias}.request_params->'hh' IN ('24'::jsonb, '"24"'::jsonb))`;
}

/** Code-owned SQL identifiers only, never interpolate request values here.
 * A failure masks the whole tuple-day, without deleting its historical samples.
 * Canonical may recover only after a matching successful sample AND recomputation.
 * Call on a daily LEFT JOIN's ON, not its WHERE: expected missing days must survive.
 */
export function etlBatchReadableSql(alias: string, kind: "canonical" | "raw" = "canonical"): string {
  if (!/^[a-z][a-z0-9_]*$/.test(alias)) throw new Error("Invalid readability alias");
  return `NOT EXISTS (
    SELECT 1 FROM etl_runs AS failed_run
    CROSS JOIN LATERAL jsonb_array_elements(COALESCE(failed_run.scope->'batchFailures','[]'::jsonb)) AS failure(value)
    WHERE failed_run.workspace_id=${alias}.workspace_id
      AND failure.value->>'media'=${alias}.media
      AND (failure.value->'accountIds') ? ${alias}.account_id
      AND (failure.value->>'ds')::date=${alias}.ds
      AND NOT EXISTS (
        SELECT 1 FROM metrics_raw AS recovery
        WHERE recovery.workspace_id=${alias}.workspace_id AND recovery.media=${alias}.media
          AND recovery.account_id=${alias}.account_id AND recovery.ds=${alias}.ds
          AND recovery.resource=failure.value->>'resource'
          AND ${accountRealtimeDaySampleSql("recovery")}
          AND recovery.fetched_at > (failure.value->>'failedAt')::timestamptz
          ${kind === "canonical" ? `AND recovery.fetched_at <= ${alias}.computed_at` : ""}
          AND (recovery.resource <> 'ad_realtime' OR (
            (NOT (recovery.request_params ? 'hh') OR (
              jsonb_typeof(recovery.request_params->'hh') IN ('number','string')
              AND (recovery.request_params->>'hh') ~ '^([0-9]|1[0-9]|2[0-4])$'
            ))
            AND (NOT (recovery.request_params ? 'adIds') OR jsonb_typeof(recovery.request_params->'adIds')='array')
            AND
            COALESCE((recovery.request_params->>'hh')::integer,24) >= COALESCE((failure.value#>>'{filters,hh}')::integer,24)
            AND (COALESCE(recovery.request_params->'adIds','[]'::jsonb)='[]'::jsonb OR (
              COALESCE(failure.value#>'{filters,adIds}','[]'::jsonb)<>'[]'::jsonb
              AND (recovery.request_params->'adIds') @> (failure.value#>'{filters,adIds}')
            ))
          ))
      )
  )`;
}
