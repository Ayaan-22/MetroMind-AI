import { 
  getColors, EMPTY, WALL, START, GOAL, CLOSED, OPEN, PATH, 
  HIGHWAY, TRAFFIC, MUD, CELL_MIN, CELL_MAX 
} from './config.js';

export const canvas = document.getElementById("grid");
export const ctx = canvas.getContext("2d");
export const rippleCanvas = document.getElementById("rippleCanvas");
export const rctx = rippleCanvas.getContext("2d");
export const dragGhost = document.getElementById("dragGhost");

export let COLS = 50;
export let ROWS = 30;
export let CELL = 19;
export let grid = [];
export let terrainGrid = [];
export let startNode = null;
export let goalNode = null;
export let isDrawing = false;

export const ripples = [];
export let ghostVisible = false;

export let animFrame = null;
export let agentAnim = null;
export let agentProgress = 0;
export let shimmerPhase = 0;
export let agentPath = null;

export function setGridDims(c, r) {
  COLS = c;
  ROWS = r;
}

export function setCellSize(s) {
  CELL = s;
}

export function setIsDrawing(v) {
  isDrawing = true;
}

export function computeCellSize() {
  const cont = document.querySelector(".grid-container");
  if (!cont) return CELL;
  const availW = cont.clientWidth - 24;
  const availH = cont.clientHeight - 24;
  const byW = Math.floor(availW / COLS);
  const byH = Math.floor(availH / ROWS);
  return Math.max(CELL_MIN, Math.min(CELL_MAX, Math.min(byW, byH)));
}

export function resizeCanvas(drawCallback) {
  CELL = computeCellSize();
  canvas.width = COLS * CELL;
  canvas.height = ROWS * CELL;
  if (drawCallback) drawCallback();
}

export function initGrid() {
  grid = [];
  terrainGrid = [];
  for (let r = 0; r < ROWS; r++) {
    grid[r] = [];
    terrainGrid[r] = [];
    for (let c = 0; c < COLS; c++) {
      grid[r][c] = EMPTY;
      terrainGrid[r][c] = 0;
    }
  }
  startNode = { r: Math.min(3, ROWS - 1), c: Math.min(3, COLS - 1) };
  goalNode = { r: Math.max(0, ROWS - 4), c: Math.max(0, COLS - 4) };
  grid[startNode.r][startNode.c] = START;
  grid[goalNode.r][goalNode.c] = GOAL;
}

export function syncRippleCanvas() {
  const rect = canvas.getBoundingClientRect();
  rippleCanvas.style.left = canvas.offsetLeft + "px";
  rippleCanvas.style.top = canvas.offsetTop + "px";
  rippleCanvas.style.width = canvas.offsetWidth + "px";
  rippleCanvas.style.height = canvas.offsetHeight + "px";
  rippleCanvas.width = canvas.offsetWidth;
  rippleCanvas.height = canvas.offsetHeight;
}

export function spawnRipple(col, row) {
  const sx = canvas.offsetWidth / COLS;
  const sy = canvas.offsetHeight / ROWS;
  ripples.push({
    x: (col + 0.5) * sx,
    y: (row + 0.5) * sy,
    r: 0,
    maxR: Math.max(sx, sy) * 1.8,
    alpha: 0.7,
    t: 0,
  });
}

export function rippleLoop() {
  rctx.clearRect(0, 0, rippleCanvas.width, rippleCanvas.height);
  for (let i = ripples.length - 1; i >= 0; i--) {
    const rp = ripples[i];
    rp.t += 0.06;
    rp.r = rp.maxR * rp.t;
    rp.alpha = 0.7 * (1 - rp.t);
    if (rp.t >= 1) {
      ripples.splice(i, 1);
      continue;
    }
    rctx.beginPath();
    rctx.arc(rp.x, rp.y, rp.r, 0, Math.PI * 2);
    rctx.strokeStyle = `rgba(0,229,160,${rp.alpha})`;
    rctx.lineWidth = 1.5 * (1 - rp.t);
    rctx.stroke();
  }
  requestAnimationFrame(rippleLoop);
}

export function showGhost(emoji, color) {
  dragGhost.textContent = emoji;
  dragGhost.style.display = "flex";
  dragGhost.style.borderColor = color || "var(--accent)";
  dragGhost.style.boxShadow = `0 0 18px ${color || "rgba(0,229,160,0.5)"}`;
  ghostVisible = true;
}

export function hideGhost() {
  dragGhost.style.display = "none";
  ghostVisible = false;
}

export function startAgentAnimation(path, drawCallback) {
  if (agentAnim) cancelAnimationFrame(agentAnim);
  agentPath = path;
  agentProgress = 0;
  shimmerPhase = 0;
  function tick() {
    agentProgress = Math.min(1, agentProgress + 0.007);
    shimmerPhase += 0.05;
    drawAgentOverlay(COLS, ROWS);
    if (agentProgress < 1) agentAnim = requestAnimationFrame(tick);
    else {
      agentAnim = null;
    }
  }
  agentAnim = requestAnimationFrame(tick);
}

export function stopAgentAnimation() {
  if (agentAnim) {
    cancelAnimationFrame(agentAnim);
    agentAnim = null;
  }
  agentPath = null;
  rctx.clearRect(0, 0, rippleCanvas.width, rippleCanvas.height);
}

export function drawAgentOverlay(cols, rows) {
  if (!agentPath || agentPath.length < 2) return;
  syncRippleCanvas();
  rctx.clearRect(0, 0, rippleCanvas.width, rippleCanvas.height);
  const sx = rippleCanvas.width / cols;
  const sy = rippleCanvas.height / rows;
  const totalLen = agentPath.length - 1;
  
  for (let i = 0; i < agentPath.length - 1; i++) {
    const t = i / totalLen;
    const wave =
      0.3 +
      0.7 * Math.max(0, Math.sin((t - shimmerPhase * 0.5) * Math.PI * 4));
    if (t > agentProgress) break;
    const p = agentPath[i],
      q = agentPath[i + 1];
    rctx.beginPath();
    rctx.moveTo((p.c + 0.5) * sx, (p.r + 0.5) * sy);
    rctx.lineTo((q.c + 0.5) * sx, (q.r + 0.5) * sy);
    rctx.strokeStyle = `rgba(247,183,49,${wave * 0.8})`;
    rctx.lineWidth = 3;
    rctx.stroke();
  }
  
  const idx = Math.min(totalLen - 1, Math.floor(agentProgress * totalLen));
  const frac = agentProgress * totalLen - idx;
  const A = agentPath[idx],
    B = agentPath[Math.min(idx + 1, totalLen)];
  const ax = (A.c + 0.5 + (B.c - A.c) * frac) * sx;
  const ay = (A.r + 0.5 + (B.r - A.r) * frac) * sy;
  
  const grd = rctx.createRadialGradient(ax, ay, 0, ax, ay, sx * 1.5);
  grd.addColorStop(0, "rgba(247,183,49,0.5)");
  grd.addColorStop(1, "rgba(247,183,49,0)");
  rctx.beginPath();
  rctx.arc(ax, ay, sx * 1.5, 0, Math.PI * 2);
  rctx.fillStyle = grd;
  rctx.fill();
  
  rctx.beginPath();
  rctx.arc(ax, ay, Math.max(3, sx * 0.35), 0, Math.PI * 2);
  rctx.fillStyle = "#f7b731";
  rctx.fill();
  rctx.strokeStyle = "#fff";
  rctx.lineWidth = 1;
  rctx.stroke();
  
  rctx.font = `${Math.max(8, sx * 0.5)}px serif`;
  rctx.textAlign = "center";
  rctx.textBaseline = "middle";
  rctx.fillText("🚁", ax, ay);
}

export function _drawGrid(searchState, lastSolutionPath, currentAlgorithm, allowDiagonals) {
  const C = getColors();
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  const routeOverlay =
    searchState &&
    searchState.finalPath &&
    searchState.finalPath.length > 1
      ? searchState.finalPath
      : lastSolutionPath && lastSolutionPath.length > 1
        ? lastSolutionPath
        : null;

  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const s = grid[r][c];
      const x = c * CELL,
        y = r * CELL;
      const t = terrainGrid[r] && terrainGrid[r][c];

      // Base terrain
      if (t === HIGHWAY) ctx.fillStyle = C[HIGHWAY];
      else if (t === TRAFFIC) ctx.fillStyle = C[TRAFFIC];
      else if (t === MUD) ctx.fillStyle = C[MUD];
      else ctx.fillStyle = C[EMPTY];
      ctx.fillRect(x, y, CELL, CELL);

      // Node state
      if (s === WALL) {
        ctx.fillStyle = C[WALL];
        ctx.fillRect(x + 1, y + 1, CELL - 2, CELL - 2);
        ctx.strokeStyle = C.wallStroke;
        ctx.strokeRect(x + 0.5, y + 0.5, CELL - 1, CELL - 1);
      } else if (s === START || s === GOAL) {
        ctx.fillStyle = C[s];
        ctx.shadowColor = C[s];
        ctx.shadowBlur = 8;
        ctx.fillRect(x + 1, y + 1, CELL - 2, CELL - 2);
        ctx.shadowBlur = 0;
        ctx.fillStyle = "#fff";
        ctx.font = `${Math.floor(CELL * 0.6)}px sans-serif`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(s === START ? "S" : "G", x + CELL / 2, y + CELL / 2);
      } else if (s === OPEN) {
        ctx.fillStyle = C[OPEN];
        ctx.fillRect(x + 1, y + 1, CELL - 2, CELL - 2);
      } else if (s === CLOSED) {
        ctx.fillStyle = C[CLOSED];
        ctx.fillRect(x + 1, y + 1, CELL - 2, CELL - 2);
        ctx.strokeStyle = C.closedStroke;
        ctx.lineWidth = 0.5;
        ctx.strokeRect(x + 1, y + 1, CELL - 2, CELL - 2);
      } else if (s === PATH) {
        ctx.fillStyle = C[PATH] + "44";
        ctx.fillRect(x + 1, y + 1, CELL - 2, CELL - 2);
      }

      // Terrain accents
      if (t === HIGHWAY) {
        ctx.strokeStyle = C.highwayStroke;
        ctx.lineWidth = 1;
        ctx.strokeRect(x + 2, y + 2, CELL - 4, CELL - 4);
      } else if (t === TRAFFIC) {
        ctx.strokeStyle = C.trafficStroke;
        ctx.lineWidth = 0.5;
        ctx.setLineDash([2, 2]);
        ctx.strokeRect(x + 2, y + 2, CELL - 4, CELL - 4);
        ctx.setLineDash([]);
      } else if (t === MUD) {
        ctx.strokeStyle = C.mudStroke;
        ctx.lineWidth = 1;
        ctx.strokeRect(x + 2, y + 2, CELL - 4, CELL - 4);
      }

      // Grid lines
      ctx.strokeStyle = C.gridStroke;
      ctx.lineWidth = 0.5;
      ctx.strokeRect(x, y, CELL, CELL);
    }
  }

  // Draw Path Line
  if (routeOverlay && routeOverlay.length > 1) {
    ctx.save();
    ctx.lineJoin = "round";
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(
      (routeOverlay[0].c + 0.5) * CELL,
      (routeOverlay[0].r + 0.5) * CELL,
    );
    for (let i = 1; i < routeOverlay.length; i++) {
        ctx.lineTo(
          (routeOverlay[i].c + 0.5) * CELL,
          (routeOverlay[i].r + 0.5) * CELL,
        );
    }
    ctx.strokeStyle = C.pathLine;
    ctx.lineWidth = Math.max(2, CELL * 0.15);
    ctx.shadowColor = C.pathLine;
    ctx.shadowBlur = 6;
    ctx.stroke();
    ctx.shadowBlur = 0;
    
    // Glossy overlay
    ctx.strokeStyle = "rgba(255,255,255,0.3)";
    ctx.lineWidth = Math.max(1, CELL * 0.05);
    ctx.stroke();
    ctx.restore();
  }
}


export function getCellFromEvent(e) {
  const rect = canvas.getBoundingClientRect();
  return {
    r: Math.floor(
      ((e.clientY - rect.top) * (canvas.height / rect.height)) / CELL,
    ),
    c: Math.floor(
      ((e.clientX - rect.left) * (canvas.width / rect.width)) / CELL,
    ),
  };
}

export function updateStartNode(r, c) {
  startNode = { r, c };
}

export function updateGoalNode(r, c) {
  goalNode = { r, c };
}

export function setGrid(g) {
  grid = g;
}

export function setDrawing(v) {
  isDrawing = v;
}
