# MetroMind AI — Modular Research Edition (v11.0)

![Modular Version](https://img.shields.io/badge/Edition-Modular%20Research-orange?style=for-the-badge) ![License](https://img.shields.io/badge/License-MIT-green?style=for-the-badge) ![JavaScript](https://img.shields.io/badge/Code-ES6%2B%20Modules-yellow?style=for-the-badge)

Welcome to the **Modular Edition** of MetroMind AI. This version is designed for developers, researchers, and AI enthusiasts who wish to study, extend, or replace individual components of the simulation engine.

Both editions share the same interface and behavior. The root `MetroMind_AI_v11.html` is generated from this directory's HTML, CSS, and JavaScript; it embeds everything needed to run the simulator as a single file. Edit the modular sources and rebuild the standalone file instead of editing two implementations.

---

## 🚀 Quick Start Instructions

Because this version utilizes **ES6 JavaScript Modules**, it cannot be run by simply double-clicking the HTML file. It requires a local web server to handle module resolution and security policies.

### 1. Open your Terminal
Navigate to this directory (`/modular_version`) in your preferred terminal (PowerShell, CMD, or Bash).

### 2. Start a Local Server
The easiest way is using Python, which is built into most systems:

```powershell
# In this directory:
python -m http.server 8000
```

### 3. Launch the Simulator
Open your browser and navigate to:
[http://localhost:8000/MetroMind_AI_v11.html](http://localhost:8000/MetroMind_AI_v11.html)

---

## 🏗️ Project Architecture

Unlike the standalone version, the code here is decoupled into logical modules:

```text
modular_version/
├── MetroMind_AI_v11.html  # Entry point
├── css/
│   └── styles.css          # Premium UI Styling
└── js/
    ├── main.js             # Application Bootstrap
    ├── config.js           # Constants & Hyperparameters
    ├── background.js       # Reactive background animation
    ├── comparison.js       # Nine-algorithm comparison and charts
    ├── ui.js               # DOM Manipulation & Event Listeners
    ├── grid.js             # Canvas Rendering & Grid Logic
    ├── maze.js             # Procedural Generation Algorithms
    ├── history.js          # Undo/Redo & State Tracking
    └── pathfinding/
        ├── algorithms.js   # A*, Dijkstra, JPS, Theta*
        ├── dstar-lite.js   # Incremental D* Lite replanning
        ├── heuristics.js   # Distance functions
        └── qlearning.js    # Reinforcement Learning Agent
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

`build` bundles the modular JavaScript into a classic inline script and embeds the shared stylesheet in `../MetroMind_AI_v11.html`. The generated standalone file can be opened directly without a server, Node.js, or adjacent source files. Both editions use the same optional Google Fonts stylesheet and fall back to system fonts when offline.

`check:parity` fails if the checked-in standalone file differs from a fresh build. `npm test` includes this drift check and runs the same interaction scenarios against the ES module entry point and the generated standalone script. Rebuild after editing any application HTML, CSS, or JavaScript. Commit the updated standalone file along with the modular source changes.

### Tests

After `npm ci`, run `npm test` from this directory. Tests compare initial and repaired routes against an independent Dijkstra solver, exercise obstacle and weighted-terrain changes in four/eight-way mode, and run the app's real control handlers with a simulated DOM and clock. All eight existing algorithms have smoke coverage. Edition parity tests also cover comparison, onboarding, touch edits, shortcuts, RL training and policy, and grid exports.

---

## 🛠️ Troubleshooting

### "The grid is blank and buttons do nothing!"
**Root Cause:** You are likely opening the HTML file directly from your file system (using the `file://` protocol). Modern browsers block ES6 module imports over `file://` due to CORS restrictions.

**The Fix:**
1. Open your terminal in the `modular_version` folder.
2. Run a local server: `python -m http.server 8080`.
3. Open `http://localhost:8080/MetroMind_AI_v11.html` in your browser.

Everything will work instantly — no code changes needed.

---

> [!TIP]
> If you don't have Python installed, you can also use Node.js (`npx serve`) or the **Live Server** extension in VS Code.

