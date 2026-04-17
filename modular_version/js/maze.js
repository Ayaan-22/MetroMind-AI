import { WALL, EMPTY, START, GOAL, HIGHWAY, TRAFFIC, MUD } from './config.js';

export function loadMaze(type, ROWS, COLS, grid, startNode, goalNode, terrainGrid) {
  if (type === "maze1") {
    if (ROWS < 15 || COLS < 22) return "Corridor template needs min 22x15";
    for (let c = 5; c < COLS - 4; c++) grid[4][c] = WALL;
    for (let r = 5; r < ROWS - 5; r++) grid[r][COLS - 5] = WALL;
    for (let c = 5; c < COLS - 4; c++) grid[ROWS - 5][c] = WALL;
    for (let r = 5; r < ROWS - 5; r++) grid[r][4] = WALL;
    for (let c = 8; c < COLS - 8; c++) grid[8][c] = WALL;
    for (let r = 8; r < ROWS - 8; r++) grid[r][8] = WALL;
    for (let c = 8; c < COLS - 8; c++) grid[ROWS - 9][c] = WALL;
    grid[4][14] = EMPTY;
    grid[8][12] = EMPTY;
    grid[ROWS - 5][14] = EMPTY;
    grid[ROWS - 9][18] = EMPTY;
  } else if (type === "spiral") {
    if (ROWS < 16 || COLS < 16) return "Spiral template needs min 16x16";
    for (let c = 3; c < COLS - 3; c++) {
      grid[3][c] = WALL;
      grid[ROWS - 4][c] = WALL;
    }
    for (let r = 3; r < ROWS - 3; r++) {
      grid[r][3] = WALL;
      grid[r][COLS - 4] = WALL;
    }
    for (let c = 7; c < COLS - 6; c++) grid[7][c] = WALL;
    for (let r = 7; r < ROWS - 7; r++) grid[r][COLS - 7] = WALL;
    for (let c = 7; c < COLS - 6; c++) grid[ROWS - 8][c] = WALL;
    for (let r = 7; r < ROWS - 7; r++) grid[r][7] = WALL;
    for (let c = 11; c < COLS - 10; c++) grid[11][c] = WALL;
    for (let r = 11; r < ROWS - 11; r++) grid[r][11] = WALL;
    grid[3][Math.floor(COLS / 2)] = EMPTY;
    grid[7][Math.floor(COLS / 2) - 2] = EMPTY;
    grid[ROWS - 8][Math.floor(COLS / 2) + 2] = EMPTY;
    grid[11][Math.floor(COLS / 2)] = EMPTY;
  } else if (type === "rooms") {
    if (ROWS < 28 || COLS < 28) return "Rooms template needs min 28x28";
    [
      [3, 3, 3, 12], [3, 3, 12, 3], [12, 3, 12, 12], [3, 12, 12, 12],
      [3, 16, 3, 26], [3, 16, 12, 16], [12, 16, 12, 26], [3, 26, 12, 26],
      [16, 3, 16, 12], [16, 3, 26, 3], [26, 3, 26, 12], [16, 12, 26, 12],
      [16, 16, 16, 26], [16, 16, 26, 16], [26, 16, 26, 26], [16, 26, 26, 26],
    ].forEach(([r1, c1, r2, c2]) => {
      if (r1 === r2) for (let c = c1; c <= c2; c++) grid[r1][c] = WALL;
      else for (let r = r1; r <= r2; r++) grid[r][c1] = WALL;
    });
    [7, 12, 7, 16, 20, 12, 20, 16].forEach((v, i) => {
      if (i % 2 === 0) grid[v][i < 4 ? 12 : 16] = EMPTY;
      else grid[i < 4 ? 12 : 16][v] = EMPTY;
    });
  } else if (type === "cross") {
    const mr = Math.floor(ROWS / 2), mc = Math.floor(COLS / 2);
    for (let c = 0; c < COLS; c++)
      if (c < mc - 5 || c > mc + 5) grid[mr][c] = WALL;
    for (let r = 0; r < ROWS; r++)
      if (r < mr - 5 || r > mr + 5) grid[r][mc] = WALL;
  } else if (type === "random") {
    for (let r = 0; r < ROWS; r++)
      for (let c = 0; c < COLS; c++)
        if (Math.random() < 0.28) grid[r][c] = WALL;
  } else if (type === "snake") {
    for (let i = 0; i < Math.floor(ROWS / 4); i++) {
      const row = 3 + i * 4;
      if (i % 2 === 0) {
        for (let c = 2; c < COLS - 4; c++) grid[row][c] = WALL;
      } else {
        for (let c = 4; c < COLS - 2; c++) grid[row][c] = WALL;
      }
    }
  } else if (type === "grid2") {
    for (let r = 4; r < ROWS - 2; r += 4)
      for (let c = 0; c < COLS; c++) grid[r][c] = WALL;
    for (let c = 4; c < COLS - 2; c += 4)
      for (let r = 0; r < ROWS; r++) grid[r][c] = WALL;
    for (let r = 4; r < ROWS - 2; r += 4)
      for (let c = 2; c < COLS; c += 4) grid[r][c] = EMPTY;
    for (let c = 4; c < COLS - 2; c += 4)
      for (let r = 2; r < ROWS; r += 4) grid[r][c] = EMPTY;
  }
  grid[startNode.r][startNode.c] = START;
  grid[goalNode.r][goalNode.c] = GOAL;
  return null; 
}

export function generateRecursive(ROWS, COLS, grid, startNode, goalNode) {
  for (let r = 0; r < ROWS; r++)
    for (let c = 0; c < COLS; c++) grid[r][c] = WALL;
  
  function carve(r, c) {
    const dirs = [[0, 2], [0, -2], [2, 0], [-2, 0]].sort(() => Math.random() - 0.5);
    for (const [dr, dc] of dirs) {
      const nr = r + dr, nc = c + dc;
      if (nr > 0 && nr < ROWS - 1 && nc > 0 && nc < COLS - 1 && grid[nr][nc] === WALL) {
        grid[r + dr / 2][c + dc / 2] = EMPTY;
        grid[nr][nc] = EMPTY;
        carve(nr, nc);
      }
    }
  }
  const sr = 1 + 2 * Math.floor(Math.random() * Math.floor((ROWS - 2) / 2));
  const sc = 1 + 2 * Math.floor(Math.random() * Math.floor((COLS - 2) / 2));
  grid[sr][sc] = EMPTY;
  carve(sr, sc);
  grid[startNode.r][startNode.c] = START;
  grid[goalNode.r][goalNode.c] = GOAL;
}

// Noise helpers 
function lerp(a, b, t) { return a + t * (b - a); }
function fade(t) { return t * t * t * (t * (t * 6 - 15) + 10); }
function grad(hash, x, y) {
  const h = hash & 3;
  const u = h < 2 ? x : y, v = h < 2 ? y : x;
  return (h & 1 ? -u : u) + (h & 2 ? -v : v);
}

export function generatePerlinTerrain(ROWS, COLS, grid, startNode, goalNode, terrainGrid) {
  const perm = Array.from({ length: 512 }, () => Math.floor(Math.random() * 256));
  const wallPerm = Array.from({ length: 512 }, () => Math.floor(Math.random() * 256));

  function noise(x, y, p) {
    const X = Math.floor(x) & 255, Y = Math.floor(y) & 255;
    const xf = x - Math.floor(x), yf = y - Math.floor(y);
    const u = fade(xf), v = fade(yf);
    const a = p[X] + Y, b = p[X + 1] + Y;
    return lerp(
      lerp(grad(p[a], xf, yf), grad(p[b], xf - 1, yf), u),
      lerp(grad(p[a + 1], xf, yf - 1), grad(p[b + 1], xf - 1, yf - 1), u),
      v
    );
  }

  function octaveNoise(x, y, octaves, persistence, p) {
    let val = 0, amp = 1, freq = 1, max = 0;
    for (let i = 0; i < octaves; i++) {
      val += noise(x * freq, y * freq, p) * amp;
      max += amp;
      amp *= persistence;
      freq *= 2;
    }
    return val / max;
  }

  const scaleX = 4 / COLS, scaleY = 4 / ROWS;
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      if (grid[r][c] === START || grid[r][c] === GOAL) continue;
      const n = octaveNoise(c * scaleX, r * scaleY, 3, 0.5, perm);
      const wn = octaveNoise(c * scaleX * 1.7 + 10, r * scaleY * 1.7 + 10, 1, 1, wallPerm);
      
      if (wn > 0.25) {
        grid[r][c] = WALL;
        terrainGrid[r][c] = 0;
        continue;
      }
      if (n > 0.25) { grid[r][c] = EMPTY; terrainGrid[r][c] = HIGHWAY; }
      else if (n < -0.3) { grid[r][c] = EMPTY; terrainGrid[r][c] = MUD; }
      else if (n < -0.1) { grid[r][c] = EMPTY; terrainGrid[r][c] = TRAFFIC; }
      else { grid[r][c] = EMPTY; terrainGrid[r][c] = 0; }
    }
  }
  grid[startNode.r][startNode.c] = START;
  terrainGrid[startNode.r][startNode.c] = 0;
  grid[goalNode.r][goalNode.c] = GOAL;
  terrainGrid[goalNode.r][goalNode.c] = 0;
  
  [[startNode], [goalNode]].forEach(([n]) => {
    for (let dr = -1; dr <= 1; dr++)
      for (let dc = -1; dc <= 1; dc++) {
        const nr = n.r + dr, nc = n.c + dc;
        if (nr >= 0 && nr < ROWS && nc >= 0 && nc < COLS && grid[nr][nc] === WALL)
          grid[nr][nc] = EMPTY;
      }
  });
}
