# MetroMind AI — 2D Grid Lab Edition

![2D Edition](https://img.shields.io/badge/Edition-2D%20Grid%20Lab-orange?style=for-the-badge) ![License](https://img.shields.io/badge/License-MIT-green?style=for-the-badge) ![JavaScript](https://img.shields.io/badge/Code-ES6%2B%20Modules-yellow?style=for-the-badge)

Welcome to the **2D Grid Lab** edition of MetroMind AI. This edition is designed for developers, researchers, and AI students who wish to study, extend, or benchmark pathfinding algorithms and reinforcement learning agents.

Both editions share the same algorithmic foundations. The root `metromind-2d.html` is generated from this directory's HTML, CSS, and JavaScript; it embeds everything needed to run the simulator as a single file. Edit the sources here and rebuild the standalone file instead of editing two implementations.

---

## 🚀 Quick Start Instructions

Because this version utilizes **ES6 JavaScript Modules**, it requires a local web server to handle module resolution.

### 1. Open your Terminal
Navigate to this directory (`/2d`) in your terminal.

### 2. Start a Local Server
```powershell
python -m http.server 8000
```

### 3. Launch the Simulator
Open your browser and navigate to:
[http://localhost:8000](http://localhost:8000) (or `http://localhost:8000/2d/index.html` from repository root)

---

## 🏗️ Project Architecture

The 2D codebase is decoupled into modular ES6 components:

```text
2d/
├── index.html              # Modular entry point
├── css/
│   └── styles.css          # Grid UI styling
└── js/
    ├── main.js             # Application bootstrap
    ├── config.js           # Constants & hyperparameters
    ├── background.js       # Background animation
    ├── comparison.js       # Nine-algorithm comparison and charts
    ├── ui.js               # DOM manipulation & event listeners
    ├── grid.js             # Canvas rendering & grid logic
    ├── maze.js             # Procedural generation algorithms
    ├── history.js          # Undo/redo & state tracking
    └── pathfinding/
        ├── algorithms.js   # A*, Dijkstra, JPS, Theta*
        ├── dstar-lite.js   # Incremental D* Lite replanning
        ├── heuristics.js   # Distance functions
        └── qlearning.js    # Reinforcement learning agent
```

---

## 🧠 Why Modular?

- **Extensibility**: Want to add a new algorithm? Simply edit `js/pathfinding/algorithms.js`.
- **Readability**: Code is categorized by responsibility, making it easier to debug and understand.
- **Modern Standards**: Uses native `import`/`export` syntax for clean dependency management.

## Dynamic replanning with D* Lite

1. Choose **D* Lite ↻** in the **Algo** tab and click **Find Path**.
2. Draw or erase walls while searching or after a route appears. The active session repairs the route using its existing goal distances. Highway, traffic, and mud edits also trigger repairs.
3. **Pause** keeps edits queued without running the search; **Step** processes one queue expansion, and **Resume** continues at the selected speed. A blocked route stays active and recovers when you open a passage.

Repairs immediately clear the old route, cost, and agent overlay. Routes run from the selected start to the selected goal; the drone remains a route visualization. Moving either endpoint, changing diagonal movement, loading a maze, resizing, clearing, resetting, or selecting another algorithm clears the session. History navigation pauses D* Lite and previews search colors without replacing the live grid; Resume or Step returns to that live state, and map edits clear old snapshots.

D* Lite uses `g`/`rhs` goal distances and a lexicographic two-part priority queue, following [Koenig and Likhachev's D* Lite](https://idm-lab.org/bib/abstracts/Koen02e.html). Its automatic heuristic uses Manhattan distance for four-way movement or octile distance for eight-way movement, scaled by the minimum terrain cost (0.5). The heuristic buttons and weight slider are disabled for this algorithm. Terrain costs are charged on entry, and diagonal corner crossing follows the existing grid rules. Explored-node counts accumulate across repairs.

The other eight algorithms retain their existing search behavior. Both editions include D* Lite, comparison mode, RL training and policy overlays, mouse/touch editing, keyboard shortcuts, history, and exports.

## Keep both editions synchronized

From this directory, with Node.js 22 or later:

```powershell
npm ci
npm run build
npm run check:parity
npm test
```

`build` bundles the modular JavaScript into a classic inline script and embeds the shared stylesheet in `../metromind-2d.html`. The generated standalone file can be opened directly without a server, Node.js, or adjacent source files. The build also copies the repository-root `theme.css` into `2d/css/theme.css` and embeds it in the standalone. Grid Lab uses system fonts.

`check:parity` fails if the checked-in standalone file differs from a fresh build. `npm test` includes this drift check and runs the same interaction scenarios against the ES module entry point and the generated standalone script. Rebuild after editing any application HTML, CSS, or JavaScript. Commit the updated standalone file along with the modular source changes.

### Tests

After `npm ci`, run `npm test` from this directory. Tests compare initial and repaired routes against an independent Dijkstra solver, exercise obstacle and weighted-terrain changes in four/eight-way mode, and run the app's real control handlers with a simulated DOM and clock. All eight existing algorithms have smoke coverage. Edition parity tests also cover comparison, onboarding, touch edits, shortcuts, RL training and policy, and grid exports.

---

## 🛠️ Troubleshooting

### "The grid is blank and buttons do nothing!"
**Root Cause:** You are likely opening the HTML file directly from your file system (using the `file://` protocol). Modern browsers block ES6 module imports over `file://` due to CORS restrictions.

**The Fix:**
1. Open your terminal in the `2d` folder.
2. Run a local server: `python -m http.server 8000`.
3. Open `http://localhost:8000` in your browser.

Everything will work instantly — no code changes needed.

---

> [!TIP]
> If you don't have Python installed, you can also use Node.js (`npx serve`) or the **Live Server** extension in VS Code.

