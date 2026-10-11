# MetroMind AI — Modular Research Edition (v11.0)

![Modular Version](https://img.shields.io/badge/Edition-Modular%20Research-orange?style=for-the-badge) ![License](https://img.shields.io/badge/License-MIT-green?style=for-the-badge) ![JavaScript](https://img.shields.io/badge/Code-ES6%2B%20Modules-yellow?style=for-the-badge)

Welcome to the **Modular Edition** of MetroMind AI. This version is designed for developers, researchers, and AI enthusiasts who wish to study, extend, or replace individual components of the simulation engine.

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
    ├── ui.js               # DOM Manipulation & Event Listeners
    ├── grid.js             # Canvas Rendering & Grid Logic
    ├── maze.js             # Procedural Generation Algorithms
    ├── history.js          # Undo/Redo & State Tracking
    └── pathfinding/
        ├── algorithms.js   # A*, Dijkstra, JPS, Theta*
        ├── heuristics.js   # Distance functions
        └── qlearning.js    # Reinforcement Learning Agent
```

---

## 🧠 Why Modular?

- **Extensibility**: Want to add a new algorithm? Simply edit `js/pathfinding/algorithms.js`.
- **Readability**: Code is categorized by responsibility, making it easier to debug and understand.
- **Modern Standards**: Uses native `import`/`export` syntax for clean dependency management.

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

