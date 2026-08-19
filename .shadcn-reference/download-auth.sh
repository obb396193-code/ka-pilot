#!/bin/bash
BASE="https://raw.githubusercontent.com/shadcn-ui/ui/main/apps/v4/app/(app)/examples/authentication"

echo "正在下载 authentication 示例组件..."
mkdir -p authentication

curl -sS "${BASE}/components/user-auth-form.tsx" > authentication/user-auth-form.tsx
curl -sS "${BASE}/page.tsx" > authentication/page.tsx

echo "✅ authentication 组件下载完成"
ls -lh authentication/*.tsx | awk '{print $9, $5}'
