import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { checkStandalone } from '../scripts/build-standalone.js';
import { runComparison } from '../js/comparison.js';

test('the checked-in standalone is exactly generated from the modular sources', async () => {
  assert.equal(await checkStandalone(), true, 'Run npm run build to sync the standalone edition');
  const html = readFileSync(new URL('../../MetroMind_AI_v11.html', import.meta.url), 'utf8');
  assert.equal(/<script[^>]+src=/.test(html), false, 'the standalone script must be embedded');
  assert.equal(/href="css\/styles.css"/.test(html), false, 'the standalone CSS must be embedded');
  assert.equal(/type="module"/.test(html), false, 'file:// use must not require module loading');
});

test('both shipped entry points produce identical results through the same user interactions', () => {
  const runner = fileURLToPath(new URL('./helpers/edition-runner.js', import.meta.url));
  const results = ['modular', 'standalone'].map(edition => {
    const result = spawnSync(process.execPath, [runner, edition], { encoding: 'utf8', timeout: 30000, maxBuffer: 4 * 1024 * 1024 });
    assert.equal(result.status, 0, `${edition}: ${result.stderr || result.error || ''}`);
    return JSON.parse(result.stdout);
  });
  assert.deepEqual(results[0], results[1]);
});

test('comparison preserves the editor map, includes D* Lite, and handles diagonal JPS', () => {
  const grid = Array.from({ length: 10 }, () => Array(10).fill(0));
  const terrain = grid.map(row => row.map(() => 0));
  grid[0][0] = 2; grid[9][9] = 3; grid[3][4] = 1; terrain[2][2] = 7;
  const before = structuredClone({ grid, terrain });
  const results = runComparison({ grid, terrain, start: { r: 0, c: 0 }, goal: { r: 9, c: 9 }, allowDiagonals: true });
  assert.equal(results.length, 9);
  assert.equal(results.find(r => r.algo === 'jps').skipped, true);
  // Existing static algorithms store rounded costs; D* Lite retains exact costs for repairs.
  assert.equal(Math.round(results.find(r => r.algo === 'dstarlite').cost), results.find(r => r.algo === 'dijkstra').cost);
  assert.deepEqual({ grid, terrain }, before);
});
