import { 
  getColors, EMPTY, WALL, START, GOAL, CLOSED, OPEN, PATH, 
  HIGHWAY, TRAFFIC, MUD, CELL_MIN, CELL_MAX 
} from './config.js';
import { heuristic as heuristicFunc } from './pathfinding/heuristics.js';
import { drawRLOverlay } from './pathfinding/qlearning.js';

export let canvas = document.getElementById("grid");
export let ctx = canvas ? canvas.getContext("2d") : null;
export let rippleCanvas = document.getElementById("rippleCanvas");
export let rctx = rippleCanvas ? rippleCanvas.getContext("2d") : null;
export let dragGhost = document.getElementById("dragGhost");

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
  isDrawing = v;
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
  if (!dragGhost) return;
  dragGhost.textContent = emoji;
  dragGhost.style.display = "flex";
  dragGhost.style.borderColor = color || "var(--accent)";
  dragGhost.style.boxShadow = `0 0 18px ${color || "rgba(0,229,160,0.5)"}`;
  ghostVisible = true;
}

export function hideGhost() {
  if (dragGhost) dragGhost.style.display = "none";
  ghostVisible = false;
}

export function startAgentAnimation(path) {
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

export function drawGrid(searchState, lastSolutionPath, animTimer, pathAnimInterval) {
  const routeOverlay =
    searchState &&
    searchState.finalPath &&
    searchState.finalPath.length > 1
      ? searchState.finalPath
      : lastSolutionPath && lastSolutionPath.length > 1
        ? lastSolutionPath
        : null;
  const hasFinalRoute = !!routeOverlay;
  const livePaint =
    animTimer ||
    pathAnimInterval ||
    (searchState && !searchState.done) ||
    hasFinalRoute;
    
  if (livePaint) {
    if (animFrame) {
      cancelAnimationFrame(animFrame);
      animFrame = null;
    }
    _drawGrid(searchState, lastSolutionPath);
    return;
  }
  if (animFrame) cancelAnimationFrame(animFrame);
  animFrame = requestAnimationFrame(() => _drawGrid(searchState, lastSolutionPath));
}

function _drawGrid(searchState, lastSolutionPath) {
  const C = getColors();
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = C[EMPTY];
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  const showCost = document.getElementById("showCost")?.checked || (searchState && !searchState.done);
  const isDarkMode = document.documentElement.getAttribute("data-theme") !== "light";
  const fogActive = searchState && !searchState.done;

  function drawTerrain(r, c, x, y) {
    const t = terrainGrid[r] && terrainGrid[r][c];
    if (!t) return;
    if (t === HIGHWAY) {
      ctx.fillStyle = C[HIGHWAY];
      ctx.fillRect(x, y, CELL, CELL);
      ctx.save();
      ctx.strokeStyle = C.highwayStroke;
      ctx.lineWidth = 0.7;
      ctx.setLineDash([3, 3]);
      ctx.beginPath();
      ctx.moveTo(x + CELL / 2, y + 1);
      ctx.lineTo(x + CELL / 2, y + CELL - 1);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.restore();
    } else if (t === TRAFFIC) {
      ctx.fillStyle = C[TRAFFIC];
      ctx.fillRect(x, y, CELL, CELL);
      ctx.strokeStyle = C.trafficStroke;
      ctx.lineWidth = 0.5;
      ctx.strokeRect(x + 0.5, y + 0.5, CELL - 1, CELL - 1);
    } else if (t === MUD) {
      ctx.fillStyle = C[MUD];
      ctx.fillRect(x, y, CELL, CELL);
      ctx.strokeStyle = C.mudStroke;
      ctx.lineWidth = 0.5;
      ctx.strokeRect(x + 0.5, y + 0.5, CELL - 1, CELL - 1);
      ctx.fillStyle = C.mudStroke;
      for (let i = 0; i < 3; i++) {
        const mx = x + 3 + ((i * 5) % (CELL - 6));
        const my = y + 3 + ((i * 7) % (CELL - 6));
        ctx.beginPath();
        ctx.arc(mx, my, 1, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const x = c * CELL, y = r * CELL, s = grid[r][c];
      if (s === EMPTY) {
        ctx.fillStyle = C[EMPTY];
        ctx.fillRect(x, y, CELL, CELL);
        drawTerrain(r, c, x, y);
        if (fogActive) {
          ctx.fillStyle = isDarkMode ? "rgba(5,11,20,0.45)" : "rgba(224,236,248,0.5)";
          ctx.fillRect(x, y, CELL, CELL);
        }
        if (!terrainGrid[r][c]) {
          ctx.strokeStyle = C.gridStroke;
          ctx.lineWidth = 0.5;
          ctx.strokeRect(x + 0.5, y + 0.5, CELL - 1, CELL - 1);
        }
      } else if (s === WALL) {
        const grd = ctx.createLinearGradient(x, y, x + CELL, y + CELL);
        grd.addColorStop(0, C[WALL]);
        grd.addColorStop(1, C.wallStroke);
        ctx.fillStyle = grd;
        ctx.fillRect(x, y, CELL, CELL);
        ctx.strokeStyle = C.wallStroke;
        ctx.lineWidth = 0.5;
        ctx.strokeRect(x + 0.5, y + 0.5, CELL - 1, CELL - 1);
      } else if (s === CLOSED) {
        drawTerrain(r, c, x, y);
        const nd = searchState && searchState.nodeMap && searchState.nodeMap[`${r},${c}`];
        if (nd && nd.f > 0) {
          const h0 = heuristicFunc(startNode, goalNode) || 1;
          const heat = Math.min(1, nd.f / (h0 * 3));
          const r1 = Math.round(0 + heat * 247);
          const g1 = Math.round(184 - heat * 54);
          const b1 = Math.round(255 - heat * 206);
          ctx.fillStyle = `rgba(${r1},${g1},${b1},${isDarkMode ? 0.45 : 0.35})`;
        } else {
          ctx.fillStyle = C[CLOSED];
        }
        ctx.fillRect(x, y, CELL, CELL);
        ctx.strokeStyle = C.closedStroke;
        ctx.lineWidth = 0.5;
        ctx.strokeRect(x + 0.5, y + 0.5, CELL - 1, CELL - 1);
      } else if (s === OPEN) {
        drawTerrain(r, c, x, y);
        ctx.fillStyle = C[OPEN];
        ctx.fillRect(x, y, CELL, CELL);
        ctx.strokeStyle = "rgba(247,183,49,0.4)";
        ctx.lineWidth = 0.5;
        ctx.strokeRect(x + 0.5, y + 0.5, CELL - 1, CELL - 1);
        if (showCost && searchState) {
          const nd = searchState.nodeMap && searchState.nodeMap[`${r},${c}`];
          if (nd) {
            ctx.fillStyle = isDarkMode ? "rgba(0,0,0,0.7)" : "rgba(0,0,0,0.5)";
            ctx.font = `${CELL * 0.3}px IBM Plex Mono`;
            ctx.textAlign = "center";
            ctx.textBaseline = "middle";
            ctx.fillText(Math.round(nd.f), x + CELL / 2, y + CELL / 2);
          }
        }
      } else if (s === PATH) {
        drawTerrain(r, c, x, y);
        ctx.fillStyle = C[PATH] + "33";
        ctx.fillRect(x, y, CELL, CELL);
        ctx.strokeStyle = C[PATH] + "66";
        ctx.lineWidth = 0.5;
        ctx.strokeRect(x + 0.5, y + 0.5, CELL - 1, CELL - 1);
      } else if (s === START) {
        ctx.fillStyle = C[START] + "22";
        ctx.fillRect(x, y, CELL, CELL);
        const t = Date.now() / 1000;
        const pulse = 0.5 + 0.5 * Math.sin(t * 3);
        ctx.strokeStyle = C[START];
        ctx.lineWidth = 1.5 + pulse;
        ctx.strokeRect(x + 1, y + 1, CELL - 2, CELL - 2);
        ctx.fillStyle = C[START];
        ctx.font = `bold ${CELL * 0.5}px Orbitron`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText("S", x + CELL / 2, y + CELL / 2 + 1);
      } else if (s === GOAL) {
        ctx.fillStyle = C[GOAL] + "22";
        ctx.fillRect(x, y, CELL, CELL);
        ctx.strokeStyle = C[GOAL];
        ctx.lineWidth = 1.5;
        ctx.strokeRect(x + 1, y + 1, CELL - 2, CELL - 2);
        ctx.fillStyle = C[GOAL];
        ctx.font = `bold ${CELL * 0.5}px Orbitron`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText("G", x + CELL / 2, y + CELL / 2 + 1);
      }
    }
  }

  drawRLOverlay(ctx, CELL, ROWS, COLS, grid);

  if (searchState && !searchState.done && searchState.livePath && searchState.livePath.length > 1) {
    const lp = searchState.livePath;
    ctx.strokeStyle = isDarkMode ? "rgba(247,183,49,0.5)" : "rgba(180,110,0,0.5)";
    ctx.lineWidth = 2;
    ctx.lineJoin = "round";
    ctx.lineCap = "round";
    ctx.setLineDash([5, 4]);
    ctx.beginPath();
    ctx.moveTo(lp[0].c * CELL + CELL / 2, lp[0].r * CELL + CELL / 2);
    for (let i = 1; i < lp.length; i++)
      ctx.lineTo(lp[i].c * CELL + CELL / 2, lp[i].r * CELL + CELL / 2);
    ctx.stroke();
    ctx.setLineDash([]);
  }

  const p = searchState && searchState.finalPath && searchState.finalPath.length > 1 
    ? searchState.finalPath 
    : lastSolutionPath && lastSolutionPath.length > 1 
      ? lastSolutionPath 
      : null;
      
  if (p && p[0] && Number.isFinite(p[0].c)) {
    ctx.save();
    ctx.lineJoin = "round";
    ctx.lineCap = "round";
    ctx.setLineDash([]);
    ctx.beginPath();
    ctx.moveTo(p[0].c * CELL + CELL / 2, p[0].r * CELL + CELL / 2);
    for (let i = 1; i < p.length; i++)
      ctx.lineTo(p[i].c * CELL + CELL / 2, p[i].r * CELL + CELL / 2);
    ctx.strokeStyle = isDarkMode ? "rgba(0,229,160,0.95)" : "rgba(0,149,106,0.95)";
    ctx.lineWidth = Math.max(3, CELL / 6);
    ctx.shadowColor = isDarkMode ? "#00e5a0" : "#00956a";
    ctx.shadowBlur = 4;
    ctx.stroke();
    ctx.shadowBlur = 0;
    ctx.strokeStyle = isDarkMode ? "rgba(247,183,49,0.95)" : "rgba(200,130,20,0.92)";
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.strokeStyle = "rgba(255,255,255,0.5)";
    ctx.lineWidth = 1;
    ctx.stroke();

    if (!agentAnim && p.length > 2) {
      const now = Date.now() / 1000;
      const shimmer = (now * 0.6) % 1;
      for (let i = 0; i < p.length - 1; i++) {
        const t = i / (p.length - 1);
        const dist = Math.abs(t - shimmer);
        const wave = Math.max(0, 1 - dist * 14);
        if (wave < 0.02) continue;
        ctx.beginPath();
        ctx.moveTo(p[i].c * CELL + CELL / 2, p[i].r * CELL + CELL / 2);
        ctx.lineTo(p[i+1].c * CELL + CELL / 2, p[i+1].r * CELL + CELL / 2);
        ctx.strokeStyle = `rgba(255,255,255,${wave * 0.7})`;
        ctx.lineWidth = Math.max(4, CELL / 4);
        ctx.stroke();
      }
    }
    ctx.restore();
  }
}

export function getCellFromEvent(e) {
  const rect = canvas.getBoundingClientRect();
  return {
    r: Math.floor(((e.clientY - rect.top) * (canvas.height / rect.height)) / CELL),
    c: Math.floor(((e.clientX - rect.left) * (canvas.width / rect.width)) / CELL),
  };
}

export function updateStartNode(r, c) { startNode = { r, c }; }
export function updateGoalNode(r, c) { goalNode = { r, c }; }
export function setGrid(g) { grid = g; }
export function setDrawing(v) { isDrawing = v; }
