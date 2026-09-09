const FILTERED_ACCOUNTS_CTE = `
  allowed_scope AS (
    SELECT allowed.media, allowed.account_id
    FROM jsonb_to_recordset($4::jsonb)
      AS allowed(media text, account_id text)
    WHERE allowed.media = $6::text
  ),
  filtered_accounts AS (
    SELECT account.*
    FROM accounts AS account
    WHERE account.workspace_id = $1::uuid
      AND account.media = $6::text
      AND (
        $3::text = 'team_workspace_readonly'
        OR EXISTS (
          SELECT 1 FROM allowed_scope AS allowed
          WHERE allowed.media = account.media
            AND allowed.account_id = account.account_id
        )
      )
      AND ($5::text IS NULL
        OR strpos(lower(COALESCE(account.account_name, '')), lower($5::text)) > 0
        OR strpos(lower(account.account_id), lower($5::text)) > 0)
      AND ($7::text IS NULL OR account.lifecycle_stage = $7::text)
      AND ($8::boolean IS NULL OR COALESCE(account.is_starred, false) = $8::boolean)
      AND ($9::text[] IS NULL OR COALESCE(account.tags, ARRAY[]::text[]) @> $9::text[])
      AND ($10::uuid IS NULL OR account.owner_user_id = $10::uuid)
      AND ($11::text IS NULL OR account.status = $11::text)
      AND ($12::text[] IS NULL OR account.pool_status = ANY($12::text[]))
      AND ($13::text IS NULL OR account.product_name = $13::text)
  )`;

export const ACCOUNT_LIST_COUNT_SQL = `
  WITH ${FILTERED_ACCOUNTS_CTE}
  /* account-list-total */
  SELECT
    count(*) AS total,
    ($3::text = 'team_workspace_readonly' OR EXISTS (SELECT 1 FROM allowed_scope))
      AND ($3::text = 'team_workspace_readonly' OR NOT EXISTS (
        SELECT 1
        FROM allowed_scope AS allowed
        WHERE NOT EXISTS (
          SELECT 1
          FROM accounts AS account
          WHERE account.workspace_id = $1::uuid
            AND account.media = allowed.media
            AND account.account_id = allowed.account_id
        )
      )) AS coverage_complete,
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
          AND metric.computed_at IS NOT NULL
      )
    ) AS metrics_complete
  FROM filtered_accounts`;

export const ACCOUNT_LIST_PAGE_SQL = `
  WITH ${FILTERED_ACCOUNTS_CTE}
  /* account-list-page */
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
    balance.synced_at AS balance_synced_at,
    account.pool_status,
    account.pool_status_source,
    account.product_name,
    account.product_ref,
    last_action.at AS last_action_at,
    last_action.kind AS last_action_kind,
    last_action.summary AS last_action_summary,
    suggestion.id AS next_suggestion_id,
    suggestion.title AS next_suggestion_title
  FROM filtered_accounts AS account
  LEFT JOIN users AS owner
    ON owner.workspace_id = account.workspace_id
   AND owner.id = account.owner_user_id
  LEFT JOIN LATERAL (
    SELECT jsonb_agg(
      jsonb_build_object('taskId', relation.task_id, 'taskName', relation.task_name)
      ORDER BY relation.task_id COLLATE "C"
    ) AS tasks
    FROM (
      SELECT DISTINCT account_task.task_id, task.task_name
      FROM task_accounts AS account_task
      LEFT JOIN tasks AS task
        ON task.workspace_id = account_task.workspace_id
       AND task.task_id = account_task.task_id
      WHERE account_task.workspace_id = account.workspace_id
        AND account_task.media = account.media
        AND account_task.account_id = account.account_id
        AND account_task.valid_from <= $2::date
        AND (account_task.valid_to IS NULL OR account_task.valid_to >= $2::date)
    ) AS relation
  ) AS linked ON true
  LEFT JOIN LATERAL (
    -- 最近一次动作：本系统变更集 / 带外变更 / 人工置态，三者取最新的一条。
    -- 只报观测得到的事实，取不到就没有 lastAction，不拿创建时间之类的东西凑。
    SELECT action.at, action.kind, action.summary
    FROM (
      SELECT changeset.created_at AS at, 'changeset'::text AS kind,
             COALESCE(NULLIF(changeset.title, ''), '变更集') AS summary
      FROM changesets AS changeset
      WHERE changeset.workspace_id = account.workspace_id
        AND changeset.media = account.media
        AND changeset.account_id = account.account_id
      UNION ALL
      SELECT external.detected_at AS at, 'external_change'::text AS kind,
             external.target_type || ' ' || external.field AS summary
      FROM external_changes AS external
      WHERE external.workspace_id = account.workspace_id
        AND external.media = account.media
        AND external.account_id = account.account_id
      UNION ALL
      SELECT account.pool_status_changed_at AS at, 'pool_status'::text AS kind,
             account.pool_status AS summary
      WHERE account.pool_status_changed_at IS NOT NULL
        AND account.pool_status_source = 'manual'
    ) AS action
    WHERE action.at IS NOT NULL
    ORDER BY action.at DESC
    LIMIT 1
  ) AS last_action ON true
  LEFT JOIN LATERAL (
    -- 下一步建议只能来自真实的 open 工作项；没有就是没有，绝不生成假建议（v1.5.1 ①）。
    SELECT item.id, item.title
    FROM work_items AS item
    WHERE item.workspace_id = account.workspace_id
      AND item.media = account.media
      AND item.account_id = account.account_id
      AND item.status = 'open'
      AND item.title IS NOT NULL
    ORDER BY item.created_at DESC
    LIMIT 1
  ) AS suggestion ON true
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
  LIMIT $14 OFFSET $15`;
