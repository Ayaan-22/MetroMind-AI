export const COLS_INITIAL = 50;
export const ROWS_INITIAL = 30;
export const CELL_MIN = 8;
export const CELL_MAX = 28;
export const MAX_DELAY = 110;

export const EMPTY = 0;
export const WALL = 1;
export const START = 2;
export const GOAL = 3;
export const OPEN = 4;
export const CLOSED = 5;
export const PATH = 6;
export const HIGHWAY = 7;
export const TRAFFIC = 8;
export const MUD = 9;

export const TERRAIN_COST = {
  [HIGHWAY]: 0.5,
  [TRAFFIC]: 3.0,
  [MUD]: 10.0,
};

export const TOAST_ICONS = {
  success: "✓",
  warn: "⚠",
  error: "✕",
  info: "ℹ",
};

export function getColors() {
  const isDark = document.documentElement.getAttribute("data-theme") !== "light";
  if (isDark)
    return {
      [EMPTY]: "#0a1520",
      [WALL]: "#1a3a50",
      wallStroke: "#2a5070",
      [START]: "#00e5a0",
      [GOAL]: "#ff4d6d",
      [OPEN]: "rgba(247,183,49,0.85)",
      [CLOSED]: "rgba(0,184,255,0.38)",
      closedStroke: "rgba(0,184,255,0.65)",
      [PATH]: "#00e5a0",
      [HIGHWAY]: "rgba(0,220,255,0.22)",
      highwayStroke: "rgba(0,220,255,0.55)",
      [TRAFFIC]: "rgba(255,140,0,0.28)",
      trafficStroke: "rgba(255,140,0,0.55)",
      [MUD]: "rgba(100,60,20,0.45)",
      mudStroke: "rgba(120,72,30,0.7)",
      grid: "rgba(0,184,255,0.05)",
      gridStroke: "rgba(0,184,255,0.08)",
      pathLine: "rgba(0,229,160,0.9)",
    };
  return {
    [EMPTY]: "#e8f0f8",
    [WALL]: "#1e3a50",
    wallStroke: "#2a5070",
    [START]: "#00956a",
    [GOAL]: "#d63050",
    [OPEN]: "rgba(210,140,0,0.7)",
    [CLOSED]: "rgba(0,120,200,0.15)",
    closedStroke: "rgba(0,120,200,0.4)",
    [PATH]: "#00956a",
    [HIGHWAY]: "rgba(0,180,220,0.2)",
    highwayStroke: "rgba(0,180,220,0.5)",
    [TRAFFIC]: "rgba(220,110,0,0.25)",
    trafficStroke: "rgba(220,110,0,0.5)",
    [MUD]: "rgba(100,60,20,0.3)",
    mudStroke: "rgba(100,60,20,0.6)",
    grid: "rgba(0,120,180,0.05)",
    gridStroke: "rgba(0,120,180,0.12)",
    pathLine: "rgba(0,149,106,0.9)",
  };
}

export const PORTRAIT_CONFIGS = {
  astar: {
    label: "A* SEARCH",
    col: "#00e5a0",
    col2: "#00b8ff",
    style: "wave",
  },
  dijkstra: {
    label: "DIJKSTRA",
    col: "#00b8ff",
    col2: "#a78bfa",
    style: "rings",
  },
  greedy: {
    label: "GREEDY BFS",
    col: "#f7b731",
    col2: "#ff4d6d",
    style: "arrow",
  },
  bfs: {
    label: "BREADTH-FIRST",
    col: "#00b8ff",
    col2: "#00e5a0",
    style: "layers",
  },
  dfs: {
    label: "DEPTH-FIRST",
    col: "#a78bfa",
    col2: "#ff4d6d",
    style: "spiral",
  },
  bidirectional: {
    label: "BIDIR. A*",
    col: "#00e5a0",
    col2: "#ff4d6d",
    style: "bidir",
  },
  jps: {
    label: "JUMP PT SEARCH",
    col: "#00e5a0",
    col2: "#f7b731",
    style: "jump",
  },
  thetastar: {
    label: "THETA*",
    col: "#a78bfa",
    col2: "#00b8ff",
    style: "angle",
  },
};
