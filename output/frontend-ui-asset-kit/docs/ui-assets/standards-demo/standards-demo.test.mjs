import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const root = dirname(fileURLToPath(import.meta.url));
const htmlPath = join(root, 'index.html');

test('standards lab is a complete offline interactive specimen', () => {
  assert.ok(existsSync(htmlPath), 'index.html should exist');
  const html = readFileSync(htmlPath, 'utf8');

  for (const marker of [
    'data-theme-control',
    'data-density-control',
    'data-font-control',
    'data-motion-control',
    'data-replay-motion',
    'Intl.NumberFormat',
    'Intl.DateTimeFormat',
    'tabular-nums',
    'prefers-reduced-motion',
    ':focus-visible',
    'Typing',
    'Morph',
    'Roll',
    'Scramble',
    'Shimmer',
    'Text Loop',
    'Animated Number',
    'Sliding Number',
    'Counting Number',
    'Storybook',
    'ECharts',
    'UI 资产展厅',
    '脱敏假数据',
    '临时规范实验',
  ]) {
    assert.ok(html.includes(marker), `missing marker: ${marker}`);
  }

  assert.ok(html.includes('../live-previews/frames/motion-primitives.html'));
  assert.ok(html.includes('../live-previews/frames/animate-ui.html'));
  assert.doesNotMatch(html, /https?:\/\/(?!www\.w3\.org)/, 'runtime must not load remote assets');
  assert.doesNotMatch(html, /transition\s*:\s*all/i);
  assert.doesNotMatch(html, /user-scalable\s*=\s*no/i);
});

