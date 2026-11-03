import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { createHarness } from './helpers/dom.js';

const html = readFileSync(new URL('../MetroMind_AI_v11.html', import.meta.url), 'utf8');
const { byId, windowEvents, timers } = createHarness(html);

await import('../js/main.js');
const Grid = await import('../js/grid.js');
const History = await import('../js/history.js');
const Config = await import('../js/config.js');
function click(id) { byId(id).dispatch('click'); }
function paint(r, c) {
  const event = { clientX: (c + 0.5) * Grid.CELL, clientY: (r + 0.5) * Grid.CELL };
  Grid.canvas.dispatch('mousedown', event);
  windowEvents.dispatch('mouseup', event);
}
function finish() {
  for (let i = 0; timers.size && i < 10000; i++) {
    for (const [id, timer] of [...timers]) if (timers.has(id)) timer.fn();
  }
  assert.equal(timers.size, 0, 'animation must finish and clear its timer');
}
function selectDstar() { click('btn-algo-dstarlite'); }

test('selector, running edit, pause/resume, step and speed use the real control wiring', () => {
  window.applyPreset(10, 10);
  selectDstar();
  assert.equal(byId('algoBadge').textContent, 'D* Lite');
  assert.equal(byId('weightSlider').disabled, true);
  assert.equal(byId('heur-manhattan').disabled, true);
  click('playBtn');
  assert.equal(timers.size, 1);
  const timerId = [...timers.keys()][0];
  paint(4, 4);
  assert.equal(timers.size, 1, 'running edits must not create duplicate timers');
  assert.equal([...timers.keys()][0], timerId, 'dragging must not postpone the next animation tick');
  assert.equal(Grid.grid[4][4], Config.WALL);
  click('playBtn');
  assert.equal(timers.size, 0);
  paint(4, 5);
  assert.equal(timers.size, 0, 'paused edits must stay paused');
  assert.match(byId('statusText').textContent, /paused/);
  assert.equal(byId('stepBtn').disabled, false);
  const before = byId('stepCounter').textContent;
  click('stepBtn');
  assert.notEqual(byId('stepCounter').textContent, before);
  assert.equal(timers.size, 0);
  click('playBtn');
  byId('speedSlider').value = '95';
  byId('speedSlider').dispatch('input');
  assert.equal(timers.size, 1);
  assert.equal([...timers.values()][0].delay, 15);
  finish();
  assert.ok(Grid.agentPath);
  assert.ok(Grid.agentPath.every(p => Grid.grid[p.r][p.c] !== Config.WALL));
  assert.equal(byId('progressStatus').textContent, 'Route active');
});

test('completed route invalidates immediately, replans, and recovers from no path', () => {
  const cell = Grid.agentPath[2];
  click('toolWall');
  paint(cell.r, cell.c);
  assert.equal(Grid.agentPath, null, 'stop stale agent animation before repairing');
  assert.equal(byId('statPath').textContent, '—');
  assert.equal(byId('statCost').textContent, '—');
  assert.equal(timers.size, 1);
  finish();
  assert.ok(Grid.agentPath.every(p => Grid.grid[p.r][p.c] !== Config.WALL));
  for (let r = 0; r < Grid.ROWS; r++) paint(r, 5);
  finish();
  assert.equal(Grid.agentPath, null);
  assert.match(byId('statusText').textContent, /No path/);
  click('toolErase');
  paint(2, 5);
  assert.equal(timers.size, 1);
  finish();
  assert.ok(Grid.agentPath, 'erasing a gap should recover the active route');
  click('toolMud');
  const next = Grid.agentPath[1];
  paint(next.r, next.c);
  assert.equal(Grid.agentPath, null);
  finish();
  assert.ok(Grid.agentPath);
});

test('history previews pause safely without replacing the authoritative grid', () => {
  window.clearAll();
  click('playBtn');
  for (let i = 0; i < 4; i++) [...timers.values()][0]?.fn();
  assert.ok(History.searchHistory.length > 1);
  const liveGrid = Grid.grid;
  click('btnBack');
  assert.equal(Grid.grid, liveGrid);
  assert.equal(timers.size, 0);
  window.stepForward();
  assert.equal(Grid.grid, liveGrid);
  click('toolWall');
  paint(4, 4);
  assert.equal(History.searchHistory.length, 0, 'edits discard incompatible visual history');
  assert.equal(Grid.grid, liveGrid);
  assert.equal(Grid.grid[4][4], Config.WALL);
  assert.equal(timers.size, 0);
  click('playBtn');
  finish();
  assert.ok(Grid.agentPath);
});

test('endpoint movement, diagonal changes, maze, resize, reset and algorithm switches clear the session', () => {
  click('toolGoal');
  paint(8, 8);
  assert.deepEqual(Grid.goalNode, { r: 8, c: 8 });
  assert.equal(Grid.agentPath, null);
  assert.equal(timers.size, 0);
  click('playBtn'); finish();
  assert.deepEqual(Grid.agentPath.at(-1), Grid.goalNode);
  // Dragging an endpoint onto the other endpoint is rejected.
  Grid.canvas.dispatch('mousedown', { clientX: (Grid.startNode.c + 0.5) * Grid.CELL, clientY: (Grid.startNode.r + 0.5) * Grid.CELL });
  windowEvents.dispatch('mouseup', { clientX: (Grid.goalNode.c + 0.5) * Grid.CELL, clientY: (Grid.goalNode.r + 0.5) * Grid.CELL });
  assert.notDeepEqual(Grid.startNode, Grid.goalNode);
  byId('allowDiagonals').checked = true;
  byId('allowDiagonals').dispatch('change');
  assert.equal(Grid.agentPath, null);
  click('playBtn'); finish();
  assert.ok(Grid.agentPath);
  window.loadMaze('empty');
  assert.equal(Grid.agentPath, null);
  click('playBtn');
  window.applyPreset(20, 15);
  assert.equal(timers.size, 0);
  assert.equal(Grid.grid.length, 15);
  click('playBtn');
  click('btnResetPath');
  assert.equal(timers.size, 0);
  click('playBtn');
  click('btn-algo-astar');
  assert.equal(timers.size, 0);
  assert.equal(byId('weightSlider').disabled, false);
  assert.equal(byId('heur-manhattan').disabled, false);
  click('playBtn'); finish();
  assert.ok(Grid.agentPath, 'A* still runs after switching away from D* Lite');
});
