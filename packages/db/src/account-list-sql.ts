const FILTERED_ACCOUNTS_CTE = `
  allowed_scope AS (
    SELECT allowed.media, allowed.account_id
    FROM jsonb_to_recordset($3::jsonb)
      AS allowed(media text, account_id text)
    WHERE allowed.media = $5::text
  ),
  filtered_accounts AS (
    SELECT account.*
    FROM accounts AS account
    JOIN allowed_scope AS allowed
      ON allowed.media = account.media
     AND allowed.account_id = account.account_id
    WHERE account.workspace_id = $1::uuid
      AND account.media = $5::text
      AND ($4::text IS NULL
        OR strpos(lower(COALESCE(account.account_name, '')), lower($4::text)) > 0
        OR strpos(lower(account.account_id), lower($4::text)) > 0)
      AND ($6::text IS NULL OR account.lifecycle_stage = $6::text)
      AND ($7::boolean IS NULL OR COALESCE(account.is_starred, false) = $7::boolean)
      AND ($8::text[] IS NULL OR COALESCE(account.tags, ARRAY[]::text[]) @> $8::text[])
      AND ($9::uuid IS NULL OR account.owner_user_id = $9::uuid)
      AND ($10::text IS NULL OR account.status = $10::text)
  )`;

export const ACCOUNT_LIST_COUNT_SQL = `
  WITH ${FILTERED_ACCOUNTS_CTE}
  /* account-list-total */
  SELECT
    count(*) AS total,
    EXISTS (SELECT 1 FROM allowed_scope)
      AND NOT EXISTS (
        SELECT 1
        FROM allowed_scope AS allowed
        WHERE NOT EXISTS (
          SELECT 1
          FROM accounts AS account
          WHERE account.workspace_id = $1::uuid
            AND account.media = allowed.media
            AND account.account_id = allowed.account_id
        )
      ) AS coverage_complete,
    NOT EXISTS (
      SELECT 1
      FROM filtered_accounts AS account
      WHERE NOT EXISTS (
        SELECT 1
        FROM account_metrics_daily AS metric
        WHERE metric.workspace_id = account.workspace_id
          AND metric.media = account.media
          AND metric.account_id = account.account_id
          AND metric.ds = $2::date
      )
    ) AS metrics_complete
  FROM filtered_accounts`;

export const ACCOUNT_LIST_PAGE_SQL = `
  WITH ${FILTERED_ACCOUNTS_CTE}
  SELECT
    account.workspace_id,
    account.media,
    account.account_id,
    account.account_name,
    account.status,
    account.lifecycle_stage,
    COALESCE(account.is_starred, false) AS is_starred,
    COALESCE(account.tags, ARRAY[]::text[]) AS tags,
    account.owner_user_id,
    owner.name AS owner_display_name,
    COALESCE(linked.tasks, '[]'::jsonb) AS linked_tasks,
    to_char(metric.ds, 'YYYY-MM-DD') AS metric_date,
    metric.cost,
    metric.real_conversion,
    metric.assessment_price_snapshot,
    metric.computed_at AS data_as_of,
    balance.balance,
    balance.synced_at AS balance_synced_at
  FROM filtered_accounts AS account
  LEFT JOIN users AS owner
    ON owner.workspace_id = account.workspace_id
   AND owner.id = account.owner_user_id
  LEFT JOIN LATERAL (
    SELECT jsonb_agg(
      jsonb_build_object('taskId', relation.task_id, 'taskName', relation.task_name)
      ORDER BY relation.task_id
    ) AS tasks
    FROM (
      SELECT DISTINCT task.task_id, task.task_name
      FROM task_accounts AS account_task
      JOIN tasks AS task
        ON task.workspace_id = account_task.workspace_id
       AND task.task_id = account_task.task_id
      WHERE account_task.workspace_id = account.workspace_id
        AND account_task.media = account.media
        AND account_task.account_id = account.account_id
        AND account_task.valid_from <= $2::date
        AND (account_task.valid_to IS NULL OR account_task.valid_to >= $2::date)
    ) AS relation
  ) AS linked ON true
  LEFT JOIN account_metrics_daily AS metric
    ON metric.workspace_id = account.workspace_id
   AND metric.media = account.media
   AND metric.account_id = account.account_id
   AND metric.ds = $2::date
  LEFT JOIN account_balance AS balance
    ON balance.workspace_id = account.workspace_id
   AND balance.media = account.media
   AND balance.account_id = account.account_id
  ORDER BY
    COALESCE(account.is_starred, false) DESC,
    CASE account.lifecycle_stage
      WHEN 'declining' THEN 0
      WHEN 'cold_start' THEN 1
      WHEN 'ramping' THEN 2
      WHEN 'stable' THEN 3
      WHEN 'paused' THEN 4
      WHEN 'closed' THEN 5
      WHEN 'unknown' THEN 6
      ELSE 7
    END,
    account.account_name ASC NULLS LAST,
    account.media ASC,
    account.account_id ASC
  LIMIT $11 OFFSET $12`;
