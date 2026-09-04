const FILTERED_TASKS_CTE = `
  allowed_scope AS (
    SELECT allowed.media, allowed.account_id
    FROM jsonb_to_recordset($4::jsonb)
      AS allowed(media text, account_id text)
  ),
  filtered_tasks AS (
    SELECT task.*
    FROM tasks AS task
    WHERE task.workspace_id = $1::uuid
      AND (
        $3::text = 'team_workspace_readonly'
        OR EXISTS (
          SELECT 1
          FROM task_accounts AS visible_relation
          JOIN allowed_scope AS allowed
            ON allowed.media = visible_relation.media
           AND allowed.account_id = visible_relation.account_id
          WHERE visible_relation.workspace_id = task.workspace_id
            AND visible_relation.task_id = task.task_id
            AND visible_relation.valid_from <= $2::date
            AND (visible_relation.valid_to IS NULL OR visible_relation.valid_to >= $2::date)
        )
      )
      AND ($5::text IS NULL
        OR strpos(lower(COALESCE(task.task_name, '')), lower($5::text)) > 0
        OR strpos(lower(COALESCE(task.biz_name, '')), lower($5::text)) > 0)
      AND ($6::text IS NULL OR task.status = $6::text)
      AND ($7::uuid IS NULL OR task.owner_user_id = $7::uuid)
      AND ($8::date IS NULL OR task.period_end >= $8::date)
      AND ($9::date IS NULL OR task.period_start <= $9::date)
      AND (
        $10::boolean IS NULL
        OR $10::boolean = EXISTS (
          SELECT 1
          FROM work_items AS filtered_item
          WHERE filtered_item.workspace_id = task.workspace_id
            AND filtered_item.task_id = task.task_id
            AND filtered_item.status IN ('open', 'processing', 'escalated')
            AND filtered_item.media IS NOT NULL
            AND filtered_item.account_id IS NOT NULL
            AND (
              $3::text = 'team_workspace_readonly'
              OR EXISTS (
              SELECT 1 FROM allowed_scope AS allowed
              WHERE allowed.media = filtered_item.media
                AND allowed.account_id = filtered_item.account_id
              )
            )
        )
      )
  )`;

export const TASK_LIST_COUNT_SQL = `
  WITH ${FILTERED_TASKS_CTE}
  /* task-list-total */
  SELECT
    count(*) AS total,
    $3::text = 'team_workspace_readonly' OR NOT EXISTS (
      SELECT 1
      FROM filtered_tasks AS task
      JOIN task_accounts AS relation
        ON relation.workspace_id = task.workspace_id
       AND relation.task_id = task.task_id
       AND relation.valid_from <= $2::date
       AND (relation.valid_to IS NULL OR relation.valid_to >= $2::date)
      WHERE NOT EXISTS (
        SELECT 1 FROM allowed_scope AS allowed
        WHERE allowed.media = relation.media
          AND allowed.account_id = relation.account_id
      )
    ) AS coverage_complete
  FROM filtered_tasks`;

export const TASK_LIST_PAGE_SQL = `
  WITH ${FILTERED_TASKS_CTE}
  SELECT
    task.workspace_id,
    task.task_id,
    task.task_name,
    task.biz_name,
    task.status,
    to_char(task.period_start, 'YYYY-MM-DD') AS period_start,
    to_char(task.period_end, 'YYYY-MM-DD') AS period_end,
    task.target_volume,
    task.budget,
    task.owner_user_id,
    owner.name AS owner_display_name,
    assessment.price AS assessment_price,
    assessment.effective_date AS assessment_effective_date,
    COALESCE(linked.authorized_count, 0) AS linked_account_count,
    COALESCE(linked.total_count, 0) AS total_linked_account_count,
    metric.completed_volume,
    metric.spent,
    COALESCE(metric.recent_daily_volumes, '[]'::jsonb) AS recent_daily_volumes,
    metric.latest_metric_date,
    metric.data_as_of,
    COALESCE(items.open_count, 0) AS work_item_open_count,
    COALESCE(items.p0, 0) AS work_item_p0,
    COALESCE(items.p1, 0) AS work_item_p1,
    COALESCE(items.p2, 0) AS work_item_p2,
    COALESCE(items.opportunity, 0) AS work_item_opportunity
  FROM filtered_tasks AS task
  LEFT JOIN users AS owner
    ON owner.workspace_id = task.workspace_id
   AND owner.id = task.owner_user_id
  LEFT JOIN LATERAL (
    SELECT history.price,
           to_char(history.effective_date, 'YYYY-MM-DD') AS effective_date
    FROM assessment_price_history AS history
    WHERE history.workspace_id = task.workspace_id
      AND history.task_id = task.task_id
      AND history.effective_date <= $2::date
    ORDER BY history.effective_date DESC, history.id DESC
    LIMIT 1
  ) AS assessment ON true
  LEFT JOIN LATERAL (
    SELECT
      count(DISTINCT (relation.media, relation.account_id)) AS total_count,
      count(DISTINCT (relation.media, relation.account_id)) FILTER (WHERE
        $3::text = 'team_workspace_readonly'
        OR EXISTS (
          SELECT 1 FROM allowed_scope AS allowed
          WHERE allowed.media = relation.media
            AND allowed.account_id = relation.account_id
        )
      ) AS authorized_count
    FROM task_accounts AS relation
    WHERE relation.workspace_id = task.workspace_id
      AND relation.task_id = task.task_id
      AND relation.valid_from <= $2::date
      AND (relation.valid_to IS NULL OR relation.valid_to >= $2::date)
  ) AS linked ON true
  LEFT JOIN LATERAL (
    SELECT
      sum(daily.real_conversion) AS completed_volume,
      sum(daily.cost) AS spent,
      jsonb_agg(daily.real_conversion ORDER BY daily.ds)
        FILTER (
          WHERE daily.ds >= $2::date - 6
            AND daily.real_conversion IS NOT NULL
        ) AS recent_daily_volumes,
      to_char(max(daily.ds), 'YYYY-MM-DD') AS latest_metric_date,
      max(daily.computed_at) AS data_as_of
    FROM (
      SELECT
        metric.ds,
        sum(metric.real_conversion) AS real_conversion,
        sum(metric.cost) AS cost,
        max(metric.computed_at) AS computed_at
      FROM account_metrics_daily AS metric
      WHERE metric.workspace_id = task.workspace_id
        AND task.period_start IS NOT NULL
        AND task.period_end IS NOT NULL
        AND metric.ds BETWEEN task.period_start AND LEAST(task.period_end, $2::date)
        AND (
          $3::text = 'team_workspace_readonly'
          OR EXISTS (
            SELECT 1 FROM allowed_scope AS allowed
            WHERE allowed.media = metric.media
              AND allowed.account_id = metric.account_id
          )
        )
        AND EXISTS (
          SELECT 1
          FROM task_accounts AS effective_relation
          WHERE effective_relation.workspace_id = metric.workspace_id
            AND effective_relation.task_id = task.task_id
            AND effective_relation.media = metric.media
            AND effective_relation.account_id = metric.account_id
            AND effective_relation.valid_from <= metric.ds
            AND (
              effective_relation.valid_to IS NULL
              OR effective_relation.valid_to >= metric.ds
            )
        )
      GROUP BY metric.ds
    ) AS daily
  ) AS metric ON true
  LEFT JOIN LATERAL (
    SELECT
      count(*) AS open_count,
      count(*) FILTER (WHERE item.severity = 'P0') AS p0,
      count(*) FILTER (WHERE item.severity = 'P1') AS p1,
      count(*) FILTER (WHERE item.severity = 'P2') AS p2,
      count(*) FILTER (WHERE item.severity = 'opportunity') AS opportunity
    FROM work_items AS item
    WHERE item.workspace_id = task.workspace_id
      AND item.task_id = task.task_id
      AND item.status IN ('open', 'processing', 'escalated')
      AND item.media IS NOT NULL
      AND item.account_id IS NOT NULL
      AND (
        $3::text = 'team_workspace_readonly'
        OR EXISTS (
          SELECT 1 FROM allowed_scope AS allowed
          WHERE allowed.media = item.media
            AND allowed.account_id = item.account_id
        )
      )
  ) AS items ON true
  ORDER BY
    CASE task.status WHEN 'active' THEN 0 WHEN 'preparing' THEN 1 WHEN 'ended' THEN 2 ELSE 3 END,
    task.period_end ASC NULLS LAST,
    task.task_id ASC
  LIMIT $11 OFFSET $12`;
