import { createHash } from 'node:crypto';
import {
  cpSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { basename, dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const canonicalRoot = join(repoRoot, 'docs/frontend/ui-assets');

const args = process.argv.slice(2);
const outputIndex = args.indexOf('--output');
const output = resolve(
  outputIndex >= 0 && args[outputIndex + 1]
    ? args[outputIndex + 1]
    : join(repoRoot, 'output/frontend-ui-asset-kit'),
);

if (basename(output) !== 'frontend-ui-asset-kit' || output === repoRoot || output === '/') {
  throw new Error(`Refusing unsafe output path: ${output}`);
}

const SAFE_SOURCE_LICENSES = new Map([
  ['ai-elements', new Set(['Apache-2.0'])],
  ['coss', new Set(['MIT when sourced from coss apps/ui; verify file path'])],
  ['coss-origin', new Set(['MIT for coss apps/origin'])],
  ['dice-ui', new Set(['MIT'])],
  ['kibo-ui', new Set(['MIT'])],
  ['magic-ui', new Set(['MIT'])],
  ['motion-primitives', new Set(['MIT'])],
  ['reui', new Set(['MIT'])],
  ['shadcn', new Set(['MIT'])],
  ['tremor', new Set(['MIT'])],
  ['tremor-legacy', new Set(['Apache-2.0'])],
  ['tweakcn', new Set(['Apache-2.0'])],
]);

const EXCLUDED_SOURCE_REASONS = {
  aceternity: 'Free item 仍需逐项核验条款与第三方素材，不导出源码。',
  'animate-ui': 'MIT + Commons Clause；不发布可复用组件库镜像。',
  'magic-ui-pro': '公开样例的具体复用许可证仍需逐仓核验。',
  'react-bits': 'MIT + Commons Clause；不发布可复用组件库镜像，Pro 另受付费许可。',
};

const COPY_DIRECTORIES = ['catalogs', 'guides', 'decisions', 'reviews', 'screenshots'];
const COPY_FILES = [
  'agent-workflow.md',
  'capabilities.json',
  'catalog.schema.json',
  'changelog-watch.md',
  'comparison-template.md',
  'coverage-audit.json',
  'coverage-audit.md',
  'discovery.json',
  'discovery.md',
  'free-alternatives.json',
  'free-alternatives.md',
  'frontend-product-standard.md',
  '前端视觉与体验审核清单.md',
  'licenses.md',
  'showroom-data.json',
  'source-download-manifest.json',
  'source-download-status.md',
  'source-health.json',
  'sources.md',
  'starter-pack.json',
  'storage-format.md',
  'visual-guide.md',
];

function ensureParent(file) {
  mkdirSync(dirname(file), { recursive: true });
}

function sanitizeText(content) {
  return content
    .replaceAll('/Users/aik/Desktop/投放agent', '$PROJECT_ROOT')
    .replaceAll('/Users/aik/Documents/Obsidian Vault', '$OBSIDIAN_VAULT')
    .replaceAll('/Users/aik/', '$HOME/');
}

function shouldSanitize(file) {
  return /\.(md|json|html|js|css|ts|tsx|txt)$/i.test(file);
}

function copyFile(source, target) {
  ensureParent(target);
  if (shouldSanitize(source)) {
    writeFileSync(target, sanitizeText(readFileSync(source, 'utf8')));
  } else {
    cpSync(source, target);
  }
}

function copyTree(source, target) {
  for (const entry of readdirSync(source, { withFileTypes: true })) {
    const from = join(source, entry.name);
    const to = join(target, entry.name);
    if (entry.isDirectory()) copyTree(from, to);
    else copyFile(from, to);
  }
}

function walk(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = join(dir, entry.name);
    return entry.isDirectory() ? walk(full) : [full];
  });
}

function sha256(file) {
  return createHash('sha256').update(readFileSync(file)).digest('hex');
}

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function isSafeEntry(entry) {
  return SAFE_SOURCE_LICENSES.get(entry.source)?.has(entry.license) === true;
}

function writeJson(file, value) {
  ensureParent(file);
  writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`);
}

function buildSourceCache(targetRoot) {
  const sourceRoot = join(canonicalRoot, 'source-cache');
  const original = JSON.parse(readFileSync(join(sourceRoot, 'manifest.json'), 'utf8'));
  const entries = original.entries.filter(isSafeEntry);

  for (const entry of entries) {
    const sourcePath = join(sourceRoot, entry.local_path);
    const targetPath = join(targetRoot, entry.local_path);
    if (statSync(sourcePath).isDirectory()) copyTree(sourcePath, targetPath);
    else copyFile(sourcePath, targetPath);
  }
  copyFile(join(sourceRoot, 'README.md'), join(targetRoot, 'README.md'));

  const bySource = {};
  for (const entry of entries) {
    bySource[entry.source] ??= { entries: 0, roots: 0, dependencies: 0, files: 0 };
    bySource[entry.source].entries += 1;
    bySource[entry.source].roots += entry.root_or_dependency === 'root' ? 1 : 0;
    bySource[entry.source].dependencies += entry.root_or_dependency === 'dependency' ? 1 : 0;
    bySource[entry.source].files += entry.files_in_payload || entry.cached_files?.length || 1;
  }

  const manifest = {
    ...original,
    generated_at: new Date().toISOString(),
    strategy: 'redistribution-safe-private-reuse-export',
    root_asset_count: entries.filter((entry) => entry.root_or_dependency === 'root').length,
    cached_entry_count: entries.length,
    cached_root_count: entries.filter((entry) => entry.root_or_dependency === 'root').length,
    cached_dependency_count: entries.filter((entry) => entry.root_or_dependency === 'dependency').length,
    cached_file_count: entries.reduce(
      (total, entry) => total + (entry.cached_files?.length || entry.files_in_payload || 1),
      0,
    ),
    by_source: bySource,
    failures: [],
    entries,
    excluded_sources: Object.entries(EXCLUDED_SOURCE_REASONS).map(([source, reason]) => ({
      source,
      reason,
      cached_entries_not_exported: original.entries.filter((entry) => entry.source === source).length,
    })),
  };
  writeJson(join(targetRoot, 'manifest.json'), manifest);
  return { original, manifest };
}

function buildLivePreviews(targetRoot) {
  const sourceRoot = join(canonicalRoot, 'live-previews');
  const original = JSON.parse(readFileSync(join(sourceRoot, 'manifest.json'), 'utf8'));
  const previews = original.previews.filter(
    (preview) => SAFE_SOURCE_LICENSES.has(preview.source) && preview.render_status === 'live',
  );

  for (const preview of previews) {
    for (const path of [preview.frame_path, preview.bundle_path]) {
      if (path && existsSync(join(sourceRoot, path))) {
        copyFile(join(sourceRoot, path), join(targetRoot, path));
      }
    }
    const harness = join(sourceRoot, 'harness', `${preview.id}.tsx`);
    if (existsSync(harness)) copyFile(harness, join(targetRoot, 'harness', `${preview.id}.tsx`));
  }
  copyFile(join(sourceRoot, 'assets/preview.css'), join(targetRoot, 'assets/preview.css'));

  const manifest = {
    ...original,
    generated_at: new Date().toISOString(),
    strategy: 'license-filtered-offline-live-previews',
    preview_count: previews.length,
    live_count: previews.length,
    blocked_count: 0,
    represented_official_assets: previews.reduce(
      (total, preview) => total + preview.official_assets.length,
      0,
    ),
    previews,
    excluded: original.previews
      .filter((preview) => !previews.some((item) => item.id === preview.id))
      .map((preview) => ({
        id: preview.id,
        source: preview.source,
        title: preview.title,
        official_url: preview.official_url,
        reason:
          EXCLUDED_SOURCE_REASONS[preview.source] ||
          '无可再分发的公开源码或不属于本次许可证白名单。',
      })),
  };
  writeJson(join(targetRoot, 'manifest.json'), manifest);
  return manifest;
}

function buildShowroom(file, manifest) {
  const cards = manifest.previews
    .map(
      (preview) => `
        <article class="card">
          <div class="meta"><span>${escapeHtml(preview.group)}</span><span>${escapeHtml(preview.license)}</span></div>
          <h2>${escapeHtml(preview.title)}</h2>
          <p>${escapeHtml(preview.style_summary)}</p>
          <p><strong>适合：</strong>${escapeHtml(preview.best_for)}</p>
          <iframe title="${escapeHtml(preview.title)} preview" src="live-previews/${escapeHtml(preview.frame_path)}" sandbox="allow-scripts" loading="lazy"></iframe>
          <a href="${escapeHtml(preview.official_url)}" target="_blank" rel="noopener noreferrer">打开官网 ↗</a>
        </article>`,
    )
    .join('\n');
  const excluded = manifest.excluded
    .map(
      (item) => `<li><strong>${escapeHtml(item.title)}</strong>：${escapeHtml(item.reason)} <a href="${escapeHtml(item.official_url)}" target="_blank" rel="noopener noreferrer">官网 ↗</a></li>`,
    )
    .join('\n');

  writeFileSync(
    file,
    `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="color-scheme" content="light dark">
  <title>Frontend UI Asset Kit · License-safe Showroom</title>
  <style>
    :root{font-family:Inter,"PingFang SC","Microsoft YaHei",sans-serif;color-scheme:light dark;--bg:#f5f3ec;--fg:#171717;--card:#fff;--line:#d8d3c5;--muted:#666}@media(prefers-color-scheme:dark){:root{--bg:#111;--fg:#eee;--card:#191919;--line:#3a3a3a;--muted:#aaa}}*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--fg)}main{max-width:1500px;margin:auto;padding:32px}header{max-width:900px;margin-bottom:32px}h1{font-size:clamp(2rem,5vw,4.5rem);line-height:1;text-wrap:balance;margin:.2em 0}p{line-height:1.65}.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,520px),1fr));gap:20px}.card{border:1px solid var(--line);border-radius:20px;padding:20px;background:var(--card)}.card h2{margin:.5rem 0}.meta{display:flex;gap:8px;flex-wrap:wrap}.meta span{border:1px solid var(--line);border-radius:999px;padding:4px 9px;font-size:12px}.card iframe{display:block;width:100%;height:390px;border:1px solid var(--line);border-radius:12px;background:#fff;margin:16px 0}.card a,aside a{color:inherit;font-weight:650}aside{margin-top:32px;padding:20px;border-left:4px solid #f97316;background:var(--card)}li{margin:.7em 0;line-height:1.5}@media(max-width:600px){main{padding:18px}.card{padding:14px}.card iframe{height:460px}}
  </style>
</head>
<body>
<main>
  <header><p>LICENSE-SAFE INTERNAL REUSE EDITION</p><h1>Frontend UI Asset Kit</h1><p>本页只实时渲染许可证白名单内的公开官方源码。所有 17 条产品线的目录和介绍仍保存在 catalogs/guides；受限来源不复制源码。</p></header>
  <section class="grid">${cards}</section>
  <aside><h2>只保留元数据、未导出源码</h2><ul>${excluded}</ul></aside>
</main>
</body>
</html>`,
  );
}

function buildPackageDocs(targetRoot, sourceResult, liveManifest) {
  const safeSources = [...SAFE_SOURCE_LICENSES.keys()];
  const sourceCount = sourceResult.manifest.entries.length;
  const sourceFiles = sourceResult.manifest.cached_file_count;
  const catalogIndex = JSON.parse(readFileSync(join(canonicalRoot, 'catalogs/index.json'), 'utf8'));
  const catalogCount = catalogIndex.total_assets || catalogIndex.asset_count || 7056;

  writeFileSync(
    join(output, 'README.md'),
    `# Frontend UI Asset Kit

可跨 React/Next.js 项目复用的 UI 资产知识库、前端执行规范、审核模板、机器目录、许可证边界、合法源码缓存和离线代表展厅。

## 当前内容

- ${catalogCount.toLocaleString('en-US')} 条逻辑资产目录，含 Free/Pro/Ultimate 元数据与官方入口。
- ${sourceCount} 条许可证白名单源码缓存记录，约 ${sourceFiles} 份 payload/raw files。
- ${liveManifest.previews.length} 家可离线运行的许可证白名单代表预览。
- 完整文字、数字、布局、动画、数据可视化、Storybook、无障碍和前端审核规范。

## 先读

1. [UI 资产入口](docs/ui-assets/README.md)
2. [前端工作流](docs/ui-assets/agent-workflow.md)
3. [前端执行规范](docs/ui-assets/frontend-product-standard.md)
4. [前端视觉与体验审核清单](docs/ui-assets/前端视觉与体验审核清单.md)
5. [离线许可证安全展厅](docs/ui-assets/showroom.html)
6. [许可证与排除说明](THIRD_PARTY_LICENSES.md)

## 使用原则

- catalogued 不等于 cached，cached 不等于 installed/adapted。
- 先查目录、看官方预览和许可证，再按页面复制所需源码。
- 受限来源只保留元数据，不从本仓寻找或反推源码。
- 推荐视觉参数可根据真实页面调整，但必须通过审核清单留下跨页面/主题/视口证据。

本仓默认 private；任何公开发布前必须重新执行许可证、第三方依赖、截图和预编译 bundle 审计。
`,
  );

  writeFileSync(
    join(targetRoot, 'README.md'),
    `# UI 资产入口

本目录包含全量 catalog、跨库 capabilities、来源指南、许可证、安全源码缓存、离线展厅、前端执行规范与审核模板。

- [前端工作流](agent-workflow.md)
- [前端执行规范](frontend-product-standard.md)
- [视觉与体验审核清单](前端视觉与体验审核清单.md)
- [全量目录](catalogs/README.md)
- [许可证](licenses.md)
- [安全源码缓存](source-cache/README.md)
- [离线展厅](showroom.html)
`,
  );

  writeFileSync(
    join(output, 'AGENTS.md'),
    `# Frontend UI Asset Kit Agent Rules

1. 新组件先查 \`docs/ui-assets/capabilities.json\`、catalog、guide 和 showroom。
2. catalogued/cached/installed/adapted 必须分开汇报。
3. 同能力多候选使用相同业务数据、中文、宽度、主题和状态比较。
4. 只从 \`docs/ui-assets/source-cache/manifest.json\` 指向的官方 payload/raw source 复制。
5. 受限来源只看元数据和官网，禁止从预编译 bundle 反推源码。
6. 字体、数字、布局和动画遵循推荐基线；真实效果不佳时调整语义 token 并留下证据。
7. 页面完成后使用 \`docs/ui-assets/前端视觉与体验审核清单.md\` 审核。
8. 任何公开发布或再分发前重新审计许可证和依赖。
`,
  );

  writeFileSync(
    join(output, 'THIRD_PARTY_LICENSES.md'),
    `# Third-party licenses and provenance

本仓不把所有内容声明为同一种许可证。项目原创整理与第三方源码分开；第三方文件继续受其各自上游许可证约束。

| Source | Export scope | License | Upstream |
|---|---|---|---|
| shadcn/ui | Official Registry payloads | MIT | https://github.com/shadcn-ui/ui |
| coss apps/ui + apps/origin | Only verified MIT paths/Registry payloads | MIT | https://github.com/cosscom/coss/blob/main/LICENSING.md |
| ReUI Free | Public Free Registry only | MIT | https://github.com/keenthemes/reui |
| Tremor Blocks | Selected block source | MIT | https://github.com/tremorlabs/tremor-blocks |
| Tremor legacy package | Fixed public package | Apache-2.0 | https://github.com/tremorlabs/tremor |
| Magic UI Free | Public Free Registry only | MIT | https://github.com/magicuidesign/magicui |
| Vercel AI Elements | Public Registry only | Apache-2.0 | https://github.com/vercel/ai-elements |
| Kibo UI | Public Registry only | MIT | https://github.com/shadcnblocks/kibo |
| Dice UI | Public repository/Registry source | MIT | https://github.com/sadmann7/diceui |
| Motion Primitives | Public Registry only | MIT | https://github.com/ibelick/motion-primitives |
| tweakcn | Official preset source | Apache-2.0 | https://github.com/jnsahaj/tweakcn |

精确 source URL、payload hash、路径和许可证 scope 见 \`docs/ui-assets/source-cache/manifest.json\`。复制进入产品时仍应保留必要 copyright/license notices，并重新核验字体、图片、图标、npm 依赖和上游许可证变化。

预编译 preview 只用于本 private 仓内部选型。公开发布前必须生成完整依赖 notices 或移除 compiled previews。
`,
  );

  const excludedLines = Object.entries(EXCLUDED_SOURCE_REASONS)
    .map(([source, reason]) => {
      const count = sourceResult.original.entries.filter((entry) => entry.source === source).length;
      return `- **${source}**：${reason} 本地缓存 ${count} 条未导出。`;
    })
    .join('\n');
  writeFileSync(
    join(output, 'EXCLUDED_ASSETS.md'),
    `# Excluded assets

本导出保留这些来源的 catalog、能力介绍、官网链接和访问等级，但不复制源码或 compiled preview：

${excludedLines}

另排除：ReUI Pro/Ultimate、React Bits Pro、Magic UI Pro 私有 blocks、任何会员/401 payload、投放 Agent PRD/契约/relay/公司数据、Obsidian 本机路径与凭证。

以后只有在许可证范围被逐项确认且导出器 allowlist 同步更新后，才可加入源码。
`,
  );

  writeFileSync(
    join(output, '.gitignore'),
    `.DS_Store\n.env\n.env.*\nnode_modules/\n`,
  );

  writeFileSync(
    join(output, 'LICENSE.md'),
    `# Repository license boundary

本 private 仓中的原创索引、说明和审核模板用于账号所有者内部项目复用。第三方源码、截图、名称和链接不改变其上游许可证或权利归属；以 \`THIRD_PARTY_LICENSES.md\`、具体文件来源和上游 LICENSE 为准。
`,
  );

  return { safeSources };
}

function writeExportManifest() {
  const files = walk(output)
    .filter((file) => basename(file) !== 'export-manifest.json')
    .sort()
    .map((file) => ({
      path: relative(output, file),
      bytes: statSync(file).size,
      sha256: sha256(file),
    }));
  writeJson(join(output, 'export-manifest.json'), {
    schema_version: 1,
    generated_at: new Date().toISOString(),
    visibility_target: 'private',
    files,
  });
  return files;
}

if (existsSync(output)) rmSync(output, { recursive: true, force: true });
mkdirSync(join(output, 'docs/ui-assets'), { recursive: true });

for (const directory of COPY_DIRECTORIES) {
  copyTree(join(canonicalRoot, directory), join(output, 'docs/ui-assets', directory));
}
for (const file of COPY_FILES) {
  copyFile(join(canonicalRoot, file), join(output, 'docs/ui-assets', file));
}

const sourceResult = buildSourceCache(join(output, 'docs/ui-assets/source-cache'));
const liveManifest = buildLivePreviews(join(output, 'docs/ui-assets/live-previews'));
buildShowroom(join(output, 'docs/ui-assets/showroom.html'), liveManifest);
buildPackageDocs(join(output, 'docs/ui-assets'), sourceResult, liveManifest);
const files = writeExportManifest();

console.log(
  JSON.stringify(
    {
      output,
      exported_files: files.length,
      safe_source_entries: sourceResult.manifest.entries.length,
      safe_live_previews: liveManifest.previews.length,
      excluded_cached_entries:
        sourceResult.original.entries.length - sourceResult.manifest.entries.length,
    },
    null,
    2,
  ),
);
