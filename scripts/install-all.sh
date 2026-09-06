#!/usr/bin/env bash
set -euo pipefail

if [[ "$#" -ne 0 ]]; then
  printf '%s\n' 'install-all does not accept arguments' >&2
  exit 64
fi

repository_root="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd -P)"
package_paths=(packages/domain packages/db apps/worker apps/web apps/dingtalk-gateway)

# Fail before any npm ci replaces dependencies if the deployment archive is incomplete.
for package_path in "${package_paths[@]}"; do
  for manifest in package.json package-lock.json; do
    if [[ ! -f "$repository_root/$package_path/$manifest" ]]; then
      printf 'Missing installation manifest: %s/%s\n' "$package_path" "$manifest" >&2
      exit 65
    fi
  done
done

# Runtime uses tsx and source TypeScript file: dependencies. Production builds must
# install these too; NODE_ENV=production must not silently omit the required tooling.
for package_path in "${package_paths[@]}"; do
  printf 'Installing locked package: %s\n' "$package_path"
  npm ci --include=dev --no-audit --no-fund --prefix "$repository_root/$package_path"
done
