import { EMPTY, WALL, START, GOAL, CLOSED, OPEN, HIGHWAY, TRAFFIC, MUD, getColors } from './config.js';
import { initSearch, searchStep } from './pathfinding/algorithms.js';

export const ALGORITHM_NAMES = {
  astar: 'A*', dijkstra: 'Dijkstra', greedy: 'Greedy', bfs: 'BFS', dfs: 'DFS',
  bidirectional: 'Bidir. A*', jps: 'JPS ⚡', thetastar: 'Theta* ∠', dstarlite: 'D* Lite ↻',
};

export function runComparison({ grid, terrain, start, goal, allowDiagonals, weight = 1 }) {
  const rows = grid.length, cols = grid[0].length;
  return Object.entries(ALGORITHM_NAMES).map(([algo, name]) => {
    const copy = grid.map(row => row.map(v => v === WALL ? WALL : EMPTY));
    const costs = terrain.map(row => [...row]);
    copy[start.r][start.c] = START;
    copy[goal.r][goal.c] = GOAL;
    const state = initSearch(algo, { ...start }, { ...goal }, copy, costs, allowDiagonals, weight);
    const skipped = algo === 'jps' && allowDiagonals;
    let steps = 0;
    while (!skipped && !state.done && steps++ < rows * cols * 20) {
      searchStep(state, grid, costs, cols, rows, allowDiagonals, goal, start, weight,
        '', () => {}, () => {}, () => {}, null);
    }
    return {
      algo, name, grid: copy, terrain: costs, path: state.finalPath,
      explored: state.explored, pathLen: state.finalPath?.length || null,
      cost: state.solutionCost ?? null, skipped, limited: !skipped && !state.done,
    };
  });
}

function drawComparison(canvas, result) {
  const size = 9, rows = result.grid.length, cols = result.grid[0].length;
  canvas.width = cols * size;
  canvas.height = rows * size;
  const ctx = canvas.getContext('2d'), colors = getColors();
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
    const value = result.grid[r][c], terrain = result.terrain[r][c];
    ctx.fillStyle = [HIGHWAY, TRAFFIC, MUD].includes(terrain) ? colors[terrain] : colors[EMPTY];
    ctx.fillRect(c * size, r * size, size, size);
    if ([WALL, START, GOAL, CLOSED, OPEN].includes(value)) {
      ctx.fillStyle = colors[value];
      ctx.fillRect(c * size, r * size, size, size);
    }
  }
  if (!result.path?.length) return;
  ctx.beginPath();
  result.path.forEach((p, i) => {
    const x = (p.c + 0.5) * size, y = (p.r + 0.5) * size;
    if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y);
  });
  ctx.strokeStyle = colors[START];
  ctx.lineWidth = 3;
  ctx.stroke();
}

let comparisonTimer = null;
export function openCompare(options) {
  closeCompare();
  const overlay = document.getElementById('compareOverlay');
  const container = document.getElementById('compareGrid');
  const progress = document.getElementById('compareProgress');
  const chart = document.getElementById('compareBarChart');
  overlay.classList.add('visible');
  container.replaceChildren();
  chart.replaceChildren();
  chart.style.display = 'none';
  progress.textContent = 'Running algorithms…';
  // Snapshot at click time so edits to the editor cannot change a pending comparison.
  const snapshot = {
    ...options, grid: options.grid.map(row => [...row]), terrain: options.terrain.map(row => [...row]),
    start: { ...options.start }, goal: { ...options.goal },
  };
  comparisonTimer = setTimeout(() => {
    comparisonTimer = null;
    const results = runComparison(snapshot);
    const valid = results.filter(r => r.pathLen);
    const fastest = valid.reduce((best, r) => !best || r.explored < best.explored ? r : best, null);
    const optimal = valid.filter(r => r.cost !== null).reduce((best, r) => !best || r.cost < best.cost ? r : best, null);
    const balanced = valid.reduce((best, r) => !best || r.pathLen / (r.explored || 1) < best.pathLen / (best.explored || 1) ? r : best, null);
    const maxExplored = Math.max(1, ...results.map(r => r.explored));
    const maxPath = Math.max(1, ...valid.map(r => r.pathLen));
    for (const result of results) {
      const card = document.createElement('div');
      card.className = 'compare-card';
      card.title = 'Click to expand/minimize';
      card.addEventListener('click', () => {
        const maximize = !card.classList.contains('maximized');
        container.querySelectorAll('.maximized').forEach(c => c.classList.remove('maximized'));
        card.classList.toggle('maximized', maximize);
      });
      const title = document.createElement('div');
      title.className = 'compare-card-title';
      title.textContent = result.name;
      const canvas = document.createElement('canvas');
      const stats = document.createElement('div');
      stats.className = 'compare-stats';
      for (const [label, value] of [['explored', result.explored], ['path len', result.pathLen ?? '—'], ['cost', result.cost === null ? '—' : Math.round(result.cost)]]) {
        const cell = document.createElement('div');
        cell.className = 'compare-stat';
        const number = document.createElement('b');
        number.textContent = value;
        cell.append(number, document.createTextNode(label));
        stats.appendChild(cell);
      }
      card.append(title, canvas, stats);
      if (result.skipped || result.limited) {
        const note = document.createElement('p');
        note.textContent = result.skipped ? 'JPS supports four-way movement only' : 'Search step limit reached';
        card.appendChild(note);
      }
      const badges = document.createElement('div');
      badges.className = 'winner-badges';
      for (const [winner, cls, label] of [[fastest, 'fast', '⚡ Fastest'], [optimal, 'optimal', '★ Optimal'], [balanced !== fastest && balanced !== optimal ? balanced : null, 'balanced', '⚖ Balanced']]) {
        if (winner !== result) continue;
        card.classList.add(`winner-${cls}`);
        const badge = document.createElement('span');
        badge.className = `win-badge ${cls}`;
        badge.textContent = label;
        badges.appendChild(badge);
      }
      card.appendChild(badges);
      container.appendChild(card);
      drawComparison(canvas, result);
    }
    for (const [label, field, max] of [['📊 Nodes Explored — Comparison', 'explored', maxExplored], ['🛣 Path Length — Comparison', 'pathLen', maxPath]]) {
      const title = document.createElement('div');
      title.className = 'bar-chart-title';
      title.textContent = label;
      chart.appendChild(title);
      for (const result of results.filter(r => r[field] !== null)) {
        const row = document.createElement('div');
        row.className = 'bar-row';
        row.innerHTML = `<div class="bar-label">${result.name}</div><div class="bar-track"><div class="bar-fill" style="width:${100 * result[field] / max}%"></div></div><div class="bar-val">${result[field]}</div>`;
        chart.appendChild(row);
      }
    }
    chart.style.display = 'block';
    progress.textContent = 'All algorithms complete';
  }, 50);
}

export function closeCompare() {
  if (comparisonTimer !== null) clearTimeout(comparisonTimer);
  comparisonTimer = null;
  document.getElementById('compareOverlay')?.classList.remove('visible');
  document.querySelectorAll('.compare-card.maximized').forEach(c => c.classList.remove('maximized'));
}
