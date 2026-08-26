const FILTERED_WORK_ITEMS_CTE = `
  allowed_scope AS (
    SELECT allowed.media, allowed.account_id
    FROM jsonb_to_recordset($3::jsonb)
      AS allowed(media text, account_id text)
  ),
  filtered_work_items AS (
    SELECT item.*
    FROM work_items AS item
    WHERE item.workspace_id = $1::uuid
      AND (
        (item.media IS NOT NULL AND item.account_id IS NOT NULL AND EXISTS (
          SELECT 1 FROM allowed_scope AS allowed
          WHERE allowed.media = item.media AND allowed.account_id = item.account_id
        ))
        OR
        (item.media IS NULL AND item.account_id IS NULL
          AND (item.assignee = $2::uuid OR item.creator = $2::uuid))
      )
      AND ($4::text IS NULL OR strpos(lower(item.title), lower($4::text)) > 0)
      AND (
        ($5::text IS NULL AND item.status IN ('open', 'processing', 'escalated'))
        OR item.status = $5::text
      )
      AND ($6::text IS NULL OR item.severity = $6::text)
      AND ($7::text IS NULL OR item.type = $7::text)
      AND ($8::uuid IS NULL OR item.assignee = $8::uuid)
      AND ($9::text IS NULL OR item.task_id = $9::text)
  )`;

export const WORK_ITEM_LIST_COUNT_SQL = `
  WITH ${FILTERED_WORK_ITEMS_CTE}
  /* work-item-list-total */
  SELECT
    count(*) AS total,
    count(*) FILTER (WHERE media IS NOT NULL AND account_id IS NOT NULL) AS account_item_count,
    max(GREATEST(created_at, COALESCE(resolved_at, created_at))) AS data_as_of,
    true AS coverage_complete
  FROM filtered_work_items`;

export const WORK_ITEM_LIST_PAGE_SQL = `
  WITH ${FILTERED_WORK_ITEMS_CTE}
  SELECT
    item.id,
    item.workspace_id,
    item.type,
    item.status,
    item.severity,
    item.title,
    item.media,
    item.account_id,
    account.account_name,
    item.task_id,
    task.task_name,
    item.assignee,
    assignee.name AS assignee_display_name,
    item.creator,
    item.sla_due,
    item.created_at,
    item.resolved_at
  FROM filtered_work_items AS item
  LEFT JOIN accounts AS account
    ON account.workspace_id = item.workspace_id
   AND account.media = item.media
   AND account.account_id = item.account_id
  LEFT JOIN tasks AS task
    ON task.workspace_id = item.workspace_id
   AND task.task_id = item.task_id
  LEFT JOIN users AS assignee
    ON assignee.workspace_id = item.workspace_id
   AND assignee.id = item.assignee
  ORDER BY
    CASE item.severity
      WHEN 'P0' THEN 0 WHEN 'P1' THEN 1 WHEN 'P2' THEN 2 WHEN 'opportunity' THEN 3 ELSE 4
    END,
    item.sla_due ASC NULLS LAST,
    item.created_at ASC,
    item.id ASC
  LIMIT $10 OFFSET $11`;
