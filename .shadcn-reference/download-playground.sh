#!/bin/bash
BASE="https://raw.githubusercontent.com/shadcn-ui/ui/main/apps/v4/app/(app)/examples/playground"

echo "正在下载 playground 示例组件..."
mkdir -p playground

curl -sS "${BASE}/components/code-viewer.tsx" > playground/code-viewer.tsx
curl -sS "${BASE}/components/model-selector.tsx" > playground/model-selector.tsx
curl -sS "${BASE}/components/preset-actions.tsx" > playground/preset-actions.tsx
curl -sS "${BASE}/components/preset-save.tsx" > playground/preset-save.tsx
curl -sS "${BASE}/components/preset-selector.tsx" > playground/preset-selector.tsx
curl -sS "${BASE}/components/temperature-selector.tsx" > playground/temperature-selector.tsx
curl -sS "${BASE}/page.tsx" > playground/page.tsx

echo "✅ playground 组件下载完成"
ls -lh playground/*.tsx | awk '{print $9, $5}'
