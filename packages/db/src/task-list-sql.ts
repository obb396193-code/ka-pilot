import { etlBatchReadableSql } from "./etl-batch-readability.js";
import { ACTIVE_WORK_ITEM_STATUSES } from "@ka/domain";
import { accountScopeClause } from "./r014/workspace-authority.js";

// P-123 转 be2：活动态集合以 domain 的冻结常量为准（v1.7.5 P-083 把 dispatched 并入活动态）。
// Only frozen code constants become SQL literals; all request values remain parameters.
const activeStates = ACTIVE_WORK_ITEM_STATUSES.map((status) => `'${status}'`).join(", ");

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
            AND filtered_item.status IN (${activeStates})
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
  /* task-list-page */
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
    COALESCE(items.opportunity, 0) AS work_item_opportunity,
    task.stage,
    task.stage_source,
    task.stage_changed_at,
    task.sop_run_id,
    COALESCE(readiness.account_count, 0) AS readiness_account_count,
    COALESCE(readiness.recharged_count, 0) AS readiness_recharged_count,
    COALESCE(readiness.built_count, 0) AS readiness_built_count,
    COALESCE(readiness.unfunded, ARRAY[]::text[]) AS readiness_unfunded,
    COALESCE(readiness.unbuilt, ARRAY[]::text[]) AS readiness_unbuilt,
    COALESCE(overrides.entries, '[]'::jsonb) AS readiness_overrides
  FROM filtered_tasks AS task
  LEFT JOIN users AS owner
    ON owner.workspace_id = task.workspace_id
   AND owner.id = task.owner_user_id
  LEFT JOIN LATERAL (
    -- 就绪度里系统能推的三段（accounts / recharge / infra）的原始事实。
    -- 商品 / 素材 / 策略没有任何数据源，一律不在这里编，交给 domain 报 undefined。
    SELECT
      count(*)::int AS account_count,
      count(*) FILTER (WHERE COALESCE(balance.balance, 0) > 0)::int AS recharged_count,
      count(*) FILTER (WHERE unit.account_id IS NOT NULL)::int AS built_count,
      array_remove(array_agg(link.account_id ORDER BY link.account_id)
        FILTER (WHERE COALESCE(balance.balance, 0) <= 0), NULL) AS unfunded,
      array_remove(array_agg(link.account_id ORDER BY link.account_id)
        FILTER (WHERE unit.account_id IS NULL), NULL) AS unbuilt
    FROM (
      SELECT DISTINCT account_task.media, account_task.account_id
      FROM task_accounts AS account_task
      WHERE account_task.workspace_id = task.workspace_id
        AND account_task.task_id = task.task_id
        AND account_task.valid_from <= $2::date
        AND (account_task.valid_to IS NULL OR account_task.valid_to >= $2::date)
        AND ${accountScopeClause("$3", "$4", "account_task.media", "account_task.account_id")}
    ) AS link
    LEFT JOIN account_balance AS balance
      ON balance.workspace_id = task.workspace_id
     AND balance.media = link.media
     AND balance.account_id = link.account_id
    LEFT JOIN LATERAL (
      SELECT entity.account_id
      FROM ad_entities AS entity
      WHERE entity.workspace_id = task.workspace_id
        AND entity.media = link.media
        AND entity.account_id = link.account_id
        AND entity.entity_type = 'unit'
      LIMIT 1
    ) AS unit ON true
  ) AS readiness ON true
  LEFT JOIN LATERAL (
    SELECT jsonb_agg(jsonb_build_object('dimension', override.dimension, 'ready', override.ready)
      ORDER BY override.dimension) AS entries
    FROM task_readiness_overrides AS override
    WHERE override.workspace_id = task.workspace_id
      AND override.task_id = task.task_id
  ) AS overrides ON true
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
        -- Q-037：失败批次的旧 cost 不该进 spent / 达成量，否则任务看着「花了钱」。
        AND ${etlBatchReadableSql("metric")}
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
      AND item.status IN (${activeStates})
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
