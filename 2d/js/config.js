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
      [EMPTY]: "#111f1c",
      [WALL]: "#1a2b27",
      wallStroke: "#39544a",
      [START]: "#9ce7c6",
      [GOAL]: "#dba7bf",
      [OPEN]: "rgba(213,185,130,0.83)",
      frontierStroke: "rgba(213,185,130,0.55)",
      [CLOSED]: "rgba(77,148,131,0.52)",
      closedStroke: "rgba(92,175,153,0.55)",
      [PATH]: "#9ce7c6",
      [HIGHWAY]: "#3d5246",
      highwayStroke: "#6c9481",
      [TRAFFIC]: "#67563c",
      trafficStroke: "#9b8057",
      [MUD]: "#47424c",
      mudStroke: "#7f758b",
      grid: "#1b2e28",
      gridStroke: "rgba(130,174,155,0.15)",
      pathLine: "rgba(156,231,198,0.95)",
    };
  return {
    [EMPTY]: "#e8f0f8",
    [WALL]: "#1e3a50",
    wallStroke: "#2a5070",
    [START]: "#00956a",
    [GOAL]: "#d63050",
    [OPEN]: "rgba(210,140,0,0.7)",
    frontierStroke: "rgba(180,110,0,0.4)",
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
  dstarlite: {
    label: "D* LITE",
    col: "#d5b982",
    col2: "#9ce7c6",
    style: "bidir",
  },
  astar: {
    label: "A* SEARCH",
    col: "#9ce7c6",
    col2: "#85b5c3",
    style: "wave",
  },
  dijkstra: {
    label: "DIJKSTRA",
    col: "#85b5c3",
    col2: "#b5a2dd",
    style: "rings",
  },
  greedy: {
    label: "GREEDY BFS",
    col: "#d5b982",
    col2: "#dba7bf",
    style: "arrow",
  },
  bfs: {
    label: "BREADTH-FIRST",
    col: "#85b5c3",
    col2: "#9ce7c6",
    style: "layers",
  },
  dfs: {
    label: "DEPTH-FIRST",
    col: "#b5a2dd",
    col2: "#dba7bf",
    style: "spiral",
  },
  bidirectional: {
    label: "BIDIR. A*",
    col: "#9ce7c6",
    col2: "#dba7bf",
    style: "bidir",
  },
  jps: {
    label: "JUMP PT SEARCH",
    col: "#9ce7c6",
    col2: "#d5b982",
    style: "jump",
  },
  thetastar: {
    label: "THETA*",
    col: "#b5a2dd",
    col2: "#85b5c3",
    style: "angle",
  },
};
