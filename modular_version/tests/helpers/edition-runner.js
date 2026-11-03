import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInThisContext } from 'node:vm';
import { createHarness } from './dom.js';

const standalone = process.argv[2] === 'standalone';
const html = readFileSync(new URL(standalone ? '../../../MetroMind_AI_v11.html' : '../../MetroMind_AI_v11.html', import.meta.url), 'utf8');
const h = createHarness(html);
let seed = 12345;
Math.random = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 2 ** 32; };
if (standalone) {
  const script = html.match(/<script>([\s\S]*?)<\/script>/)[1];
  runInThisContext(script, { filename: 'MetroMind_AI_v11.html' });
} else {
  await import('../../js/main.js');
}
const click = id => h.byId(id).click();
const key = (code, value = '') => h.documentEvents.dispatch('keydown', { code, key: value, target: { tagName: 'BODY' } });
const paint = (r, c, touch = false) => {
  const cell = h.byId('grid').width / Number(h.byId('mazeCols').value);
  const event = { clientX: (c + 0.5) * cell, clientY: (r + 0.5) * cell };
  if (touch) {
    h.byId('grid').dispatch('touchstart', { touches: [event] });
    h.byId('grid').dispatch('touchend', { changedTouches: [event] });
  } else {
    h.byId('grid').dispatch('mousedown', event);
    h.windowEvents.dispatch('mouseup', event);
  }
};
function finish() {
  for (let i = 0; h.timers.size && i < 10000; i++) {
    for (const [id, timer] of [...h.timers]) if (h.timers.has(id)) timer.fn();
  }
  assert.equal(h.timers.size, 0);
}
const trace = [];
async function capture(label) {
  window.exportGridJSON();
  const map = JSON.parse(await h.blobs.at(-1).text());
  trace.push({ label, map, stats: ['statNodes', 'statPath', 'statOpen', 'statCost', 'algoBadge', 'heurBadge', 'statusText', 'playBtn'].map(id => String(h.byId(id).textContent)) });
}

assert.equal(h.byId('onboardingOverlay').classList.contains('visible'), true);
click('btnOnboardingSkip');
assert.equal(h.storage.get('mm_ob_skip'), '1');
window.applyPreset(10, 10);
for (const algo of ['astar', 'dijkstra', 'greedy', 'bfs', 'dfs', 'bidirectional', 'jps', 'thetastar', 'dstarlite']) {
  click(`btn-algo-${algo}`);
  key('Space');
  finish();
  assert.ok(Number(h.byId('statPath').textContent) > 0, `${algo} finds a path`);
  await capture(algo);
}
// A completed D* Lite session stays active through edits, including touch input.
click('toolWall');
paint(3, 4, true);
assert.equal(h.timers.size, 1);
assert.equal(h.byId('statPath').textContent, '—');
key('Space');
assert.equal(h.timers.size, 0);
paint(4, 4);
key('KeyS');
assert.equal(h.timers.size, 0);
await capture('paused repair');
key('Space'); finish();
await capture('repaired');
for (let r = 0; r < 10; r++) paint(r, 5);
finish();
assert.match(h.byId('statusText').textContent, /No path/);
await capture('blocked');
click('toolErase'); paint(2, 5); finish();
assert.ok(Number(h.byId('statPath').textContent) > 0);
await capture('recovered');
key('KeyB');
key('KeyF');
key('KeyR');
window.loadMaze('empty');
await capture('empty maze');
assert.ok((await JSON.parse(await h.blobs.at(-1).text())).grid.every(row => row.every(v => v !== 1)));
key('KeyX');
h.drainTimeouts();
assert.equal(h.byId('compareProgress').textContent, 'All algorithms complete');
assert.equal(h.byId('compareGrid').children.length, 9);
trace.push({ label: 'comparison', cards: h.byId('compareGrid').children.map(card => card.children.map(child => String(child.textContent))), badges: document.querySelectorAll('.win-badge').map(e => e.textContent) });
key('Escape');
assert.equal(h.byId('compareOverlay').classList.contains('visible'), false);
key('KeyG');
assert.equal(document.body.classList.contains('fullscreen'), true);
key('', '?');
assert.equal(h.byId('shortcutsOverlay').classList.contains('visible'), true);
key('Escape');
click('btn-algo-astar');
click('heur-euclidean');
assert.equal(h.byId('heurBadge').textContent, 'Euclidean');
// Exercise a whole RL batch, including its visible counters and both overlays.
h.byId('rlMaxEpisodes').value = '100';
h.byId('rlBatchSize').value = '50';
h.byId('rlMaxSteps').value = '30';
h.byId('rlHeatmapToggle').checked = true;
h.byId('rlHeatmapToggle').dispatch('change');
h.byId('rlArrowsToggle').checked = true;
h.byId('rlArrowsToggle').dispatch('change');
click('rlTrainBtn');
for (let i = 0; i < 10 && h.byId('rlTrainBtn').classList.contains('training'); i++) h.frame();
assert.equal(String(h.byId('rlEpisodeCount').textContent), '100');
assert.equal(h.byId('rlTrainBtn').classList.contains('training'), false);
trace.push({ label: 'rl', stats: ['rlEpisodeCount', 'rlEpsilonVal', 'rlBestRewardVal', 'rlAvgRewardVal', 'rlBestPathLen', 'rlQTableSize'].map(id => String(h.byId(id).textContent)) });
click('rlPolicyBtn');
await capture('rl policy');
click('rlResetBtn');
assert.equal(String(h.byId('rlQTableSize').textContent), '0');
console.log(JSON.stringify(trace));
