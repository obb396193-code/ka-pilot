import { ACTIVE_WORK_ITEM_STATUSES } from "@ka/domain";
import { accountScopeClause, workItemScopeClause } from "./r014/workspace-authority.js";

// Only frozen code constants become SQL literals; all request values remain parameters.
const activeStates = ACTIVE_WORK_ITEM_STATUSES.map(status => `'${status}'`).join(", ");
const FILTERED_WORK_ITEMS_CTE = `
  filtered_work_items AS (
    SELECT item.*
    FROM work_items AS item
    WHERE item.workspace_id = $1::uuid
      AND (item.media IS NULL) = (item.account_id IS NULL)
      AND ${workItemScopeClause("$3", "$4", "item", "$2")}
      AND ($5::text IS NULL OR strpos(lower(item.title), lower($5::text)) > 0)
      AND (
        ($6::text IS NULL AND item.status IN (${activeStates}))
        OR item.status = $6::text
      )
      AND ($7::text IS NULL OR item.severity = $7::text)
      AND ($8::text IS NULL OR item.type = $8::text)
      AND ($9::uuid IS NULL OR item.assignee = $9::uuid)
      AND ($10::text IS NULL OR item.task_id = $10::text)
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
    task_scope.media AS task_scope_media,
    task_scope.account_id AS task_scope_account_id,
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
  -- Internal proof for the output scope guard, not a public account relation.
  LEFT JOIN LATERAL (
    SELECT link.media, link.account_id
    FROM task_accounts AS link
    WHERE $3::text = 'explicit_accounts'
      AND item.account_id IS NULL AND item.task_id IS NOT NULL
      AND link.workspace_id = item.workspace_id AND link.task_id = item.task_id
      AND ${accountScopeClause("$3", "$4", "link.media", "link.account_id")}
    ORDER BY link.media COLLATE "C", link.account_id COLLATE "C"
    LIMIT 1
  ) AS task_scope ON true
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
  LIMIT $11 OFFSET $12`;
