#!/bin/bash
# 下载 shadcn/ui 官方 dashboard 示例组件

BASE="https://raw.githubusercontent.com/shadcn-ui/ui/main/apps/v4/app/(app)/examples/dashboard"

echo "正在下载 shadcn 官方 dashboard 组件..."

# 下载组件
curl -sS "${BASE}/components/app-sidebar.tsx" > app-sidebar-official.tsx
curl -sS "${BASE}/components/chart-area-interactive.tsx" > chart-area-interactive.tsx
curl -sS "${BASE}/components/data-table.tsx" > data-table-official.tsx
curl -sS "${BASE}/components/nav-documents.tsx" > nav-documents-official.tsx
curl -sS "${BASE}/components/nav-main.tsx" > nav-main-official.tsx
curl -sS "${BASE}/components/nav-secondary.tsx" > nav-secondary-official.tsx
curl -sS "${BASE}/components/nav-user.tsx" > nav-user-official.tsx
curl -sS "${BASE}/components/section-cards.tsx" > section-cards.tsx
curl -sS "${BASE}/components/site-header.tsx" > site-header-official.tsx
curl -sS "${BASE}/page.tsx" > page-official.tsx
curl -sS "${BASE}/data.json" > data-official.json

echo "✅ 下载完成"
ls -lh *.tsx *.json | awk '{print $9, $5}'
