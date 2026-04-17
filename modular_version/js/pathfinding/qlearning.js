import { WALL, START, GOAL } from '../config.js';
import { getCellTerrainCost } from './algorithms.js';

export class QAgent {
  constructor(rows, cols) {
    this.rows = rows;
    this.cols = cols;
    this.qTable = new Map();
    this.numActions = 4;
  }
  _key(r, c) {
    return `${r},${c}`;
  }
  _getQ(r, c) {
    const k = this._key(r, c);
    if (!this.qTable.has(k))
      this.qTable.set(k, new Float64Array(this.numActions));
    return this.qTable.get(k);
  }
  getAction(r, c, epsilon) {
    if (Math.random() < epsilon)
      return Math.floor(Math.random() * this.numActions);
    return this.getBestAction(r, c);
  }
  getBestAction(r, c) {
    const q = this._getQ(r, c);
    let best = 0;
    for (let i = 1; i < q.length; i++) {
      if (q[i] > q[best]) best = i;
    }
    return best;
  }
  getMaxQ(r, c) {
    const q = this._getQ(r, c);
    let max = q[0];
    for (let i = 1; i < q.length; i++) {
      if (q[i] > max) max = q[i];
    }
    return max;
  }
  update(r, c, action, reward, nr, nc, alpha, gamma) {
    const q = this._getQ(r, c);
    q[action] +=
      alpha * (reward + gamma * this.getMaxQ(nr, nc) - q[action]);
  }
  reset() {
    this.qTable.clear();
  }
  updateNumActions(n) {
    if (n !== this.numActions) {
      this.numActions = n;
      this.qTable.clear();
    }
  }
}

export const RL_ACTIONS_4 = [
  { dr: -1, dc: 0 },
  { dr: 1, dc: 0 },
  { dr: 0, dc: -1 },
  { dr: 0, dc: 1 },
];
export const RL_ACTIONS_8 = [
  ...RL_ACTIONS_4,
  { dr: -1, dc: -1 },
  { dr: -1, dc: 1 },
  { dr: 1, dc: -1 },
  { dr: 1, dc: 1 },
];

export let rlAgent = null;
export let rlTraining = false;
export let rlTrainTimer = null;
export let rlEpisode = 0;
export let rlEpsilon = 1.0;
export let rlRewardHistory = [];
export let rlBestReward = -Infinity;
export let rlBestPath = null;
export let rlShowHeatmap = false;
export let rlShowArrows = false;
export let rlLastPath = null;

export function setRLAgent(agent) { rlAgent = agent; }
export function setRLTraining(v) { rlTraining = v; }
export function setRLEpisode(v) { rlEpisode = v; }
export function setRLEpsilon(v) { rlEpsilon = v; }
export function setRLRewardHistory(v) { rlRewardHistory = v; }
export function setRLBestReward(v) { rlBestReward = v; }
export function setRLBestPath(v) { rlBestPath = v; }
export function setRLShowHeatmap(v) { rlShowHeatmap = v; }
export function setRLShowArrows(v) { rlShowArrows = v; }
export function setRLLastPath(v) { rlLastPath = v; }
export function setHeatmap(v) { rlShowHeatmap = v; }
export function setArrows(v) { rlShowArrows = v; }

export function getRLActions(allowDiagonals) {
  return allowDiagonals ? RL_ACTIONS_8 : RL_ACTIONS_4;
}

export function runRLEpisode(agent, config, startNode, goalNode, grid, terrainGrid, allowDiagonals, ROWS, COLS) {
  if (!startNode || !goalNode) return null;
  const actions = getRLActions(allowDiagonals);
  agent.updateNumActions(actions.length);

  let r = startNode.r,
    c = startNode.c;
  let totalReward = 0;
  const path = [{ r, c }];

  for (let step = 0; step < config.maxSteps; step++) {
    const action = agent.getAction(r, c, rlEpsilon);
    const dir = actions[action];
    let nr = r + dir.dr,
      nc = c + dir.dc;
    let reward;

    if (
      nr < 0 ||
      nr >= ROWS ||
      nc < 0 ||
      nc >= COLS ||
      grid[nr][nc] === WALL
    ) {
      nr = r;
      nc = c;
      reward = -5;
    } else if (nr === goalNode.r && nc === goalNode.c) {
      reward = 200;
      agent.update(
        r,
        c,
        action,
        reward,
        nr,
        nc,
        config.alpha,
        config.gamma,
      );
      totalReward += reward;
      path.push({ r: nr, c: nc });
      return {
        path,
        totalReward,
        steps: path.length - 1,
        reachedGoal: true,
      };
    } else {
      const terrainCost = getCellTerrainCost(nr, nc, terrainGrid);
      const distBefore =
        Math.abs(r - goalNode.r) + Math.abs(c - goalNode.c);
      const distAfter =
        Math.abs(nr - goalNode.r) + Math.abs(nc - goalNode.c);
      reward = -1 * terrainCost + (distBefore - distAfter) * 0.5;
    }

    agent.update(
      r,
      c,
      action,
      reward,
      nr,
      nc,
      config.alpha,
      config.gamma,
    );
    r = nr;
    c = nc;
    totalReward += reward;
    path.push({ r, c });
  }

  return {
    path,
    totalReward,
    steps: path.length - 1,
    reachedGoal: false,
  };
}

export function startRLTraining(startNode, goalNode, grid, terrainGrid, allowDiagonals, ROWS, COLS, updateCallbacks) {
  const { onStep, onComplete, log, showToast, drawGrid } = updateCallbacks;
  
  if (!startNode || !goalNode) {
    showToast("⚠ Set start and goal first", "warn");
    return;
  }

  const config = {
    alpha: parseFloat(document.getElementById("rlAlpha")?.value || 0.1),
    gamma: parseFloat(document.getElementById("rlGamma")?.value || 0.95),
    epsilonDecay: parseFloat(document.getElementById("rlEpsilonDecay")?.value || 0.997),
    epsilonMin: 0.05,
    maxEpisodes: parseInt(document.getElementById("rlMaxEpisodes")?.value || 1000),
    maxSteps: parseInt(document.getElementById("rlMaxSteps")?.value || 500),
    batchSize: parseInt(document.getElementById("rlBatchSize")?.value || 10),
  };

  if (!rlAgent) {
    rlAgent = new QAgent(ROWS, COLS);
  }
  rlAgent.updateNumActions(getRLActions(allowDiagonals).length);

  rlTraining = true;
  rlEpisode = 0;
  rlEpsilon = 1.0;
  rlRewardHistory = [];
  rlBestReward = -Infinity;
  rlBestPath = null;

  const btn = document.getElementById("rlTrainBtn");
  if (btn) {
    btn.textContent = "⏸ STOP TRAINING";
    btn.classList.add("training");
  }

  log("info", `🧠 RL Training: α=${config.alpha}, γ=${config.gamma}, ε-decay=${config.epsilonDecay}`);

  function trainFrame() {
    if (!rlTraining) return;
    const batch = config.batchSize;

    for (let i = 0; i < batch && rlEpisode < config.maxEpisodes; i++) {
      const result = runRLEpisode(rlAgent, config, startNode, goalNode, grid, terrainGrid, allowDiagonals, ROWS, COLS);
      if (!result) {
        stopRLTraining();
        return;
      }

      rlRewardHistory.push(result.totalReward);
      if (rlRewardHistory.length > 2000) rlRewardHistory.shift();

      if (result.totalReward > rlBestReward) {
        rlBestReward = result.totalReward;
        rlBestPath = result.path.slice();
      }

      rlEpisode++;
      rlEpsilon = Math.max(config.epsilonMin, rlEpsilon * config.epsilonDecay);
    }

    onStep();
    drawRLConvergenceChart();
    if (rlShowHeatmap || rlShowArrows) drawGrid();

    if (rlEpisode >= config.maxEpisodes) {
      stopRLTraining();
      onComplete(rlEpisode, rlBestReward, rlBestPath);
      return;
    }

    rlTrainTimer = requestAnimationFrame(trainFrame);
  }

  rlTrainTimer = requestAnimationFrame(trainFrame);
}

export function stopRLTraining() {
  rlTraining = false;
  if (rlTrainTimer) {
    cancelAnimationFrame(rlTrainTimer);
    rlTrainTimer = null;
  }
  const btn = document.getElementById("rlTrainBtn");
  if (btn) {
    btn.textContent = "🧠 TRAIN AGENT";
    btn.classList.remove("training");
  }
}

export function resetRLAgent() {
  stopRLTraining();
  rlAgent = null;
  rlEpisode = 0;
  rlEpsilon = 1.0;
  rlRewardHistory = [];
  rlBestReward = -Infinity;
  rlBestPath = null;
  rlLastPath = null;
  // UI updates handled by caller or via side effects if we had a proper UI bridge
  // For now let's hope the main.js calls updateRLStats
}

export function runLearnedPolicy(startNode, goalNode, grid, terrainGrid, allowDiagonals, ROWS, COLS, callbacks) {
  const { showToast, log, setStatus, drawGrid, stopAgentAnimation, startAgentAnimation, resetPath, updateStats } = callbacks;
  
  if (!rlAgent || rlAgent.qTable.size === 0) {
    showToast("⚠ Train the agent first", "warn");
    return;
  }
  if (!startNode || !goalNode) return;

  const actions = getRLActions(allowDiagonals);
  rlAgent.updateNumActions(actions.length);

  let r = startNode.r, c = startNode.c;
  const path = [{ r, c }];
  const visited = new Set([`${r},${c}`]);
  let totalCost = 0;
  const maxSteps = ROWS * COLS * 2;

  for (let step = 0; step < maxSteps; step++) {
    if (r === goalNode.r && c === goalNode.c) break;
    const q = rlAgent._getQ(r, c);
    const ranked = [...q].map((v, i) => ({ v, i })).sort((a,b) => b.v - a.v);

    let moved = false;
    for (const { i } of ranked) {
      const dir = actions[i];
      const nr = r + dir.dr, nc = c + dir.dc;
      if (nr < 0 || nr >= ROWS || nc < 0 || nc >= COLS || grid[nr][nc] === WALL) continue;
      const nk = `${nr},${nc}`;
      if (visited.has(nk) && !(nr === goalNode.r && nc === goalNode.c)) continue;

      totalCost += getCellTerrainCost(nr, nc, terrainGrid);
      r = nr; c = nc;
      path.push({ r, c });
      visited.add(nk);
      moved = true;
      break;
    }
    if (!moved) break;
  }

  rlLastPath = path;
  const reachedGoal = r === goalNode.r && c === goalNode.c;

  stopAgentAnimation();
  resetPath(true);
  path.forEach(p => {
    if (grid[p.r][p.c] !== START && grid[p.r][p.c] !== GOAL)
      grid[p.r][p.c] = 6; // PATH constant
  });

  if (reachedGoal) {
    showToast(`✓ RL Policy: ${path.length} steps, cost ${Math.round(totalCost)}`, "success");
    log("success", `🧠 RL Policy: ${path.length} steps, cost ${Math.round(totalCost)}`);
    updateStats(rlAgent.qTable.size, path.length, 0, Math.round(totalCost));
    setStatus("done", `RL Policy — ${path.length} steps · cost ${Math.round(totalCost)}`);
  } else {
    showToast("⚠ Agent didn't reach goal — train more!", "warn");
    log("warn", `🧠 RL Policy: stuck after ${path.length} steps — needs more training`);
    setStatus("error", `RL agent stuck after ${path.length} steps`);
  }
  drawGrid();
  startAgentAnimation(path);
}


export function drawRLOverlay(ctx, CELL, ROWS, COLS, grid) {
  if (!rlAgent || rlAgent.qTable.size === 0) return;
  const actions = getRLActions(false); // Default to 4 for overlay? or check diagonals?
  // We should pass allowDiagonals if needed. For now let's assume 4 or check.
  const isDark =
    document.documentElement.getAttribute("data-theme") !== "light";

  let qMin = Infinity,
    qMax = -Infinity;
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      if (grid[r][c] === WALL) continue;
      const k = `${r},${c}`;
      if (!rlAgent.qTable.has(k)) continue;
      const mq = rlAgent.getMaxQ(r, c);
      if (mq < qMin) qMin = mq;
      if (mq > qMax) qMax = mq;
    }
  }
  const qRange = qMax - qMin || 1;

  if (rlShowHeatmap) {
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        if (
          grid[r][c] === WALL ||
          grid[r][c] === START ||
          grid[r][c] === GOAL
        )
          continue;
        const k = `${r},${c}`;
        if (!rlAgent.qTable.has(k)) continue;
        const mq = rlAgent.getMaxQ(r, c);
        const norm = (mq - qMin) / qRange;
        const x = c * CELL,
          y = r * CELL;

        let cr, cg, cb;
        if (norm < 0.5) {
          const t = norm * 2;
          cr = Math.round(0 + t * 0);
          cg = Math.round(85 + t * 144);
          cb = Math.round(255 - t * 95);
        } else {
          const t = (norm - 0.5) * 2;
          cr = Math.round(0 + t * 247);
          cg = Math.round(229 - t * 46);
          cb = Math.round(160 - t * 111);
        }
        ctx.fillStyle = `rgba(${cr},${cg},${cb},${isDark ? 0.4 : 0.35})`;
        ctx.fillRect(x + 1, y + 1, CELL - 2, CELL - 2);
      }
    }
  }

  if (rlShowArrows) {
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        if (
          grid[r][c] === WALL ||
          grid[r][c] === START ||
          grid[r][c] === GOAL
        )
          continue;
        const k = `${r},${c}`;
        if (!rlAgent.qTable.has(k)) continue;

        const bestAction = rlAgent.getBestAction(r, c);
        const dir = actions[bestAction];
        if (!dir) continue;

        const cx = c * CELL + CELL / 2;
        const cy = r * CELL + CELL / 2;
        const arrowLen = CELL * 0.3;
        const ax = cx + dir.dc * arrowLen;
        const ay = cy + dir.dr * arrowLen;

        const q = rlAgent._getQ(r, c);
        const sorted = [...q].sort((a, b) => b - a);
        const confidence =
          q.length > 1
            ? Math.min(
                1,
                (sorted[0] - sorted[1]) / (Math.abs(sorted[0]) + 0.1),
              )
            : 0.5;
        const alpha = 0.3 + confidence * 0.5;

        ctx.save();
        ctx.strokeStyle = isDark
          ? `rgba(167,139,250,${alpha})`
          : `rgba(100,60,200,${alpha})`;
        ctx.lineWidth = Math.max(1, CELL * 0.08);
        ctx.lineCap = "round";

        ctx.beginPath();
        ctx.moveTo(
          cx - dir.dc * arrowLen * 0.5,
          cy - dir.dr * arrowLen * 0.5,
        );
        ctx.lineTo(ax, ay);
        ctx.stroke();

        const headLen = CELL * 0.13;
        const angle = Math.atan2(dir.dr, dir.dc);
        ctx.beginPath();
        ctx.moveTo(ax, ay);
        ctx.lineTo(
          ax - headLen * Math.cos(angle - 0.6),
          ay - headLen * Math.sin(angle - 0.6),
        );
        ctx.moveTo(ax, ay);
        ctx.lineTo(
          ax - headLen * Math.cos(angle + 0.6),
          ay - headLen * Math.sin(angle + 0.6),
        );
        ctx.stroke();
        ctx.restore();
      }
    }
  }
}
