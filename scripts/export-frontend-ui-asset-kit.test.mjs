import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const exporter = join(repoRoot, 'scripts/export-frontend-ui-asset-kit.mjs');

function walk(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = join(dir, entry.name);
    return entry.isDirectory() ? walk(full) : [full];
  });
}

function sha256(file) {
  return createHash('sha256').update(readFileSync(file)).digest('hex');
}

test('exports a reusable kit without restricted source or local project data', () => {
  const tempRoot = mkdtempSync(join(tmpdir(), 'frontend-ui-asset-kit-test-'));
  const output = join(tempRoot, 'frontend-ui-asset-kit');

  try {
    execFileSync(process.execPath, [exporter, '--output', output], {
      cwd: repoRoot,
      encoding: 'utf8',
      stdio: 'pipe',
    });

    const required = [
      'README.md',
      'THIRD_PARTY_LICENSES.md',
      'EXCLUDED_ASSETS.md',
      'export-manifest.json',
      'docs/ui-assets/frontend-product-standard.md',
      'docs/ui-assets/前端视觉与体验审核清单.md',
      'docs/ui-assets/catalogs/index.json',
      'docs/ui-assets/capabilities.json',
      'docs/ui-assets/showroom.html',
      'docs/ui-assets/source-cache/manifest.json',
      'docs/ui-assets/live-previews/manifest.json',
    ];

    for (const path of required) {
      assert.ok(existsSync(join(output, path)), `missing ${path}`);
    }

    const sourceManifest = JSON.parse(
      readFileSync(join(output, 'docs/ui-assets/source-cache/manifest.json'), 'utf8'),
    );
    const safeSources = new Set([
      'ai-elements',
      'coss',
      'coss-origin',
      'dice-ui',
      'kibo-ui',
      'magic-ui',
      'motion-primitives',
      'reui',
      'shadcn',
      'tremor',
      'tremor-legacy',
      'tweakcn',
    ]);
    assert.ok(sourceManifest.entries.length > 0, 'safe source cache should not be empty');
    for (const entry of sourceManifest.entries) {
      assert.ok(safeSources.has(entry.source), `restricted source exported: ${entry.source}`);
      assert.match(entry.license, /MIT|Apache-2\.0/);
      assert.ok(existsSync(join(output, 'docs/ui-assets/source-cache', entry.local_path)));
    }

    for (const banned of ['aceternity', 'animate-ui', 'react-bits', 'magic-ui-pro']) {
      assert.ok(
        !existsSync(join(output, 'docs/ui-assets/source-cache', banned)),
        `restricted cache directory exported: ${banned}`,
      );
    }

    const liveManifest = JSON.parse(
      readFileSync(join(output, 'docs/ui-assets/live-previews/manifest.json'), 'utf8'),
    );
    for (const preview of liveManifest.previews) {
      assert.ok(safeSources.has(preview.source), `restricted live preview exported: ${preview.source}`);
      assert.equal(preview.render_status, 'live');
    }

    const textFiles = walk(output).filter((file) => {
      const ext = file.split('.').pop();
      return ['md', 'json', 'html', 'js', 'css', 'tsx', 'ts'].includes(ext);
    });
    const forbidden = [
      /\/Users\/aik\//,
      /docs\/relay\//,
      /packages\/contract\//,
      /BEGIN (RSA |OPENSSH )?PRIVATE KEY/,
      /(?:api[_-]?key|secret|token)\s*[:=]\s*["'][^"']{8,}/i,
    ];
    for (const file of textFiles) {
      const content = readFileSync(file, 'utf8');
      for (const pattern of forbidden) {
        assert.doesNotMatch(content, pattern, `${relative(output, file)} matched ${pattern}`);
      }
      if (file.endsWith('.json')) assert.doesNotThrow(() => JSON.parse(content), file);
    }

    const markdownLink = /\[[^\]]+\]\(([^)]+)\)/g;
    for (const file of textFiles.filter((item) => item.endsWith('.md'))) {
      const content = readFileSync(file, 'utf8');
      for (const match of content.matchAll(markdownLink)) {
        const link = match[1];
        if (
          link.startsWith('http') ||
          link.startsWith('#') ||
          link.startsWith('mailto:') ||
          link.includes('$')
        ) {
          continue;
        }
        const target = resolve(dirname(file), decodeURI(link.split('#')[0]));
        assert.ok(existsSync(target), `${relative(output, file)} has broken link: ${link}`);
      }
    }

    const manifest = JSON.parse(readFileSync(join(output, 'export-manifest.json'), 'utf8'));
    assert.ok(manifest.files.length > 100, 'export should contain the reusable catalog and docs');
    for (const item of manifest.files) {
      const file = join(output, item.path);
      assert.ok(existsSync(file), `manifest path missing: ${item.path}`);
      assert.ok(statSync(file).isFile(), `manifest path is not a file: ${item.path}`);
      assert.equal(sha256(file), item.sha256, `hash mismatch: ${item.path}`);
    }
  } finally {
    rmSync(tempRoot, { recursive: true, force: true });
  }
});
