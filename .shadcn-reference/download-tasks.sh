#!/bin/bash
BASE="https://raw.githubusercontent.com/shadcn-ui/ui/main/apps/v4/app/(app)/examples/tasks"

echo "正在下载 tasks 示例组件..."
mkdir -p tasks

curl -sS "${BASE}/components/columns.tsx" > tasks/columns.tsx
curl -sS "${BASE}/components/data-table-column-header.tsx" > tasks/data-table-column-header.tsx
curl -sS "${BASE}/components/data-table-faceted-filter.tsx" > tasks/data-table-faceted-filter.tsx
curl -sS "${BASE}/components/data-table-pagination.tsx" > tasks/data-table-pagination.tsx
curl -sS "${BASE}/components/data-table-row-actions.tsx" > tasks/data-table-row-actions.tsx
curl -sS "${BASE}/components/data-table-toolbar.tsx" > tasks/data-table-toolbar.tsx
curl -sS "${BASE}/components/data-table-view-options.tsx" > tasks/data-table-view-options.tsx
curl -sS "${BASE}/components/data-table.tsx" > tasks/data-table.tsx
curl -sS "${BASE}/page.tsx" > tasks/page.tsx
curl -sS "${BASE}/data/schema.ts" > tasks/schema.ts
curl -sS "${BASE}/data/seed.ts" > tasks/seed.ts

echo "✅ tasks 组件下载完成"
ls -lh tasks/*.tsx tasks/*.ts | awk '{print $9, $5}'
