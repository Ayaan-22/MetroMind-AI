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
let allowDiagonals = false;
let animSpeed = 50;
let heuristicWeight = 1.0;
let searchState = null;
let animTimer = null;
let lastSolutionPath = null;
let stepCount = 0;
let pathAnimInterval = null;

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
  UI.showToast("🚀 MetroMind AI v11 Modular Loaded", "success");
  UI.logEntry("success", "System online. Neural grid initialized.");
  
  setupEventListeners();
  Grid.syncRippleCanvas();
  
  // Initial UI sync
  updateSpeed(animSpeed);
  updateWeight(heuristicWeight);
  changeAlgorithm(currentAlgorithm);
  setTool(currentTool);
}

function draw() {
  Grid._drawGrid(searchState, lastSolutionPath, currentAlgorithm, allowDiagonals);
  if (QLearning.rlAgent) {
    QLearning.drawRLOverlay(Grid.ctx, Grid.CELL, Grid.ROWS, Grid.COLS, Grid.grid, allowDiagonals);
  }
}

// ═══════════════════════════════════════════════════════
// CORE SEARCH LOGIC
// ═══════════════════════════════════════════════════════
function startSearch() {
  if (Grid.startNode.r === Grid.goalNode.r && Grid.startNode.c === Grid.goalNode.c) {
    UI.showToast("⚠ Start and goal cannot overlap", "warn");
    return;
  }
  if (Grid.grid[Grid.startNode.r][Grid.startNode.c] === Config.WALL || Grid.grid[Grid.goalNode.r][Grid.goalNode.c] === Config.WALL) {
    UI.showToast("⚠ Start or goal placed on wall", "warn");
    return;
  }

  stopAnim();
  resetPath(true);
  
  searchState = Algorithms.initSearch(
    currentAlgorithm,
    Grid.startNode,
    Grid.goalNode,
    Grid.grid,
    Grid.terrainGrid,
    allowDiagonals,
    heuristicWeight
  );
  
  if (!searchState) return;
  
  History.clearHistory();
  UI.clearSparklines();
  UI.triggerGlitch();
  UI.updateProgressRing(0, Grid.ROWS * Grid.COLS * 0.7, "Searching…");
  
  const btn = document.getElementById("playBtn");
  if (btn) {
    btn.textContent = "⏸ PAUSE";
    btn.classList.add("running");
  }
  
  UI.setStatus("running", "Searching…");
  UI.logEntry("info", `▶ Starting ${currentAlgorithm.toUpperCase()} search…`);
  Grid.canvas.classList.add("running");
  
  const stepBtn = document.getElementById("stepBtn");
  if (stepBtn) stepBtn.disabled = false;
  
  const tickMs = Math.max(5, Config.MAX_DELAY - animSpeed);
  animTimer = setInterval(() => {
    if (!searchState || searchState.done) {
      stopAnim();
      onSearchComplete();
      return;
    }
    const batchSize = Math.max(1, Math.floor(animSpeed / 10));
    for (let i = 0; i < batchSize && searchState && !searchState.done; i++) {
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
        currentAlgorithm,
        UI.logEntry,
        UI.setStatus,
        UI.showToast,
        onSearchComplete
      );
      stepCount++;
      const counterEl = document.getElementById("stepCounter");
      if (counterEl) counterEl.textContent = "step " + stepCount;
      if (stepCount % 5 === 0) History.snapshotHistory(searchState, Grid.grid);
      updateStatsUI();
    }
    draw();
  }, tickMs);
}

function resetPath(silent = false) {
  stopAnim();
  Grid.stopAgentAnimation();
  if (pathAnimInterval) clearInterval(pathAnimInterval);
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
  
  const stepBtn = document.getElementById("stepBtn");
  if (stepBtn) stepBtn.disabled = true;
  const playBtn = document.getElementById("playBtn");
  if (playBtn) {
    playBtn.textContent = "▶ FIND PATH";
    playBtn.classList.remove("running");
  }
  Grid.canvas.classList.remove("running", "done");
  
  UI.updateStats(0, "—", 0, "—");
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
    const playBtn = document.getElementById("playBtn");
    if (playBtn) {
      playBtn.textContent = "▶ RESUME";
      playBtn.classList.remove("running");
    }
    const stepBtn = document.getElementById("stepBtn");
    if (stepBtn) stepBtn.disabled = false;
  } else {
    const tickMs = Math.max(5, Config.MAX_DELAY - animSpeed);
    animTimer = setInterval(() => {
      if (!searchState || searchState.done) {
        stopAnim();
        onSearchComplete();
        return;
      }
      const batchSize = Math.max(1, Math.floor(animSpeed / 10));
      for (let i = 0; i < batchSize && searchState && !searchState.done; i++) {
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
          currentAlgorithm,
          UI.logEntry,
          UI.setStatus,
          UI.showToast,
          onSearchComplete
        );
        stepCount++;
        const counterEl = document.getElementById("stepCounter");
        if (counterEl) counterEl.textContent = "step " + stepCount;
        if (stepCount % 5 === 0) History.snapshotHistory(searchState, Grid.grid);
        updateStatsUI();
      }
      draw();
    }, tickMs);
    UI.setStatus("running", "Searching…");
    const playBtn = document.getElementById("playBtn");
    if (playBtn) {
      playBtn.textContent = "⏸ PAUSE";
      playBtn.classList.add("running");
    }
    const stepBtn = document.getElementById("stepBtn");
    if (stepBtn) stepBtn.disabled = true;
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
    stopAnim(); 
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
    currentAlgorithm,
    UI.logEntry,
    UI.setStatus,
    UI.showToast,
    onSearchComplete
  );
  
  stepCount++;
  const counterEl = document.getElementById("stepCounter");
  if (counterEl) counterEl.textContent = "step " + stepCount;

  if (stepCount % 5 === 0) {
    History.snapshotHistory(searchState, Grid.grid);
  }

  draw();
  updateStatsUI();
}

function onSearchComplete() {
  stopAnim();
  const playBtn = document.getElementById("playBtn");
  if (playBtn) {
    playBtn.textContent = "▶ FIND PATH";
    playBtn.classList.remove("running");
  }
  const stepBtn = document.getElementById("stepBtn");
  if (stepBtn) stepBtn.disabled = true;
  
  if (searchState && searchState.finalPath) {
    lastSolutionPath = searchState.finalPath;
    UI.updateProgressRing(1, 1, "Path found!");
    UI.logEntry("success", `✓ Path found: ${lastSolutionPath.length} steps, cost ${Math.round(searchState.solutionCost)}`);
    UI.showToast(`✓ Path found: ${lastSolutionPath.length} steps`, "success");
    Grid.canvas.classList.add("done");
    Grid.startAgentAnimation(lastSolutionPath);
  } else {
    UI.setStatus("error", "No path found");
    UI.logEntry("error", "✕ No path possible!");
    UI.showToast("✕ No path possible!", "error");
  }
}

function updateStatsUI() {
  if (!searchState) return;
  const n = searchState.explored;
  const p = searchState.finalPath ? searchState.finalPath.length : "—";
  const o = searchState.openSet ? (searchState.openSet.size || 0) : 0;
  const c = searchState.solutionCost ? Math.round(searchState.solutionCost) : "—";
  
  UI.updateStats(n, p, o, c);
  UI.updateProgressRing(n, Grid.ROWS * Grid.COLS * 0.7, "Searching…");
}

// ═══════════════════════════════════════════════════════
// UI HANDLERS
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

function setTool(tool) {
  currentTool = tool;
  document.querySelectorAll(".tool-btn").forEach(b => b.classList.remove("active"));
  const btnId = "tool" + tool.charAt(0).toUpperCase() + tool.slice(1);
  document.getElementById(btnId)?.classList.add("active");
  
  ["wall", "start", "goal", "erase", "highway", "traffic", "mud"].forEach(id => {
    const el = document.getElementById("tool" + id.charAt(0).toUpperCase() + id.slice(1));
    if (el) el.setAttribute("aria-pressed", id === tool ? "true" : "false");
  });
}

function updateSpeed(val) {
  animSpeed = parseInt(val);
  const label = document.getElementById("speedLabel");
  if (label) label.textContent = Math.max(5, Config.MAX_DELAY - animSpeed) + "ms";
}

function updateWeight(val) {
  heuristicWeight = parseFloat(val);
  const label = document.getElementById("weightLabel");
  if (label) label.textContent = heuristicWeight.toFixed(1) + "×";
  if ((currentAlgorithm === "astar" || currentAlgorithm === "greedy") && searchState && searchState.done) {
    resetPath(true);
  }
}

function updateGridSize() {
  const cols = parseInt(document.getElementById("mazeCols").value);
  const rows = parseInt(document.getElementById("mazeRows").value);
  if (cols >= 10 && cols <= 100 && rows >= 10 && rows <= 100) {
    Grid.setGridDims(cols, rows);
    Grid.initGrid();
    Grid.resizeCanvas(draw);
    resetPath(true);
    UI.logEntry("info", `Grid resized to ${cols}×${rows}`);
  }
}

function applyPreset(c, r) {
  const cInput = document.getElementById("mazeCols");
  const rInput = document.getElementById("mazeRows");
  if (cInput) cInput.value = c;
  if (rInput) rInput.value = r;
  updateGridSize();
}

// ═══════════════════════════════════════════════════════
// EXPORTS
// ═══════════════════════════════════════════════════════
function exportStatsCSV() {
  const n = document.getElementById("statNodes")?.textContent || "0";
  const p = document.getElementById("statPath")?.textContent || "0";
  const c = document.getElementById("statCost")?.textContent || "0";
  const csv = [
    ["Metric", "Value"],
    ["Algorithm", currentAlgorithm],
    ["Nodes Explored", n],
    ["Path Length", p],
    ["Cost", c],
    ["Timestamp", new Date().toLocaleString()]
  ].map(r => r.join(",")).join("\n");
  
  const blob = new Blob([csv], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `MetroMind_Stats_${Date.now()}.csv`;
  a.click();
  UI.showToast("📊 Stats exported", "success");
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
  UI.showToast("🗂 Grid exported", "success");
}

function exportLog() {
  const logEl = document.getElementById("algoLog");
  if (!logEl) return;
  const text = Array.from(logEl.children)
    .map(el => `[${el.className.split(' ')[1]}] ${el.textContent}`)
    .join("\n");
  const blob = new Blob([text], { type: 'text/plain' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `MetroMind_Log_${Date.now()}.txt`;
  a.click();
  UI.showToast("✓ Log exported", "success");
}

// ═══════════════════════════════════════════════════════
// EVENT LISTENERS
// ═══════════════════════════════════════════════════════
function setupEventListeners() {
  // Navigation
  document.getElementById("sidebarToggleBtn")?.addEventListener("click", () => UI.toggleSidebar(() => Grid.resizeCanvas(draw)));
  document.getElementById("sidebarTab")?.addEventListener("click", () => UI.toggleSidebar(() => Grid.resizeCanvas(draw)));
  document.getElementById("sidebarBackdrop")?.addEventListener("click", UI.closeSidebarMobile);
  document.getElementById("rpToggleBtn")?.addEventListener("click", () => UI.toggleRightPanel(() => Grid.resizeCanvas(draw)));
  document.getElementById("rpToggle")?.addEventListener("click", () => UI.toggleRightPanel(() => Grid.resizeCanvas(draw)));
  document.getElementById("themeBtn")?.addEventListener("click", () => UI.toggleTheme(draw));
  
  // Onboarding
  document.getElementById("btnOnboardingStart")?.addEventListener("click", () => UI.dismissOnboarding(false));
  document.getElementById("btnOnboardingSkip")?.addEventListener("click", () => UI.dismissOnboarding(true));
  
  // Overlays
  document.getElementById("btnOpenCompare")?.addEventListener("click", UI.openCompare);
  document.getElementById("btnCompareBack")?.addEventListener("click", UI.closeCompare);
  document.getElementById("btnShowShortcuts")?.addEventListener("click", UI.showShortcuts);
  document.getElementById("btnExitFS")?.addEventListener("click", () => UI.toggleFullscreen(() => Grid.resizeCanvas(draw)));
  document.getElementById("fsBtn")?.addEventListener("click", () => UI.toggleFullscreen(() => Grid.resizeCanvas(draw)));

  // Sidebar Tabs
  document.querySelectorAll(".sb-tab").forEach(btn => {
    const id = btn.id.replace("tbtn-", "");
    btn.addEventListener("click", () => UI.switchSbTab(id, btn));
  });

  // Section Toggles
  ["controls", "speed", "pathopts", "gridsize", "mazes", "heuristic", "terrain", "stats", "rl", "algo", "export"].forEach(id => {
    const el = document.querySelector(`#sec-${id} .sec-label`);
    if (el) el.addEventListener("click", () => UI.toggleSection(`sec-${id}`));
  });

  // Main Controls
  document.getElementById("playBtn")?.addEventListener("click", togglePlayPause);
  document.getElementById("stepBtn")?.addEventListener("click", stepSearch);
  document.getElementById("btnClearAll")?.addEventListener("click", clearAll);
  document.getElementById("btnResetPath")?.addEventListener("click", () => resetPath());

  // History Controls
  document.getElementById("btnBack")?.addEventListener("click", () => {
    History.stepBackward((snap) => {
      Grid.setGrid(snap.grid.map(r => [...r]));
      draw();
      UI.setStatus("running", `History: snapshot ${History.historyIdx + 1}`);
    });
  });
  document.getElementById("btnFwd")?.addEventListener("click", () => {
    History.stepForward((snap) => {
      Grid.setGrid(snap.grid.map(r => [...r]));
      draw();
      UI.setStatus("running", `History: snapshot ${History.historyIdx + 1}`);
    });
  });

  // Sliders
  document.getElementById("speedSlider")?.addEventListener("input", e => updateSpeed(e.target.value));
  document.getElementById("weightSlider")?.addEventListener("input", e => updateWeight(e.target.value));
  
  // Checkboxes
  document.getElementById("allowDiagonals")?.addEventListener("change", e => {
    allowDiagonals = e.target.checked;
    const heurBadge = document.getElementById("heurBadge");
    if (heurBadge) heurBadge.textContent = allowDiagonals ? "Euclidean" : "Manhattan";
    
    const jpsBtn = document.getElementById("btn-algo-jps");
    if (jpsBtn) {
      if (allowDiagonals) {
        jpsBtn.style.opacity = "0.4";
        jpsBtn.style.pointerEvents = "none";
        if (currentAlgorithm === "jps") changeAlgorithm("astar");
      } else {
        jpsBtn.style.opacity = "1";
        jpsBtn.style.pointerEvents = "auto";
      }
    }
    resetPath(true);
  });
  
  document.getElementById("showCost")?.addEventListener("change", () => draw());
  
  // Grid size
  document.getElementById("mazeCols")?.addEventListener("change", updateGridSize);
  document.getElementById("mazeRows")?.addEventListener("change", updateGridSize);
  
  // Grid Presets
  document.querySelectorAll(".maze-btn[data-preset]").forEach(btn => {
    const [c, r] = btn.getAttribute("data-preset").split(",").map(Number);
    btn.addEventListener("click", () => applyPreset(c, r));
  });

  // Maze Logic
  document.querySelectorAll(".maze-btn[data-type]").forEach(btn => {
    const type = btn.getAttribute("data-type");
    btn.addEventListener("click", () => {
      if (type === "recursive") {
        Maze.generateRecursive(Grid.ROWS, Grid.COLS, Grid.grid, Grid.startNode, Grid.goalNode, UI.logEntry);
      } else if (type === "perlin") {
        Maze.generatePerlinTerrain(Grid.ROWS, Grid.COLS, Grid.grid, Grid.startNode, Grid.goalNode, Grid.terrainGrid, UI.logEntry);
      } else {
        Maze.loadMaze(type, Grid.ROWS, Grid.COLS, Grid.grid, Grid.startNode, Grid.goalNode, Grid.terrainGrid, UI.logEntry);
      }
      resetPath(true);
      draw();
    });
  });

  // Algorithm Buttons
  document.querySelectorAll(".algo-btn").forEach(btn => {
    const algo = btn.getAttribute("data-algo");
    if (algo) {
      btn.addEventListener("click", () => changeAlgorithm(algo));
    }
  });

  // Heuristic Buttons
  document.querySelectorAll(".heur-btn").forEach(btn => {
    const heur = btn.getAttribute("data-heur");
    if (heur) {
      btn.addEventListener("click", () => {
        UI.setHeuristicUI(heur);
        resetPath(true);
      });
    }
  });

  // Tool Buttons
  ["wall", "start", "goal", "erase", "highway", "traffic", "mud"].forEach(id => {
    const btnId = "tool" + id.charAt(0).toUpperCase() + id.slice(1);
    document.getElementById(btnId)?.addEventListener("click", () => setTool(id));
  });

  document.getElementById("btnCompareAll")?.addEventListener("click", UI.openCompare);

  // Export Buttons
  document.getElementById("exportCSV")?.addEventListener("click", exportStatsCSV);
  document.getElementById("exportJSON")?.addEventListener("click", exportGridJSON);
  document.getElementById("btnExportLog")?.addEventListener("click", exportLog);

  // RL Buttons
  document.getElementById("rlTrainBtn")?.addEventListener("click", handleRLTrain);
  document.getElementById("rlPolicyBtn")?.addEventListener("click", handleRLPolicy);
  document.getElementById("rlResetBtn")?.addEventListener("click", () => {
    QLearning.resetRLAgent();
    UI.logEntry("info", "🧠 RL Agent reset");
    UI.showToast("🧠 RL Agent reset", "info");
    draw();
  });

  // RL Overlays
  document.getElementById("rlHeatmapToggle")?.addEventListener("change", (e) => {
    QLearning.setHeatmap(e.target.checked);
    draw();
  });
  document.getElementById("rlArrowsToggle")?.addEventListener("change", (e) => {
    QLearning.setArrows(e.target.checked);
    draw();
  });

  // Log Controls
  document.getElementById("btnAutoScroll")?.addEventListener("click", UI.toggleAutoScroll);
  document.getElementById("btnClearLog")?.addEventListener("click", UI.clearLog);
  document.getElementById("scrollFab")?.addEventListener("click", UI.jumpToBottom);

  // Canvas interaction
  Grid.canvas.addEventListener("mousedown", handleMouseDown);
  window.addEventListener("mousemove", handleMouseMove);
  window.addEventListener("mouseup", handleMouseUp);
  window.addEventListener("resize", () => {
    Grid.resizeCanvas(draw);
    Grid.syncRippleCanvas();
  });

  // Keyboard Shortcuts
  document.addEventListener("keydown", handleKeydown);
}

// ═══════════════════════════════════════════════════════
// MOUSE INTERACTION
// ═══════════════════════════════════════════════════════
function handleMouseDown(e) {
  const { r, c } = Grid.getCellFromEvent(e);
  if (r < 0 || r >= Grid.ROWS || c < 0 || c >= Grid.COLS) return;
  
  if (Grid.grid[r][c] === Config.START || Grid.grid[r][c] === Config.GOAL) {
    Grid.setDrawing(Grid.grid[r][c]); 
    Grid.showGhost(Grid.grid[r][c] === Config.START ? "🚀" : "🎯");
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
  } else if (currentTool === "start") {
    Grid.grid[Grid.startNode.r][Grid.startNode.c] = Config.EMPTY;
    Grid.updateStartNode(r, c);
    Grid.grid[r][c] = Config.START;
  } else if (currentTool === "goal") {
    Grid.grid[Grid.goalNode.r][Grid.goalNode.c] = Config.EMPTY;
    Grid.updateGoalNode(r, c);
    Grid.grid[r][c] = Config.GOAL;
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
}

// ═══════════════════════════════════════════════════════
// RL COORDINATION
// ═══════════════════════════════════════════════════════
function handleRLTrain() {
  if (QLearning.rlTraining) {
    QLearning.stopRLTraining();
    return;
  }
  const config = {
    alpha: parseFloat(document.getElementById("rlAlpha")?.value || 0.1),
    gamma: parseFloat(document.getElementById("rlGamma")?.value || 0.9),
    epsilon: 1.0,
    epsilonDecay: parseFloat(document.getElementById("rlEpsilonDecay")?.value || 0.995),
    maxEpisodes: parseInt(document.getElementById("rlMaxEpisodes")?.value || 1000),
    maxSteps: parseInt(document.getElementById("rlMaxSteps")?.value || 100),
    batchSize: parseInt(document.getElementById("rlBatchSize")?.value || 20)
  };

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
        UI.updateSparklines(QLearning.rlEpisode, 0, QLearning.rlAgent.qTable.size, 0);
        draw();
      },
      onComplete: (ep, reward) => {
         UI.showToast(`✓ RL Training Complete: ${ep} episodes`, "success");
         UI.logEntry("success", `✓ RL done: best reward=${Math.round(reward)}`);
         document.getElementById("rlTrainBtn").textContent = "🧠 TRAIN AGENT";
         document.getElementById("rlTrainBtn").classList.remove("training");
      },
      log: UI.logEntry,
      showToast: UI.showToast,
      config: config
    }
  );
  
  const trainBtn = document.getElementById("rlTrainBtn");
  if (trainBtn) {
    trainBtn.textContent = "⏹ STOP TRAINING";
    trainBtn.classList.add("training");
  }
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
      updateStats: (nodes, pathLen, open, cost) => {
        UI.updateStats(nodes, pathLen, open, cost);
      }
    }
  );
}

// ═══════════════════════════════════════════════════════
// GLOBAL EXPOSURE (for legacy HTML compatibility)
// ═══════════════════════════════════════════════════════
window.togglePlayPause = togglePlayPause;
window.stepSearch = stepSearch;
window.clearAll = clearAll;
window.resetPath = resetPath;
window.updateSpeed = updateSpeed;
window.updateWeight = updateWeight;
window.updateGridSize = updateGridSize;
window.applyPreset = applyPreset;
window.changeAlgorithm = (algo) => changeAlgorithm(algo);
window.setTool = (tool) => setTool(tool);
window.exportStatsCSV = exportStatsCSV;
window.exportGridJSON = exportGridJSON;
window.exportLog = exportLog;
window.toggleFullscreen = () => UI.toggleFullscreen(() => Grid.resizeCanvas(draw));
window.toggleSidebar = () => UI.toggleSidebar(() => Grid.resizeCanvas(draw));
window.toggleRightPanel = () => UI.toggleRightPanel(() => Grid.resizeCanvas(draw));
window.toggleTheme = () => UI.toggleTheme(draw);
window.clearLog = UI.clearLog;
window.toggleAutoScroll = UI.toggleAutoScroll;
window.jumpToBottom = UI.jumpToBottom;
window.stepBackward = () => History.stepBackward((snap) => { Grid.setGrid(snap.grid.map(r => [...r])); draw(); });
window.stepForward = () => History.stepForward((snap) => { Grid.setGrid(snap.grid.map(r => [...r])); draw(); });

window.openCompare = UI.openCompare;
window.closeCompare = UI.closeCompare;
window.showShortcuts = UI.showShortcuts;
window.dismissOnboarding = UI.dismissOnboarding;
window.loadMaze = (type) => {
  Maze.loadMaze(type, Grid.ROWS, Grid.COLS, Grid.grid, Grid.startNode, Grid.goalNode, Grid.terrainGrid, UI.logEntry);
  resetPath(true);
  draw();
};
window.generateRecursive = () => {
  Maze.generateRecursive(Grid.ROWS, Grid.COLS, Grid.grid, Grid.startNode, Grid.goalNode, UI.logEntry);
  resetPath(true);
  draw();
};
window.generatePerlinTerrain = () => {
  Maze.generatePerlinTerrain(Grid.ROWS, Grid.COLS, Grid.grid, Grid.startNode, Grid.goalNode, Grid.terrainGrid, UI.logEntry);
  resetPath(true);
  draw();
};
window.setHeuristic = (h) => {
  UI.setHeuristicUI(h);
  resetPath(true);
};
window.toggleRLHeatmap = () => {
  QLearning.setHeatmap(document.getElementById("rlHeatmapToggle").checked);
  draw();
};
window.toggleRLArrows = () => {
  QLearning.setArrows(document.getElementById("rlArrowsToggle").checked);
  draw();
};
window.handleRLTrain = handleRLTrain;
window.handleRLPolicy = handleRLPolicy;
window.handleRLReset = () => {
  QLearning.resetRLAgent();
  UI.logEntry("info", "🧠 RL Agent reset");
  draw();
};
window.drawGrid = () => draw();

init();
