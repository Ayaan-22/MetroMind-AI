import * as Config from './config.js';
import * as UI from './ui.js';
import * as Grid from './grid.js';
import * as Heuristics from './pathfinding/heuristics.js';
import * as Algorithms from './pathfinding/algorithms.js';
import * as QLearning from './pathfinding/qlearning.js';
import * as Maze from './maze.js';
import * as History from './history.js';

// ═══════════════════════════════════════════════════════
// STATE
// ═══════════════════════════════════════════════════════
let currentAlgorithm = "astar";
let currentTool = "wall";
let currentHeuristic = "manhattan";
let allowDiagonals = false;
let animSpeed = 50;
let heuristicWeight = 1.0;

let searchState = null;
let animTimer = null;
let lastSolutionPath = null;
let stepCount = 0;
let results = []; // For comparison mode if needed

// ═══════════════════════════════════════════════════════
// INITIALIZATION
// ═══════════════════════════════════════════════════════
function init() {
  Grid.setGridDims(Config.COLS_INITIAL, Config.ROWS_INITIAL);
  Grid.initGrid();
  Grid.resizeCanvas(draw);
  Grid.rippleLoop();
  
  UI.triggerGlitch();
  UI.startPortrait(currentAlgorithm);
  UI.showToast("🚀 MetroMind AI v9 Loaded");
  UI.logEntry("success", "System online. Neural grid initialized.");
  
  setupEventListeners();
  Grid.syncRippleCanvas();
  
  // Initial UI sync
  updateSpeed(animSpeed);
  updateWeight(heuristicWeight);
}

function draw() {
  Grid._drawGrid(searchState, lastSolutionPath, currentAlgorithm, allowDiagonals);
  if (QLearning.rlAgent) {
    QLearning.drawRLOverlay(Grid.ctx, Grid.CELL, Grid.ROWS, Grid.COLS, Grid.grid, allowDiagonals);
  }
}

// ═══════════════════════════════════════════════════════
// CORE LOGIC
// ═══════════════════════════════════════════════════════
function startSearch() {
  if (Grid.startNode.r === Grid.goalNode.r && Grid.startNode.c === Grid.goalNode.c) {
    UI.showToast("⚠ Start and goal cannot overlap");
    return;
  }
  if (Grid.grid[Grid.startNode.r][Grid.startNode.c] === Config.WALL || Grid.grid[Grid.goalNode.r][Grid.goalNode.c] === Config.WALL) {
    UI.showToast("⚠ Start or goal placed on wall");
    return;
  }

  stopAnim();
  resetPath(false);
  
  searchState = Algorithms.initSearch(
    currentAlgorithm,
    Grid.startNode,
    Grid.goalNode,
    Grid.grid,
    Grid.terrainGrid,
    allowDiagonals,
    heuristicWeight,
    currentHeuristic
  );
  
  if (!searchState) return;
  
  History.clearHistory();
  UI.clearSparklines();
  UI.triggerGlitch();
  UI.updateProgressRing(0, Grid.ROWS * Grid.COLS * 0.7, "Searching…");
  
  const btn = document.getElementById("playBtn");
  btn.textContent = "⏸ PAUSE";
  btn.classList.add("running");
  
  UI.setStatus("running", "Searching…");
  UI.logEntry("info", `▶ Starting ${currentAlgorithm.toUpperCase()} search…`);
  
  document.getElementById("stepBtn").disabled = false;
  
  const tickMs = Math.max(5, Config.MAX_DELAY - (animSpeed * 1.1));
  animTimer = setInterval(() => {
    if (!searchState || searchState.done) {
      stopAnim();
      onSearchComplete();
      return;
    }
    const batch = Math.max(1, Math.floor(animSpeed / 10));
    for (let i = 0; i < batch && searchState && !searchState.done; i++) {
      stepSearch();
    }
  }, tickMs);
}

function resetPath(silent = false) {
  stopAnim();
  Grid.stopAgentAnimation();
  searchState = null;
  lastSolutionPath = null;
  stepCount = 0;
  History.clearHistory();
  
  for (let r = 0; r < Grid.ROWS; r++) {
    for (let c = 0; c < Grid.COLS; c++) {
      const val = Grid.grid[r][c];
      if (val === Config.CLOSED || val === Config.OPEN || val === Config.PATH) {
        Grid.grid[r][c] = Config.EMPTY;
      }
    }
  }
  
  if (Grid.startNode) Grid.grid[Grid.startNode.r][Grid.startNode.c] = Config.START;
  if (Grid.goalNode) Grid.grid[Grid.goalNode.r][Grid.goalNode.c] = Config.GOAL;
  
  if (!silent) {
    UI.setStatus("", "Ready — draw walls then click ▶ FIND PATH");
    UI.logEntry("info", "↺ Path reset");
    UI.updateProgressRing(0, 1, "Ready");
  }
  
  document.getElementById("stepBtn").disabled = true;
  const playBtn = document.getElementById("playBtn");
  playBtn.textContent = "▶ FIND PATH";
  playBtn.classList.remove("running");
  
  updateStats(0, "—", 0, "—");
  draw();
}

function clearAll() {
  resetPath(true);
  if (QLearning.rlAgent) QLearning.resetRLAgent();
  Grid.initGrid();
  UI.setStatus("", "Canvas cleared");
  UI.logEntry("info", "✕ Grid cleared");
  draw();
}

function togglePlayPause() {
  if (!searchState || searchState.done) {
    startSearch();
    return;
  }
  if (animTimer) {
    stopAnim();
    UI.setStatus("running", "Paused");
    document.getElementById("playBtn").textContent = "▶ RESUME";
    document.getElementById("playBtn").classList.remove("running");
    document.getElementById("stepBtn").disabled = false;
  } else {
    const tickMs = Math.max(5, Config.MAX_DELAY - (animSpeed * 1.1));
    animTimer = setInterval(() => {
      if (!searchState || searchState.done) {
        stopAnim();
        onSearchComplete();
        return;
      }
      const batch = Math.max(1, Math.floor(animSpeed / 10));
      for (let i = 0; i < batch && searchState && !searchState.done; i++) {
        stepSearch();
      }
    }, tickMs);
    UI.setStatus("running", "Searching…");
    document.getElementById("playBtn").textContent = "⏸ PAUSE";
    document.getElementById("playBtn").classList.add("running");
    document.getElementById("stepBtn").disabled = true;
  }
}

function stopAnim() {
  if (animTimer) {
    clearInterval(animTimer);
    animTimer = null;
  }
}

function stepSearch() {
  if (!searchState) {
    startSearch();
    stopAnim(); // Don't auto-run in step mode
    return;
  }
  if (searchState.done) return;

  Algorithms.searchStep(
    searchState,
    Grid.grid,
    Grid.terrainGrid,
    Grid.COLS,
    Grid.ROWS,
    allowDiagonals,
    Grid.goalNode,
    Grid.startNode,
    heuristicWeight,
    currentHeuristic,
    UI.logEntry,
    UI.setStatus,
    UI.showToast
  );
  
  stepCount++;
  document.getElementById("stepCounter").textContent = "step " + stepCount;

  if (stepCount % 5 === 0) {
    History.snapshotHistory(searchState, Grid.grid);
  }

  if (searchState.done) {
    onSearchComplete();
  }
  draw();
  updateStats();
}

function onSearchComplete() {
  stopAnim();
  const playBtn = document.getElementById("playBtn");
  playBtn.textContent = "▶ FIND PATH";
  playBtn.classList.remove("running");
  document.getElementById("stepBtn").disabled = true;
  
  if (searchState && searchState.finalPath) {
    lastSolutionPath = searchState.finalPath;
    UI.updateProgressRing(1, 1, "Path found!");
    Grid.startAgentAnimation(lastSolutionPath);
  }
}

function updateStats() {
  if (!searchState) return;
  const n = searchState.explored;
  const p = searchState.finalPath ? searchState.finalPath.length : "—";
  const o = searchState.openSet ? (searchState.openSet.size || searchState.openSet.length || 0) : 0;
  const c = searchState.solutionCost ? Math.round(searchState.solutionCost) : "—";
  
  document.getElementById("statNodes").textContent = n;
  document.getElementById("statPath").textContent = p;
  document.getElementById("statOpen").textContent = o;
  document.getElementById("statCost").textContent = c;
  
  // HUD
  const hn = document.getElementById("hudNodes"),
        hp = document.getElementById("hudPath"),
        hc = document.getElementById("hudCost");
  if (hn) hn.textContent = n;
  if (hp) hp.textContent = p;
  if (hc) hc.textContent = c;

  UI.updateProgressRing(n, Grid.ROWS * Grid.COLS * 0.7, "Searching…");
  UI.updateSparklines(n, p === "—" ? 0 : p, o, c === "—" ? 0 : c);
}

// ═══════════════════════════════════════════════════════
// UI HELPERS
// ═══════════════════════════════════════════════════════
function changeAlgorithm(algo) {
  currentAlgorithm = algo;
  document.querySelectorAll(".algo-btn").forEach(b => b.classList.remove("active"));
  document.getElementById(`btn-algo-${algo}`)?.classList.add("active");
  
  UI.startPortrait(algo);
  UI.logEntry("info", `→ Switched to ${algo.toUpperCase()}`);
  
  const badge = document.getElementById("algoBadge");
  if (badge) badge.textContent = algo.charAt(0).toUpperCase() + algo.slice(1);
  
  resetPath(true);
}

function setHeuristic(h) {
  currentHeuristic = h;
  document.querySelectorAll(".heur-btn").forEach(b => b.classList.remove("active"));
  document.getElementById(`heur-${h}`)?.classList.add("active");
  
  const badge = document.getElementById("heurBadge");
  if (badge) badge.textContent = h.charAt(0).toUpperCase() + h.slice(1);
  
  const formulas = {
    manhattan: "|Δr|+|Δc|",
    euclidean: "√(Δr²+Δc²)",
    chebyshev: "max(|Δr|,|Δc|)",
    octile: "min(|Δ|)+(√2-1)max(|Δ|)"
  };
  document.getElementById("heurFormula").textContent = formulas[h] || "";
  
  UI.logEntry("info", `Heuristic: ${h}`);
  resetPath(true);
}

function setTool(tool) {
  currentTool = tool;
  document.querySelectorAll(".tool-btn").forEach(b => b.classList.remove("active"));
  document.getElementById(`tool${tool.charAt(0).toUpperCase() + tool.slice(1)}`)?.classList.add("active");
}

function updateSpeed(val) {
  animSpeed = parseInt(val);
  document.getElementById("speedLabel").textContent = (110 - animSpeed) + "ms";
}

function updateWeight(val) {
  heuristicWeight = parseFloat(val);
  document.getElementById("weightLabel").textContent = heuristicWeight.toFixed(1) + "×";
}

function updateGridSize() {
  const cols = parseInt(document.getElementById("mazeCols").value);
  const rows = parseInt(document.getElementById("mazeRows").value);
  if (cols >= 10 && cols <= 60 && rows >= 10 && rows <= 60) {
    Grid.setGridDims(cols, rows);
    Grid.initGrid();
    Grid.resizeCanvas(draw);
    resetPath(true);
    UI.logEntry("info", `Grid resized to ${cols}×${rows}`);
  }
}

function applyPreset(c, r) {
  document.getElementById("mazeCols").value = c;
  document.getElementById("mazeRows").value = r;
  updateGridSize();
}

// ═══════════════════════════════════════════════════════
// EXPORTS
// ═══════════════════════════════════════════════════════
function exportStatsCSV() {
  const csv = [
    ["Metric", "Value"],
    ["Algorithm", currentAlgorithm],
    ["Heuristic", currentHeuristic],
    ["Weight", heuristicWeight],
    ["Nodes Explored", document.getElementById("statNodes").textContent],
    ["Path Length", document.getElementById("statPath").textContent],
    ["Cost", document.getElementById("statCost").textContent],
    ["Timestamp", new Date().toLocaleString()]
  ].map(r => r.join(",")).join("\n");
  
  const blob = new Blob([csv], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `MetroMind_Stats_${Date.now()}.csv`;
  a.click();
  UI.showToast("📊 Stats exported");
}

function exportGridJSON() {
  const data = {
    grid: Grid.grid,
    terrain: Grid.terrainGrid,
    rows: Grid.ROWS,
    cols: Grid.COLS,
    start: Grid.startNode,
    goal: Grid.goalNode
  };
  const blob = new Blob([JSON.stringify(data)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `MetroMind_Grid_${Date.now()}.json`;
  a.click();
  UI.showToast("🗂 Grid exported");
}

function exportLog() {
  const text = Array.from(document.getElementById("algoLog").children)
    .map(el => `[${el.className.split(' ')[1]}] ${el.textContent}`)
    .join("\n");
  const blob = new Blob([text], { type: 'text/plain' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `MetroMind_Log_${Date.now()}.txt`;
  a.click();
}

// ═══════════════════════════════════════════════════════
// EVENT LISTENERS
// ═══════════════════════════════════════════════════════
function setupEventListeners() {
  // Navigation & UI Panels
  document.getElementById("sidebarToggleBtn").addEventListener("click", () => UI.toggleSidebar(() => Grid.resizeCanvas(draw)));
  document.getElementById("sidebarTab").addEventListener("click", () => UI.toggleSidebar(() => Grid.resizeCanvas(draw)));
  document.getElementById("sidebarBackdrop").addEventListener("click", UI.closeSidebarMobile);
  document.getElementById("rpToggleBtn").addEventListener("click", () => UI.toggleRightPanel(() => Grid.resizeCanvas(draw)));
  document.getElementById("rpToggle").addEventListener("click", () => UI.toggleRightPanel(() => Grid.resizeCanvas(draw)));
  document.getElementById("themeBtn").addEventListener("click", () => UI.toggleTheme(draw));
  
  // Section Toggles
  ["controls", "speed", "pathopts", "gridsize", "mazes", "heuristic", "terrain", "stats", "rl", "algo", "export"].forEach(id => {
    const el = document.querySelector(`#sec-${id} .sec-label`);
    if (el) el.addEventListener("click", () => UI.toggleSection(`sec-${id}`));
  });

  // Compare & Overlay
  document.getElementById("btnCompare")?.addEventListener("click", () => UI.openCompare());
  document.querySelectorAll("button[title*='Compare']").forEach(btn => {
    btn.onclick = null;
    btn.addEventListener("click", () => UI.openCompare());
  });
  document.querySelector(".compare-close")?.addEventListener("click", () => UI.closeCompare());
  document.querySelectorAll("button[title*='shortcuts']").forEach(btn => {
      btn.onclick = null;
      btn.addEventListener("click", UI.showShortcuts);
  });

  // Main Controls
  document.getElementById("playBtn").addEventListener("click", togglePlayPause);
  document.getElementById("stepBtn").addEventListener("click", stepSearch);
  document.getElementById("btnClearAll")?.addEventListener("click", clearAll);
  document.getElementById("btnResetPath")?.addEventListener("click", () => resetPath());

  // Sliders
  document.getElementById("speedSlider").addEventListener("input", e => updateSpeed(e.target.value));
  document.getElementById("weightSlider").addEventListener("input", e => updateWeight(e.target.value));
  
  // Checkboxes
  document.getElementById("allowDiagonals").addEventListener("change", e => {
    allowDiagonals = e.target.checked;
    UI.showToast(`Diagonals: ${allowDiagonals ? "ON" : "OFF"}`);
    resetPath(true);
  });
  
  document.getElementById("showCost").addEventListener("change", e => {
    draw();
  });
  
  // Grid size
  document.getElementById("mazeCols").addEventListener("change", updateGridSize);
  document.getElementById("mazeRows").addEventListener("change", updateGridSize);
  
  // Grid Presets (data-preset="cols,rows")
  document.querySelectorAll(".maze-btn[data-preset]").forEach(btn => {
    const [c, r] = btn.getAttribute("data-preset").split(",").map(Number);
    btn.addEventListener("click", () => applyPreset(c, r));
  });

  // Maze Logic (data-type="...")
  document.querySelectorAll(".maze-btn[data-type]").forEach(btn => {
    const type = btn.getAttribute("data-type");
    if (type === "recursive") {
      btn.addEventListener("click", () => {
        Maze.generateRecursive(Grid.ROWS, Grid.COLS, Grid.grid, Grid.startNode, Grid.goalNode);
        resetPath(true);
        draw();
      });
    } else if (type === "perlin") {
      btn.addEventListener("click", () => {
        Maze.generatePerlinTerrain(Grid.ROWS, Grid.COLS, Grid.grid, Grid.startNode, Grid.goalNode, Grid.terrainGrid);
        resetPath(true);
        draw();
      });
    } else {
      btn.addEventListener("click", () => {
        Maze.loadMaze(type, Grid.ROWS, Grid.COLS, Grid.grid, Grid.startNode, Grid.goalNode, Grid.terrainGrid);
        resetPath(true);
        draw();
      });
    }
  });

  // Algorithm Buttons (extracted from ID or text)
  document.querySelectorAll(".algo-btn").forEach(btn => {
    const id = btn.id;
    const algo = id.replace("btn-algo-", "");
    btn.addEventListener("click", () => changeAlgorithm(algo));
  });

  // Heuristic Buttons
  document.querySelectorAll(".heur-btn").forEach(btn => {
    const id = btn.id;
    const h = id.replace("heur-", "");
    btn.addEventListener("click", () => setHeuristic(h));
  });

  // Tool Buttons - updated to check ID first or data-tool or similar
  document.querySelectorAll(".tool-btn").forEach(btn => {
    const id = btn.id.toLowerCase();
    let toolName = "";
    if (id.includes("wall")) toolName = "wall";
    else if (id.includes("start")) toolName = "start";
    else if (id.includes("goal")) toolName = "goal";
    else if (id.includes("erase")) toolName = "erase";
    else if (id.includes("highway")) toolName = "highway";
    else if (id.includes("traffic")) toolName = "traffic";
    else if (id.includes("mud")) toolName = "mud";

    if (toolName) {
      btn.addEventListener("click", () => setTool(toolName));
    }
  });

  // Export Buttons
  document.getElementById("exportCSV")?.addEventListener("click", exportStatsCSV);
  document.getElementById("exportJSON")?.addEventListener("click", exportGridJSON);

  // RL Buttons & Toggles
  document.getElementById("rlTrainBtn").addEventListener("click", handleRLTrain);
  document.getElementById("rlPolicyBtn")?.addEventListener("click", handleRLPolicy);
  document.getElementById("rlResetBtn")?.addEventListener("click", QLearning.resetRLAgent);
  // RL Sliders
  document.getElementById("rlAlpha").addEventListener("input", e => {
    document.getElementById("rlAlphaVal").textContent = e.target.value;
  });
  document.getElementById("rlGamma").addEventListener("input", e => {
    document.getElementById("rlGammaVal").textContent = e.target.value;
  });
  document.getElementById("rlEpsilonDecay").addEventListener("input", e => {
    document.getElementById("rlDecayVal").textContent = parseFloat(e.target.value).toFixed(3);
  });
  document.getElementById("rlMaxEpisodes").addEventListener("input", e => {
    document.getElementById("rlMaxEpVal").textContent = e.target.value;
  });
  document.getElementById("rlMaxSteps").addEventListener("input", e => {
    document.getElementById("rlMaxStepsVal").textContent = e.target.value;
  });
  document.getElementById("rlBatchSize").addEventListener("input", e => {
    document.getElementById("rlBatchVal").textContent = e.target.value;
  });

  // RL Overlays
  document.getElementById("rlHeatmapToggle").addEventListener("change", (e) => {
    QLearning.setHeatmap(e.target.checked);
    draw();
  });
  document.getElementById("rlArrowsToggle").addEventListener("change", (e) => {
    QLearning.setArrows(e.target.checked);
    draw();
  });

  // History / Logs
  document.getElementById("btnBack").addEventListener("click", stepBackward);
  document.getElementById("btnFwd").addEventListener("click", stepForward);
  document.getElementById("btnAutoScroll").addEventListener("click", UI.toggleAutoScroll);
  document.getElementById("btnClearLog")?.addEventListener("click", UI.clearLog);
  document.getElementById("btnExportLog")?.addEventListener("click", exportLog);
  document.getElementById("scrollFab").addEventListener("click", UI.jumpToBottom);

  // Fullscreen
  document.getElementById("fsBtn").addEventListener("click", () => UI.toggleFullscreen(() => Grid.resizeCanvas(draw)));
  document.querySelector("#fsHUD button").addEventListener("click", () => UI.toggleFullscreen(() => Grid.resizeCanvas(draw)));

  // Canvas
  Grid.canvas.addEventListener("mousedown", handleMouseDown);
  window.addEventListener("mousemove", handleMouseMove);
  window.addEventListener("mouseup", handleMouseUp);
  window.addEventListener("resize", () => {
    Grid.resizeCanvas(draw);
    Grid.syncRippleCanvas();
  });

  // Keyboard Shortcuts
  document.addEventListener("keydown", handleKeydown);
  document.getElementById("shortcutsOverlay").addEventListener("click", (e) => {
    if (e.target === e.currentTarget) UI.hideShortcuts();
  });
}

function handleMouseDown(e) {
  const { r, c } = Grid.getCellFromEvent(e);
  if (r < 0 || r >= Grid.ROWS || c < 0 || c >= Grid.COLS) return;
  
  if (Grid.grid[r][c] === Config.START || Grid.grid[r][c] === Config.GOAL) {
    Grid.setDrawing(Grid.grid[r][c]); 
    Grid.showGhost(Grid.grid[r][c] === Config.START ? "🚀" : "🎯", "var(--accent)");
  } else {
    Grid.setDrawing(true);
    paintCell(r, c);
  }
}

function handleMouseMove(e) {
  if (!Grid.isDrawing) return;
  const { r, c } = Grid.getCellFromEvent(e);
  
  if (Grid.isDrawing === Config.START || Grid.isDrawing === Config.GOAL) {
    Grid.dragGhost.style.left = e.clientX - 20 + "px";
    Grid.dragGhost.style.top = e.clientY - 20 + "px";
  } else if (r >= 0 && r < Grid.ROWS && c >= 0 && c < Grid.COLS) {
    paintCell(r, c);
  }
}

function handleMouseUp(e) {
  if (Grid.isDrawing === Config.START || Grid.isDrawing === Config.GOAL) {
    const { r, c } = Grid.getCellFromEvent(e);
    if (r >= 0 && r < Grid.ROWS && c >= 0 && c < Grid.COLS) {
      if (Grid.grid[r][c] === Config.WALL) Grid.grid[r][c] = Config.EMPTY;
      if (Grid.isDrawing === Config.START) {
        Grid.grid[Grid.startNode.r][Grid.startNode.c] = Config.EMPTY;
        Grid.updateStartNode(r, c);
        Grid.grid[r][c] = Config.START;
      } else {
        Grid.grid[Grid.goalNode.r][Grid.goalNode.c] = Config.EMPTY;
        Grid.updateGoalNode(r, c);
        Grid.grid[r][c] = Config.GOAL;
      }
    }
  }
  Grid.setDrawing(false);
  Grid.hideGhost();
  draw();
}

function paintCell(r, c) {
  if (Grid.grid[r][c] === Config.START || Grid.grid[r][c] === Config.GOAL) return;
  
  if (currentTool === "wall") {
    Grid.grid[r][c] = Config.WALL;
    Grid.terrainGrid[r][c] = 0;
  } else if (currentTool === "erase") {
    Grid.grid[r][c] = Config.EMPTY;
    Grid.terrainGrid[r][c] = 0;
  } else if (currentTool === "highway") {
    Grid.grid[r][c] = Config.EMPTY;
    Grid.terrainGrid[r][c] = Config.HIGHWAY;
  } else if (currentTool === "traffic") {
    Grid.grid[r][c] = Config.EMPTY;
    Grid.terrainGrid[r][c] = Config.TRAFFIC;
  } else if (currentTool === "mud") {
    Grid.grid[r][c] = Config.EMPTY;
    Grid.terrainGrid[r][c] = Config.MUD;
  }
  
  Grid.spawnRipple(c, r);
  draw();
}

function handleKeydown(e) {
  if (e.target.tagName === "INPUT" || e.target.tagName === "SELECT") return;
  
  if (e.code === "Tab") {
    e.preventDefault();
    UI.toggleSidebar(() => Grid.resizeCanvas(draw));
  } else if (e.code === "Space") {
    e.preventDefault();
    togglePlayPause();
  } else if (e.code === "KeyR") {
    resetPath();
  } else if (e.code === "KeyC") {
    clearAll();
  } else if (e.code === "KeyS") {
    stepSearch();
  } else if (e.code === "Digit1") setTool("wall");
  else if (e.code === "Digit2") setTool("start");
  else if (e.code === "Digit3") setTool("goal");
  else if (e.code === "Digit4") setTool("erase");
  else if (e.code === "Digit5") setTool("highway");
  else if (e.code === "Digit6") setTool("traffic");
  else if (e.code === "Digit7") setTool("mud");
  else if (e.code === "KeyG") {
    UI.toggleFullscreen(() => Grid.resizeCanvas(draw));
  } else if (e.key === "?") {
    UI.showShortcuts();
  } else if (e.code === "Escape") {
    UI.hideShortcuts();
    // closeCompare(); // To be implemented
  } else if (e.code === "KeyB") {
    stepBackward();
  } else if (e.code === "KeyF") {
    stepForward();
  }
}

function stepBackward() {
  if (History.historyIdx > 0) {
    History.setHistoryIdx(History.historyIdx - 1);
    restoreHistoryState();
  }
}

function stepForward() {
  if (History.historyIdx < History.searchHistory.length - 1) {
    History.setHistoryIdx(History.historyIdx + 1);
    restoreHistoryState();
  }
}

function restoreHistoryState() {
  const snap = History.searchHistory[History.historyIdx];
  if (!snap) return;
  Grid.setGrid(snap.grid.map(r => [...r]));
  searchState = snap.state;
  History.updateHistoryUI();
  draw();
}

function handleRLTrain() {
  if (QLearning.rlTraining) {
    QLearning.stopRLTraining();
    return;
  }
  QLearning.startRLTraining(
    Grid.startNode,
    Grid.goalNode,
    Grid.grid,
    Grid.terrainGrid,
    allowDiagonals,
    Grid.ROWS,
    Grid.COLS,
    {
      onStep: () => {
        QLearning.updateRLStats();
        draw();
      },
      onComplete: (ep, reward, path) => {
         UI.showToast(`✓ RL Done: ep ${ep}`, "success");
         UI.logEntry("success", `✓ RL done: best reward=${Math.round(reward)}`);
      },
      log: UI.logEntry,
      showToast: UI.showToast,
      drawGrid: draw,
      triggerGlitch: UI.triggerGlitch
    }
  );
}

function handleRLPolicy() {
  QLearning.runLearnedPolicy(
    Grid.startNode,
    Grid.goalNode,
    Grid.grid,
    Grid.terrainGrid,
    allowDiagonals,
    Grid.ROWS,
    Grid.COLS,
    {
      showToast: UI.showToast,
      log: UI.logEntry,
      setStatus: UI.setStatus,
      drawGrid: draw,
      stopAgentAnimation: Grid.stopAgentAnimation,
      startAgentAnimation: Grid.startAgentAnimation,
      resetPath: resetPath,
      updateStats: (qSize, pLen, openLen, cost) => {
         document.getElementById("statNodes").textContent = qSize;
         document.getElementById("statPath").textContent = pLen;
         document.getElementById("statOpen").textContent = openLen;
         document.getElementById("statCost").textContent = cost;
      }
    }
  );
}

init();
