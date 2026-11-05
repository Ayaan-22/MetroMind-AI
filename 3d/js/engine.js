/* MetroMind 3D — deterministic grid, search and reinforcement-learning engine.
   Kept independent of the DOM and WebGL so experiments can be reproduced. */
(function (scope) {
  'use strict';
  const limits = Object.freeze({ grid: 100, freeBuild: 200 });
  const terrain = Object.freeze([
    { id: 0, name: 'Street', cost: 1 },
    { id: 1, name: 'Building', cost: Infinity },
    { id: 2, name: 'Highway', cost: 0.5 },
    { id: 3, name: 'Traffic', cost: 3 },
    { id: 4, name: 'Mud', cost: 10 }
  ]);
  const algorithms = Object.freeze({
    astar: { name: 'A* Search', short: 'A*', description: 'Balances distance travelled and a lower-bound estimate to the destination.', optimal: 'With weight 1 and an admissible heuristic' },
    dijkstra: { name: 'Dijkstra', short: 'Dijkstra', description: 'Explores by accumulated travel cost. Guarantees the cheapest weighted route.', optimal: 'Yes' },
    bfs: { name: 'Breadth-first', short: 'BFS', description: 'Explores one layer at a time. Finds the fewest moves, regardless of terrain cost.', optimal: 'Fewest moves only' },
    dfs: { name: 'Depth-first', short: 'DFS', description: 'Follows each branch deeply before backtracking. Useful for exploring maze structure.', optimal: 'No' },
    greedy: { name: 'Greedy best-first', short: 'Greedy', description: 'Prioritizes proximity to the destination. Fast exploration can produce expensive routes.', optimal: 'No' },
    bidir: { name: 'Bidirectional search', short: 'Bidirectional', description: 'Searches from both endpoints using exact forward and reverse weighted costs.', optimal: 'Yes' },
    theta: { name: 'Theta*', short: 'Theta*', description: 'Connects visible vertices directly for smooth any-angle routes, with terrain-aware segment costs.', optimal: 'Any-angle approximation' },
    jps: { name: 'Jump point search', short: 'JPS', description: 'Adds safe directional jumps on uniform terrain. Uses A* when terrain or elevation varies.', optimal: 'With weight 1 and an admissible heuristic' },
    dstar: { name: 'D* Lite', short: 'D* Lite', description: 'Retains previous search values and repairs the route when the city changes.', optimal: 'Yes' }
  });
  const DIR4 = [[-1, 0], [0, 1], [1, 0], [0, -1]];
  const DIR8 = DIR4.concat([[-1, -1], [-1, 1], [1, 1], [1, -1]]);
  const now = () => typeof performance !== 'undefined' ? performance.now() : Date.now();
  const near = (a, b) => a === b || Math.abs(a - b) < 1e-8;
  const keyLess = (a, b) => a[0] < b[0] - 1e-9 || (near(a[0], b[0]) && a[1] < b[1] - 1e-9);
  function random(seed) {
    let value = Number(seed) >>> 0;
    return () => { value += 0x6D2B79F5; let t = value; t = Math.imul(t ^ t >>> 15, t | 1); t ^= t + Math.imul(t ^ t >>> 7, t | 61); return ((t ^ t >>> 14) >>> 0) / 4294967296; };
  }
  class Heap {
    constructor(less = (a, b) => a.priority < b.priority || a.priority === b.priority && a.h < b.h) { this.items = []; this.less = less; }
    get size() { return this.items.length; }
    peek() { return this.items[0]; }
    push(item) {
      const a = this.items; let i = a.length; a.push(item);
      while (i) { const p = (i - 1) >> 1; if (!this.less(item, a[p])) break; a[i] = a[p]; i = p; } a[i] = item;
    }
    pop() {
      const a = this.items; if (!a.length) return undefined;
      const first = a[0], last = a.pop();
      if (a.length) { let i = 0; while (true) { let c = i * 2 + 1; if (c >= a.length) break; if (c + 1 < a.length && this.less(a[c + 1], a[c])) c++; if (!this.less(a[c], last)) break; a[i] = a[c]; i = c; } a[i] = last; }
      return first;
    }
  }
  class Grid {
    constructor(size = 30) {
      if (!Number.isInteger(size) || size < 4 || size > limits.freeBuild) throw new Error(`Grid size must be an integer from 4 to ${limits.freeBuild}.`);
      this.size = this.N = this.rows = this.cols = size; this.count = size * size;
      this.types = this.terrain = new Uint8Array(this.count);
      this.elevations = this.elevation = new Float32Array(this.count);
      this.developed = new Uint8Array(this.count).fill(1);
      this.originX = this.originZ = -size / 2;
      this.freeBuild = false;
      this.start = size + 1; this.goal = this.count - size - 2;
      this.version = 0; this.seed = 2084; this.preset = 'empty'; this.importNote = '';
    }
    valid(i) { return Number.isInteger(i) && i >= 0 && i < this.count; }
    set(i, type, elevation, developed = true) {
      if (!this.valid(i)) return false;
      if (!Number.isInteger(type) || type < 0 || type > 4) throw new Error('Unknown terrain type.');
      if (typeof developed !== 'boolean') throw new Error('Developed state must be true or false.');
      if (this.freeBuild && !developed && type !== 1) throw new Error('Undeveloped ground must be impassable.');
      if (type === 1 && (i === this.start || i === this.goal)) return false;
      const e = elevation === undefined ? this.elevations[i] : Math.max(0, Math.min(12, Number(elevation) || 0));
      const d = this.freeBuild ? Number(developed) : 1;
      if (this.types[i] === type && this.elevations[i] === e && this.developed[i] === d) return false;
      this.types[i] = type; this.elevations[i] = e; this.developed[i] = d; this.version++; return true;
    }
    clear() { this.types.fill(0); this.elevations.fill(0); this.developed.fill(1); this.freeBuild = false; this.preset = 'empty'; this.version++; return this; }
    cellToWorld(i) {
      if (!this.valid(i)) return null;
      return { x: this.originX + i % this.size + 0.5, z: this.originZ + Math.floor(i / this.size) + 0.5 };
    }
    worldToCell(x, z) {
      if (!Number.isFinite(x) || !Number.isFinite(z)) throw new Error('World coordinates must be finite numbers.');
      const col = Math.floor(x - this.originX), row = Math.floor(z - this.originZ);
      const inBounds = row >= 0 && col >= 0 && row < this.size && col < this.size;
      return { row, col, index: inBounds ? row * this.size + col : -1, inBounds };
    }
    enableFreeBuild(preserve = true) {
      if (typeof preserve !== 'boolean') throw new Error('Preserve must be true or false.');
      const wasFreeBuild = this.freeBuild;
      this.freeBuild = true;
      if (!preserve) {
        this.types.fill(1); this.elevations.fill(0); this.developed.fill(0);
        const row = Math.floor(this.size / 2), left = Math.max(1, Math.floor(this.size / 2) - 5), right = Math.min(this.size - 2, Math.floor(this.size / 2) + 5);
        this.start = row * this.size + left; this.goal = row * this.size + right;
        this.types[this.start] = this.types[this.goal] = 0;
        this.developed[this.start] = this.developed[this.goal] = 1;
        this.preset = 'freebuild';
      } else if (!wasFreeBuild) this.developed.fill(1);
      this.version++; return this;
    }
    expandToWorld(x, z, padding = 4) {
      const target = this.worldToCell(x, z), oldSize = this.size;
      if (!Number.isInteger(padding) || padding < 0 || padding > 20) throw new Error('Expansion padding must be an integer from 0 to 20.');
      if (target.inBounds) return { changed: false, index: target.index, row: target.row, col: target.col, rowShift: 0, colShift: 0, oldSize, size: oldSize };
      const left = Math.max(0, -target.col), right = Math.max(0, target.col - oldSize + 1);
      const top = Math.max(0, -target.row), bottom = Math.max(0, target.row - oldSize + 1);
      const required = oldSize + Math.max(left + right, top + bottom);
      // Validate before allocating or changing any state. Padding may shrink at
      // the limit, but a requested cell is never silently omitted or clamped.
      const limit = this.freeBuild ? limits.freeBuild : limits.grid;
      if (required > limit) throw new Error(`${this.freeBuild ? 'Free Build' : 'Grid'} has reached its ${limit} × ${limit} cell limit. Draw closer to the existing city.`);
      const desired = oldSize + Math.max(left + right + (left || right ? padding : 0), top + bottom + (top || bottom ? padding : 0));
      const size = Math.min(limit, Math.ceil(desired / 10) * 10), extra = size - oldSize;
      const shift = (negative, positive) => {
        const spare = extra - negative - positive;
        if (negative) return negative + Math.min(padding, spare);
        if (positive) return Math.max(0, spare - Math.min(padding, spare));
        return Math.floor(extra / 2);
      };
      const colShift = shift(left, right), rowShift = shift(top, bottom);
      const originX = this.originX - colShift, originZ = this.originZ - rowShift;
      if (Math.abs(originX) > 10000 || Math.abs(originZ) > 10000) throw new Error('The canvas origin must stay within the supported world range.');
      const types = new Uint8Array(size * size), elevations = new Float32Array(size * size), developed = new Uint8Array(size * size);
      if (this.freeBuild) types.fill(1); else developed.fill(1);
      for (let row = 0; row < oldSize; row++) {
        const from = row * oldSize, to = (row + rowShift) * size + colShift;
        types.set(this.types.subarray(from, from + oldSize), to);
        elevations.set(this.elevations.subarray(from, from + oldSize), to);
        developed.set(this.developed.subarray(from, from + oldSize), to);
      }
      const remap = i => (Math.floor(i / oldSize) + rowShift) * size + i % oldSize + colShift;
      this.start = remap(this.start); this.goal = remap(this.goal);
      this.size = this.N = this.rows = this.cols = size; this.count = size * size;
      this.types = this.terrain = types; this.elevations = this.elevation = elevations; this.developed = developed;
      this.originX = originX; this.originZ = originZ; this.version++;
      const row = target.row + rowShift, col = target.col + colShift;
      return { changed: true, index: row * size + col, row, col, rowShift, colShift, oldSize, size };
    }
    neighbors(i, diagonal = false, includeWalls = false) {
      const r = i / this.size | 0, c = i % this.size, result = [];
      for (const [dr, dc] of diagonal ? DIR8 : DIR4) {
        const rr = r + dr, cc = c + dc;
        if (rr < 0 || cc < 0 || rr >= this.size || cc >= this.size) continue;
        const j = rr * this.size + cc;
        if (!includeWalls && (this.types[j] === 1 || this.types[i] === 1 || dr && dc && (this.types[r * this.size + cc] === 1 || this.types[rr * this.size + c] === 1))) continue;
        result.push(j);
      }
      return result;
    }
    cost(a, b) {
      if (!this.valid(a) || !this.valid(b) || this.types[a] === 1 || this.types[b] === 1) return Infinity;
      const dr = Math.abs((a / this.size | 0) - (b / this.size | 0)), dc = Math.abs(a % this.size - b % this.size);
      if (dr > 1 || dc > 1 || !dr && !dc) return Infinity;
      if (dr && dc && (this.types[(a / this.size | 0) * this.size + b % this.size] === 1 || this.types[(b / this.size | 0) * this.size + a % this.size] === 1)) return Infinity;
      return (dr && dc ? Math.SQRT2 : 1) * terrain[this.types[b]].cost * (1 + Math.max(0, this.elevations[b] - this.elevations[a]) * 0.6);
    }
    trace(a, b) {
      if (!this.valid(a) || !this.valid(b)) return null;
      const ar = a / this.size | 0, ac = a % this.size, br = b / this.size | 0, bc = b % this.size;
      // Exact cell-boundary traversal catches arbitrarily short intersections
      // near corners that a sampled line-of-sight test would miss.
      const stepR = Math.sign(br - ar), stepC = Math.sign(bc - ac), deltaR = ar === br ? Infinity : 1 / Math.abs(br - ar), deltaC = ac === bc ? Infinity : 1 / Math.abs(bc - ac);
      let boundaryR = deltaR / 2, boundaryC = deltaC / 2, r = ar, c = ac, previous = a; const cells = [a];
      while (r !== br || c !== bc) {
        if (near(boundaryR, boundaryC)) { r += stepR; c += stepC; boundaryR += deltaR; boundaryC += deltaC; }
        else if (boundaryR < boundaryC) { r += stepR; boundaryR += deltaR; }
        else { c += stepC; boundaryC += deltaC; }
        const cell = r * this.size + c;
        if (!Number.isFinite(this.cost(previous, cell))) return null;
        cells.push(cell); previous = cell;
      }
      return this.types[a] === 1 ? null : cells;
    }
    segmentCost(a, b) {
      if (a === b) return 0;
      const cells = this.trace(a, b); if (!cells) return Infinity;
      // Integrate cost over the actual straight line through cell-centred terrain.
      const ar = a / this.size | 0, ac = a % this.size, br = b / this.size | 0, bc = b % this.size;
      const distance = Math.hypot(br - ar, bc - ac), samples = Math.max(8, Math.ceil(distance * 12));
      let cost = 0, previousElevation = this.elevations[a];
      for (let s = 1; s <= samples; s++) {
        const cell = Math.round(ar + (br - ar) * s / samples) * this.size + Math.round(ac + (bc - ac) * s / samples);
        const nextElevation = this.elevations[cell];
        cost += distance / samples * terrain[this.types[cell]].cost;
        cost += Math.max(0, nextElevation - previousElevation) * 0.6 * terrain[this.types[cell]].cost;
        previousElevation = nextElevation;
      }
      return cost;
    }
    pathCost(path, anyAngle = false) { if (!path || !path.length) return Infinity; let result = 0; for (let i = 1; i < path.length; i++) result += anyAngle ? this.segmentCost(path[i - 1], path[i]) : this.cost(path[i - 1], path[i]); return result; }
    generate(preset = 'downtown', seed = 2084) {
      this.clear(); this.preset = preset; this.seed = Number(seed) >>> 0; const rand = random(this.seed), n = this.size, t = this.types, e = this.elevations;
      this.start = n + 1; this.goal = (n - 2) * n + n - 2;
      const at = (r, c, type) => { if (r >= 0 && c >= 0 && r < n && c < n) t[r * n + c] = type; };
      if (preset === 'empty') { this.version++; return this; }
      if (['downtown', 'manhattan', 'grid', 'blocks', 'city'].includes(preset)) {
        const block = preset === 'manhattan' ? 5 : 6;
        for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) {
          const rr = r % block, cc = c % block, i = r * n + c;
          if (r > 1 && c > 1 && r < n - 2 && c < n - 2 && rr >= 2 && cc >= 2) t[i] = rand() < 0.88 ? 1 : 0;
          else if (r % (block * 2) <= 1 || c % (block * 2) <= 1) t[i] = 2;
          else if ((r === block + 1 || c === block * 2 + 1) && rand() < 0.5) t[i] = 3;
        }
        // A compact central square stays open for city furniture and trees.
        const m = Math.floor(n / 2); for (let r = m - 1; r <= m + 1; r++) for (let c = m - 1; c <= m + 1; c++) at(r, c, 0);
        if (n >= 12) {
          const avenue = fraction => {
            const desired = Math.round((n - 1) * fraction); let nearest = 1, distance = Infinity;
            for (let value = 2; value < n - 2; value++) if (value % block <= 1 && Math.abs(value - desired) < distance) { nearest = value; distance = Math.abs(value - desired); }
            return nearest;
          };
          const front = avenue(0.8), left = avenue(0.2), back = avenue(0.2), right = avenue(0.8);
          const nextStart = front * n + left, nextGoal = back * n + right;
          if (nextStart !== nextGoal) { this.start = nextStart; this.goal = nextGoal; }
        }
      } else if (['maze', 'recursive', 'rooms'].includes(preset)) {
        t.fill(1); const stack = [[1, 1]]; at(1, 1, 0);
        while (stack.length) {
          const [r, c] = stack[stack.length - 1], dirs = DIR4.slice(); let moved = false;
          for (let k = dirs.length - 1; k > 0; k--) { const j = rand() * (k + 1) | 0; [dirs[k], dirs[j]] = [dirs[j], dirs[k]]; }
          for (const [dr, dc] of dirs) { const rr = r + dr * 2, cc = c + dc * 2; if (rr > 0 && cc > 0 && rr < n - 1 && cc < n - 1 && t[rr * n + cc] === 1) { at(r + dr, c + dc, 0); at(rr, cc, 0); stack.push([rr, cc]); moved = true; break; } }
          if (!moved) stack.pop();
        }
        if (preset === 'rooms') for (let k = 0; k < 5; k++) { const rr = 2 + Math.floor(rand() * (n - 6)), cc = 2 + Math.floor(rand() * (n - 6)); for (let r = rr; r < rr + 4; r++) for (let c = cc; c < cc + 4; c++) at(r, c, 0); }
      } else if (['terrain', 'perlin', 'hills'].includes(preset)) {
        for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) {
          const i = r * n + c, h = Math.sin(r * 0.31 + this.seed) * Math.cos(c * 0.24) + Math.sin((r + c) * 0.21) * 0.7;
          t[i] = h > 0.9 ? 4 : h > 0.35 ? 3 : h < -0.8 ? 2 : 0; e[i] = Math.max(0, h + 0.1) * 1.8;
          if (rand() < 0.07 && t[i] === 0) t[i] = 1;
        }
      } else if (['snake', 'corridor'].includes(preset)) {
        t.fill(1); for (let r = 1, line = 0; r < n - 1; r += 3, line++) { for (let c = 1; c < n - 1; c++) at(r, c, 0); const c = line % 2 ? 1 : n - 2; for (let d = 1; d <= 3; d++) at(r + d, c, 0); }
      } else if (preset === 'spiral') {
        t.fill(1); let lo = 1, hi = n - 2; while (lo <= hi) { for (let c = lo; c <= hi; c++) at(lo, c, 0); for (let r = lo; r <= hi; r++) at(r, hi, 0); for (let c = hi; c >= lo; c--) at(hi, c, 0); for (let r = hi; r >= lo + 2; r--) at(r, lo, 0); at(lo + 2, lo + 1, 0); lo += 2; hi -= 2; }
      } else if (preset === 'cross') {
        const m = n / 2 | 0; for (let r = 2; r < n - 2; r++) for (let c = 2; c < n - 2; c++) if ((r === m || c === m) && Math.abs(r - c) > 2 && Math.abs(r + c - n) > 2) at(r, c, 1);
      } else {
        for (let i = 0; i < t.length; i++) { const k = rand(); t[i] = k < 0.23 ? 1 : k < 0.29 ? 3 : k < 0.32 ? 4 : 0; }
      }
      // Connect endpoints to the same component without carving a direct shortcut.
      t[this.start] = t[this.goal] = 0;
      const reachable = () => { const seen = new Set([this.start]), queue = [this.start]; for (let k = 0; k < queue.length; k++) for (const j of this.neighbors(queue[k])) if (!seen.has(j)) { seen.add(j); queue.push(j); } return seen; };
      let connected = reachable();
      if (!connected.has(this.goal)) {
        let nearest = this.start, best = Infinity; for (const i of connected) { const d = Math.abs((i / n | 0) - (this.goal / n | 0)) + Math.abs(i % n - this.goal % n); if (d < best) { best = d; nearest = i; } }
        let r = nearest / n | 0, c = nearest % n, gr = this.goal / n | 0, gc = this.goal % n;
        while (r !== gr || c !== gc) { if (r !== gr && (c === gc || rand() < 0.5)) r += Math.sign(gr - r); else c += Math.sign(gc - c); at(r, c, 0); }
      }
      this.version++; return this;
    }
    serialize() { return { format: 'metromind-3d', version: 3, size: this.size, N: this.size, seed: this.seed, preset: this.preset, start: this.start, goal: this.goal, types: Array.from(this.types), elevations: Array.from(this.elevations), originX: this.originX, originZ: this.originZ, freeBuild: this.freeBuild, developed: Array.from(this.developed) }; }
    static fromJSON(input) {
      const data = typeof input === 'string' ? JSON.parse(input) : input;
      if (!data || typeof data !== 'object') throw new Error('The file must contain a city layout.');
      const v11 = Array.isArray(data.grid) && Array.isArray(data.grid[0]);
      if (!v11 && data.freeBuild !== undefined && typeof data.freeBuild !== 'boolean') throw new Error('Free Build mode must be true or false.');
      const sourceRows = v11 ? data.rows ?? data.grid.length : data.size ?? data.N;
      const sourceCols = v11 ? data.cols ?? data.grid[0].length : sourceRows;
      const limit = !v11 && data.freeBuild === true ? limits.freeBuild : limits.grid;
      if (![sourceRows, sourceCols].every(x => Number.isInteger(x) && x >= 4 && x <= limit)) throw new Error(`Layout dimensions must be between 4 and ${limit}.`);
      const size = Math.max(sourceRows, sourceCols), grid = new Grid(size), types = v11 ? null : data.types ?? data.T, elevation = data.elevations ?? data.E;
      if (!v11 && (!Array.isArray(types) || types.length !== grid.count)) throw new Error('Terrain data does not match the grid dimensions.');
      if (!v11 && elevation !== undefined && (!Array.isArray(elevation) || elevation.length !== grid.count)) throw new Error('Elevation data does not match the grid dimensions.');
      if (v11) {
        if (data.grid.length !== sourceRows || data.grid.some(row => !Array.isArray(row) || row.length !== sourceCols)) throw new Error('Invalid v11 grid dimensions.');
        if (data.terrain && (data.terrain.length !== sourceRows || data.terrain.some(row => !Array.isArray(row) || row.length !== sourceCols))) throw new Error('Invalid v11 terrain dimensions.');
        // Padding stays blocked so adding square display space cannot change a v11 route.
        grid.types.fill(1);
        for (let r = 0; r < sourceRows; r++) for (let c = 0; c < sourceCols; c++) {
          const cell = data.grid[r][c], terrainId = data.terrain?.[r]?.[c] ?? 0;
          if (!Number.isInteger(cell) || cell < 0 || cell > 9 || ![0, 7, 8, 9].includes(terrainId)) throw new Error('Invalid v11 terrain cell.');
          grid.types[r * size + c] = cell === 1 ? 1 : terrainId === 7 || cell === 7 ? 2 : terrainId === 8 || cell === 8 ? 3 : terrainId === 9 || cell === 9 ? 4 : 0;
        }
        const nodeIndex = node => node && Number.isInteger(node.r) && Number.isInteger(node.c) && node.r >= 0 && node.c >= 0 && node.r < sourceRows && node.c < sourceCols ? node.r * size + node.c : -1;
        grid.start = nodeIndex(data.start); grid.goal = nodeIndex(data.goal);
        grid.importNote = sourceRows !== sourceCols ? `Imported ${sourceCols} × ${sourceRows} v11 map; unused square space is blocked.` : 'Imported v11 grid.';
      } else {
        if (types.some(x => !Number.isInteger(x) || x < 0 || x > 4)) throw new Error('Unknown terrain type in layout.');
        if (elevation?.some(x => typeof x !== 'number' || !Number.isFinite(x) || x < 0 || x > 12)) throw new Error('Elevations must be finite values from 0 to 12.');
        grid.types.set(types); if (elevation) grid.elevations.set(elevation);
        grid.start = data.start; grid.goal = data.goal;
        grid.freeBuild = data.freeBuild ?? false;
        for (const key of ['originX', 'originZ']) {
          if (data[key] !== undefined && (typeof data[key] !== 'number' || !Number.isFinite(data[key]) || Math.abs(data[key]) > 10000)) throw new Error('Canvas origins must be finite numbers within the supported world range.');
          if (data[key] !== undefined) grid[key] = data[key];
        }
        if (data.developed !== undefined) {
          if (!Array.isArray(data.developed) || data.developed.length !== grid.count || Array.from(data.developed).some(x => x !== 0 && x !== 1)) throw new Error('Developed data does not match the city layout.');
          grid.developed.set(data.developed);
        } else if (grid.freeBuild) throw new Error('A Free Build layout must include its developed ground.');
        if (grid.freeBuild && grid.types.some((type, index) => !grid.developed[index] && type !== 1)) throw new Error('Undeveloped ground must be impassable.');
        if (!grid.freeBuild && grid.developed.some(value => value !== 1)) throw new Error('Regular layouts cannot contain undeveloped ground.');
      }
      if (!grid.valid(grid.start) || !grid.valid(grid.goal) || grid.start === grid.goal) throw new Error('Choose distinct start and destination cells inside the grid.');
      if (grid.types[grid.start] === 1 || grid.types[grid.goal] === 1) throw new Error('Start and destination cannot be inside buildings.');
      if (!grid.developed[grid.start] || !grid.developed[grid.goal]) throw new Error('Start and destination must be on developed ground.');
      grid.seed = Number.isInteger(data.seed) ? data.seed : 2084; grid.preset = typeof data.preset === 'string' ? data.preset.slice(0, 40) : 'imported'; grid.version++; return grid;
    }
  }
  function heuristic(grid, a, b, options, minCost = 0.5) {
    const dr = Math.abs((a / grid.size | 0) - (b / grid.size | 0)), dc = Math.abs(a % grid.size - b % grid.size);
    if (options.heuristic === 'euclidean') return Math.hypot(dr, dc) * minCost;
    if (options.heuristic === 'chebyshev') return Math.max(dr, dc) * minCost;
    // Manhattan is capped by octile distance for diagonal movement to remain admissible.
    return (options.diagonal ? Math.max(dr, dc) + (Math.SQRT2 - 1) * Math.min(dr, dc) : dr + dc) * minCost;
  }
  function reconstruct(parent, end) { const result = []; let i = end; for (let safety = 0; i !== -1 && safety <= parent.length; safety++) { result.push(i); i = parent[i]; } return result.reverse(); }
  function* basicSearch(grid, algorithm, options) {
    const count = grid.count, distance = new Float64Array(count).fill(Infinity), parent = new Int32Array(count).fill(-1), closed = new Uint8Array(count);
    const plain = algorithm === 'bfs' || algorithm === 'dfs', queue = [grid.start], heap = new Heap(); let head = 0, expanded = 0;
    const minCost = grid.types.includes(2) ? 0.5 : 1, h = i => heuristic(grid, i, grid.goal, options, minCost);
    const priority = (i, g) => algorithm === 'dijkstra' ? g : algorithm === 'greedy' ? h(i) * options.weight : g + h(i) * options.weight;
    const uniform = !grid.types.some(x => x > 1) && !grid.elevations.some(x => x !== 0);
    const canJump = algorithm === 'jps' && uniform;
    distance[grid.start] = 0; heap.push({ i: grid.start, g: 0, priority: priority(grid.start, 0), h: h(grid.start) });
    while (plain ? algorithm === 'dfs' ? queue.length : head < queue.length : heap.size) {
      const entry = plain ? { i: algorithm === 'dfs' ? queue.pop() : queue[head++] } : heap.pop(), i = entry.i;
      if (closed[i] || !plain && entry.g !== distance[i]) continue;
      closed[i] = 1; expanded++;
      if (i === grid.goal) {
        let path = reconstruct(parent, i);
        if (canJump) { const full = [path[0]]; for (let k = 1; k < path.length; k++) full.push(...grid.trace(path[k - 1], path[k]).slice(1)); path = full; }
        yield { node: i, opened: [], expanded, done: true, path, cost: grid.pathCost(path, algorithm === 'theta') }; return;
      }
      const opened = [], neighbors = grid.neighbors(i, options.diagonal || algorithm === 'theta');
      const candidates = neighbors.map(j => ({ j, cost: algorithm === 'theta' ? grid.segmentCost(i, j) : grid.cost(i, j) }));
      if (canJump) {
        // Ordinary edges are retained: conservative directional jumps cannot hide
        // a turn or invalidate an optimal path under strict no-corner-crossing.
        const r = i / grid.size | 0, c = i % grid.size, gr = grid.goal / grid.size | 0, gc = grid.goal % grid.size;
        for (const [dr, dc] of options.diagonal ? DIR8 : DIR4) {
          let last = i, total = 0;
          for (let step = 1; step < grid.size; step++) {
            const rr = r + dr * step, cc = c + dc * step;
            if (rr < 0 || cc < 0 || rr >= grid.size || cc >= grid.size) break;
            const j = rr * grid.size + cc, edge = grid.cost(last, j); if (!Number.isFinite(edge)) break;
            total += edge; last = j;
            if (step > 1 && (j === grid.goal || rr === gr || cc === gc || grid.neighbors(j, true).length < 8)) { candidates.push({ j, cost: total }); break; }
          }
          if (last !== i && !candidates.some(x => x.j === last)) candidates.push({ j: last, cost: total });
        }
      }
      for (const { j, cost } of candidates) {
        if (closed[j] && (plain || algorithm === 'greedy')) continue;
        let from = i, nextDistance = distance[i] + cost;
        if (algorithm === 'theta' && parent[i] !== -1) {
          const previous = parent[i], shortcut = grid.segmentCost(previous, j);
          if (distance[previous] + shortcut < nextDistance) { from = previous; nextDistance = distance[previous] + shortcut; }
        }
        if ((plain && distance[j] !== Infinity) || !(nextDistance < distance[j] - 1e-9)) continue;
        distance[j] = nextDistance; parent[j] = from; closed[j] = 0; opened.push(j);
        if (plain) queue.push(j); else heap.push({ i: j, g: nextDistance, priority: priority(j, nextDistance), h: h(j) });
      }
      yield { node: i, opened, expanded };
    }
    yield { node: null, opened: [], expanded, done: true, path: null, cost: Infinity };
  }
  function* bidirectional(grid, options) {
    const count = grid.count, dist = [new Float64Array(count).fill(Infinity), new Float64Array(count).fill(Infinity)], parent = [new Int32Array(count).fill(-1), new Int32Array(count).fill(-1)], closed = [new Uint8Array(count), new Uint8Array(count)], queues = [new Heap(), new Heap()];
    dist[0][grid.start] = dist[1][grid.goal] = 0; queues[0].push({ i: grid.start, priority: 0, h: 0 }); queues[1].push({ i: grid.goal, priority: 0, h: 0 });
    let best = Infinity, middle = -1, expanded = 0;
    const clean = side => { const heap = queues[side]; while (heap.size && (closed[side][heap.peek().i] || heap.peek().priority !== dist[side][heap.peek().i])) heap.pop(); };
    while (queues[0].size && queues[1].size) {
      clean(0); clean(1); if (!queues[0].size || !queues[1].size || queues[0].peek().priority + queues[1].peek().priority >= best - 1e-9) break;
      const side = queues[0].peek().priority <= queues[1].peek().priority ? 0 : 1, i = queues[side].pop().i, opened = []; closed[side][i] = 1; expanded++;
      for (const j of grid.neighbors(i, options.diagonal)) {
        const next = dist[side][i] + (side ? grid.cost(j, i) : grid.cost(i, j));
        if (next < dist[side][j] - 1e-9) { dist[side][j] = next; parent[side][j] = i; queues[side].push({ i: j, priority: next, h: 0 }); opened.push(j); }
        const joint = dist[side][j] + dist[1 - side][j]; if (joint < best) { best = joint; middle = j; }
      }
      yield { node: i, opened, expanded, direction: side };
    }
    if (grid.start === grid.goal) { best = 0; middle = grid.start; }
    let path = null;
    if (middle !== -1) { path = reconstruct(parent[0], middle); let i = parent[1][middle]; for (let k = 0; i !== -1 && k < count; k++) { path.push(i); i = parent[1][i]; } }
    yield { node: null, opened: [], expanded, done: true, path, cost: path ? best : Infinity };
  }
  class DStarLite {
    constructor(grid, options) {
      this.grid = grid; this.options = options; this.g = new Float64Array(grid.count).fill(Infinity); this.rhs = new Float64Array(grid.count).fill(Infinity); this.active = new Map(); this.queue = new Heap((a, b) => keyLess(a.key, b.key)); this.km = 0; this.last = grid.start; this.goal = grid.goal; this.stamp = 0;
      this.previousTypes = grid.types.slice(); this.previousElevations = grid.elevations.slice(); this.rhs[grid.goal] = 0; this.push(grid.goal);
    }
    h(a, b) { return heuristic(this.grid, a, b, { diagonal: this.options.diagonal }, 0.5); }
    key(i) { const m = Math.min(this.g[i], this.rhs[i]); return [m + this.h(this.grid.start, i) + this.km, m]; }
    push(i) { const item = { i, key: this.key(i), stamp: ++this.stamp }; this.active.set(i, item); this.queue.push(item); }
    clean() { while (this.queue.size && this.active.get(this.queue.peek().i)?.stamp !== this.queue.peek().stamp) this.queue.pop(); }
    update(i) {
      if (i !== this.grid.goal) { let rhs = Infinity; for (const j of this.grid.neighbors(i, this.options.diagonal)) rhs = Math.min(rhs, this.grid.cost(i, j) + this.g[j]); this.rhs[i] = rhs; }
      this.active.delete(i); if (!near(this.g[i], this.rhs[i])) this.push(i);
    }
    prepare(changed = []) {
      this.km += this.h(this.last, this.grid.start); this.last = this.grid.start;
      const affected = new Set();
      for (let i = 0; i < this.grid.count; i++) if (this.previousTypes[i] !== this.grid.types[i] || this.previousElevations[i] !== this.grid.elevations[i]) changed.push(i);
      for (const i of changed) if (this.grid.valid(i)) { affected.add(i); for (const j of this.grid.neighbors(i, true, true)) affected.add(j); }
      this.previousTypes.set(this.grid.types); this.previousElevations.set(this.grid.elevations);
      for (const i of affected) this.update(i);
    }
    path() {
      if (!Number.isFinite(this.g[this.grid.start])) return null;
      const path = [this.grid.start], seen = new Set(path); let i = this.grid.start;
      while (i !== this.grid.goal && path.length <= this.grid.count) {
        let next = -1, best = Infinity;
        for (const j of this.grid.neighbors(i, this.options.diagonal)) { const value = this.grid.cost(i, j) + this.g[j]; if (value < best - 1e-8) { next = j; best = value; } }
        if (next === -1 || seen.has(next)) return null; i = next; seen.add(i); path.push(i);
      }
      return i === this.grid.goal ? path : null;
    }
    *run() {
      const grid = this.grid; let expanded = 0;
      for (;;) {
        this.clean(); const top = this.queue.peek();
        if (!top || !keyLess(top.key, this.key(grid.start)) && near(this.rhs[grid.start], this.g[grid.start])) break;
        this.queue.pop(); this.active.delete(top.i); const i = top.i, updatedKey = this.key(i);
        if (keyLess(top.key, updatedKey)) this.push(i);
        else if (this.g[i] > this.rhs[i]) { this.g[i] = this.rhs[i]; for (const j of grid.neighbors(i, this.options.diagonal, true)) this.update(j); }
        else { this.g[i] = Infinity; this.update(i); for (const j of grid.neighbors(i, this.options.diagonal, true)) this.update(j); }
        expanded++; yield { node: i, opened: Array.from(this.active.keys()), replaceFrontier: true, expanded };
        if (expanded > grid.count * 100) throw new Error('Dynamic search did not converge.');
      }
      const path = this.path(); yield { node: null, opened: [], expanded, done: true, path, cost: path ? grid.pathCost(path) : Infinity };
    }
  }
  class SearchSession {
    constructor(grid, algorithm = 'astar', options = {}) {
      this.grid = grid; this.algorithm = ({ dstarlite: 'dstar', thetastar: 'theta', bidirectional: 'bidir' })[algorithm] || algorithm;
      if (!algorithms[this.algorithm]) throw new Error('Unknown search algorithm.');
      this.options = { diagonal: false, heuristic: 'manhattan', weight: 1, ...options };
      const requestedWeight = Number(this.options.weight);
      this.options.weight = Number.isFinite(requestedWeight) ? Math.max(0, Math.min(5, requestedWeight)) : 1;
      this.note = this.algorithm === 'jps' && (grid.types.some(x => x > 1) || grid.elevations.some(x => x !== 0)) ? 'Weighted terrain / elevation detected. JPS uses A* to preserve valid weighted routes.' : this.algorithm === 'jps' ? 'Conservative jump acceleration retains ordinary edges for safe corner handling.' : this.algorithm === 'theta' ? 'Theta* uses any-angle line-of-sight segments; Manhattan selection is capped by Euclidean distance.' : '';
      if (this.algorithm === 'theta') this.options.heuristic = 'euclidean';
      this.dynamic = this.algorithm === 'dstar' ? new DStarLite(grid, this.options) : null; this.replans = 0; this.resetPlayback(); this.generator = this.createGenerator();
    }
    createGenerator() { return this.dynamic ? this.dynamic.run() : this.algorithm === 'bidir' ? bidirectional(this.grid, this.options) : basicSearch(this.grid, this.algorithm, this.options); }
    resetPlayback() { this.visited = new Set(); this.frontier = new Set([this.grid.start]); if (this.algorithm === 'bidir') this.frontier.add(this.grid.goal); this.path = null; this.cost = 0; this.done = false; this.expanded = 0; this.elapsed = 0; this.history = []; this.cursor = 0; this.current = -1; }
    apply(event) {
      event.before = { done: this.done, path: this.path, cost: this.cost, expanded: this.expanded, current: this.current };
      event.changes = [];
      const touched = new Set([...(event.opened || []), ...(event.replaceFrontier || event.done ? this.frontier : []), ...(event.node == null ? [] : [event.node])]);
      for (const i of touched) event.changes.push([i, this.visited.has(i), this.frontier.has(i)]);
      if (event.replaceFrontier || event.done) this.frontier.clear();
      if (event.node != null) { this.visited.add(event.node); this.frontier.delete(event.node); this.current = event.node; }
      for (const i of event.opened || []) if (!this.visited.has(i)) this.frontier.add(i);
      this.expanded = event.expanded; if (event.done) { this.done = true; this.path = event.path; this.cost = event.cost; }
    }
    step(count = 1) {
      const started = now();
      for (let k = 0; k < count && !this.done; k++) {
        let event;
        if (this.cursor < this.history.length) event = this.history[this.cursor];
        else { const next = this.generator.next(); if (next.done) { this.done = true; break; } event = next.value; this.history.push(event); }
        this.apply(event); this.cursor++;
      }
      this.elapsed += now() - started; return this;
    }
    back() {
      if (!this.cursor) return this;
      const event = this.history[--this.cursor];
      for (const [i, visited, frontier] of event.changes) { visited ? this.visited.add(i) : this.visited.delete(i); frontier ? this.frontier.add(i) : this.frontier.delete(i); }
      Object.assign(this, event.before); return this;
    }
    finish() { let safety = 0; while (!this.done && safety++ < this.grid.count * 200) this.step(64); return this; }
    replan(changedIndices = []) {
      if (this.dynamic && this.dynamic.goal === this.grid.goal && this.dynamic.g.length === this.grid.count) this.dynamic.prepare(Array.from(changedIndices));
      else if (this.algorithm === 'dstar') this.dynamic = new DStarLite(this.grid, this.options);
      this.resetPlayback(); this.generator = this.createGenerator(); this.replans++; return this;
    }
  }
  class QLearner {
    constructor(grid, options = {}) { this.grid = grid; this.options = { alpha: 0.18, gamma: 0.96, epsilon: 0.95, decay: 0.995, minEpsilon: 0.03, maxSteps: Math.min(1800, grid.count * 3), diagonal: false, ...options }; this.reset(); }
    reset() { this.actions = this.options.diagonal ? DIR8 : DIR4; this.actionCount = this.actions.length; this.q = new Float32Array(this.grid.count * this.actionCount); this.policy = new Int8Array(this.grid.count).fill(-1); this.heat = new Float32Array(this.grid.count); this.counts = new Uint32Array(this.grid.count); this.episodes = 0; this.successes = 0; this.epsilon = this.options.epsilon; this.rewards = []; this.lengths = []; this.bestPath = null; this.bestCost = Infinity; this.lastPath = null; this.lastReward = 0; this.version = this.grid.version; this.start = this.grid.start; this.goal = this.grid.goal; this.note = 'Learned policy is experimental; it is not guaranteed to be optimal.'; return this; }
    next(i, action) { const [dr, dc] = this.actions[action], n = this.grid.size, r = (i / n | 0) + dr, c = i % n + dc; if (r < 0 || c < 0 || r >= n || c >= n) return -1; const j = r * n + c; return Number.isFinite(this.grid.cost(i, j)) ? j : -1; }
    bestAction(i, randomTie = false) {
      let best = -Infinity, candidates = [];
      for (let a = 0; a < this.actionCount; a++) if (this.next(i, a) !== -1) { const q = this.q[i * this.actionCount + a]; if (q > best + 1e-6) { best = q; candidates = [a]; } else if (Math.abs(q - best) <= 1e-6) candidates.push(a); }
      return candidates.length ? candidates[randomTie ? Math.random() * candidates.length | 0 : 0] : -1;
    }
    maxQ(i) { const a = this.bestAction(i); return a < 0 ? 0 : this.q[i * this.actionCount + a]; }
    train(episodes = 10) {
      if (this.grid.version !== this.version || this.start !== this.grid.start || this.goal !== this.grid.goal) this.reset();
      const grid = this.grid, cfg = this.options;
      for (let episode = 0; episode < episodes; episode++) {
        let i = grid.start, rewardSum = 0, path = [i];
        for (let step = 0; step < cfg.maxSteps; step++) {
          const action = Math.random() < this.epsilon ? Math.random() * this.actionCount | 0 : this.bestAction(i, true);
          if (action < 0) break;
          const candidate = this.next(i, action), j = candidate < 0 ? i : candidate, reached = j === grid.goal;
          // Potential-based shaping preserves the underlying terminal reward objective.
          const distance = index => Math.abs((index / grid.size | 0) - (grid.goal / grid.size | 0)) + Math.abs(index % grid.size - grid.goal % grid.size);
          const shaping = 0.8 * (distance(i) - cfg.gamma * distance(j));
          const reward = reached ? 200 : candidate < 0 ? -5 : -grid.cost(i, j) + shaping;
          const offset = i * this.actionCount + action, target = reward + (reached ? 0 : cfg.gamma * this.maxQ(j));
          this.q[offset] += cfg.alpha * (target - this.q[offset]); this.counts[i]++; rewardSum += reward; i = j; if (path[path.length - 1] !== i) path.push(i);
          if (reached) { this.successes++; const cost = grid.pathCost(path); if (cost < this.bestCost) { this.bestCost = cost; this.bestPath = path.slice(); } break; }
        }
        this.episodes++; this.epsilon = Math.max(cfg.minEpsilon, this.epsilon * cfg.decay); this.rewards.push(rewardSum); this.lengths.push(path.length - 1); if (this.rewards.length > 300) { this.rewards.shift(); this.lengths.shift(); }
        this.lastPath = path; this.lastReward = rewardSum;
      }
      this.refresh(); return this;
    }
    refresh() { for (let i = 0; i < this.grid.count; i++) { this.policy[i] = this.grid.types[i] === 1 || !this.counts[i] ? -1 : this.bestAction(i); this.heat[i] = this.grid.types[i] === 1 ? 0 : this.maxQ(i); } return this; }
    rollout(maxSteps = this.grid.count * 2) {
      const path = [this.grid.start], seen = new Set(path); let i = this.grid.start;
      for (let step = 0; step < maxSteps && i !== this.grid.goal; step++) { const action = this.bestAction(i), j = action < 0 ? -1 : this.next(i, action); if (j < 0 || seen.has(j)) break; i = j; seen.add(i); path.push(i); }
      this.lastRollout = { path, reached: i === this.grid.goal, cost: i === this.grid.goal ? this.grid.pathCost(path) : Infinity }; return this.lastRollout;
    }
  }
  scope.MetroEngine = { Grid, SearchSession, QLearner, algorithms, terrain, random, limits };
  if (typeof module !== 'undefined' && module.exports) module.exports = scope.MetroEngine;
})(globalThis);
