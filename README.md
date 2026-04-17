# MetroMind AI — Advanced Pathfinding & RL Simulator (v9.0)

![MetroMind AI](https://img.shields.io/badge/Status-Modularization%20Complete-success?style=for-the-badge) ![Version](https://img.shields.io/badge/Version-9.0--Modular-blue?style=for-the-badge) ![AI Project](https://img.shields.io/badge/AI%20Paradigm-Classical%20%2B%20RL-purple?style=for-the-badge)

**MetroMind AI** is a premium, high-performance simulation platform designed to explore and visualize the intersection of classical pathfinding algorithms and modern Reinforcement Learning. Built with a sleek cyberpunk aesthetic, it provides an interactive playground for urban routing optimization, weighted terrain analysis, and autonomous agent training.

---

## 📖 Table of Contents

- [Overview](#overview)
- [Key Features](#key-features)
- [Reinforcement Learning Dashboard](#reinforcement-learning-dashboard)
- [Algorithms & Logic](#algorithms--logic)
- [Modern Architecture](#modern-architecture)
- [Usage Guide](#usage-guide)
- [Technical Implementation](#technical-implementation)

---

## 🌟 Overview

MetroMind AI transforms traditional grid-search visualization into a comprehensive **AI learning platform**. Version 9.0 introduces a modular engine that separates search logic from UI rendering, alongside a sophisticated **Q-Learning** module where agents learn to navigate complex urban landscapes through trial-and-error.

---

## ✨ Key Features (v9.0)

1. **🧠 Reinforcement Learning Dashboard**: Watch a Q-Learning agent evolve. Featuring live Q-value heatmaps, policy arrow overlays, and reward convergence charts.
2. **Modular ES6+ Architecture**: Fully refactored codebase for maximum maintainability and performance. Separation of concerns between UI, Grid, Logic, and Algorithms.
3. **Advanced Pathfinding**: Includes 8+ state-of-the-art algorithms:
   - **Optimized**: Jump Point Search (JPS) ⚡ & Theta* (Any-Angle) ∠.
   - **Classical**: A*, Dijkstra, Bidirectional A*, BFS, DFS, Greedy BFS.
4. **Weighted Urban Terrain**: Paint the city with Highways (0.5x), Traffic (3.0x), and Mud (10.0x) to observe how cost-sensitive AI makes decisions.
5. **Interactive System Log & Step History**: Frame-by-frame debug capability with the ability to step backward (B) and forward (F) through the search history.
6. **Comparison Mode**: Snapshots of 4 algorithms running simultaneously with real-time performance analytics and "Winner" badges.
7. **Organis Generation**: Perlin Noise integration for organic city/maze layouts.

---

## 🧠 Reinforcement Learning Dashboard

The RL suite provides a deep dive into autonomous learning:
- **Heatmap Overlay**: Real-time coloring of cells based on maximum predicted Q-values.
- **Policy Arrows**: Visualizes the agent's preferred direction for every single cell (confidence-based opacity).
- **Training Controls**: Adjustable Alpha (Learning Rate), Gamma (Discount Factor), and Epsilon (Exploration) decay.
- **Convergence Charts**: Live sparklines tracking average rewards across thousands of training episodes.

---

## 🏗️ Technical Implementation

### Modern Architecture
The project is organized into a modular structure to support future scale:
- `js/main.js`: Main entry point and event orchestration.
- `js/grid.js`: Core canvas rendering and cell state management.
- `js/ui.js`: HUD animations, theme logic, and sidebar interactions.
- `js/pathfinding/`: Dedicated implementations for classical search and RL agents.
- `js/maze.js`: Procedural generation and layout templates.

### Performance & Style
- **Engine**: Vanilla ES6+ JS with `requestAnimationFrame` for stutter-free 60FPS+ visualization.
- **Styling**: Premium CSS3 variables for "Neon-Dark" and "Clinical-Light" aesthetics, featuring glassmorphism and scanline overlays.
- **Optimization**: O(log n) Priority Queues (Min-Heaps) for frontier management.

---

## 🛠️ Quick Start

1. Open `MetroMind_AI_v9.html` in any modern web browser.
   > [!NOTE]
   > Due to the modular architecture (ES6 Imports), this requires running via a local server (e.g., `python -m http.server 8000` or VS Code Live Server).
2. Use the **Tool Selection** (top bar) to draw walls or terrains.
3. Select an **Algorithm** or switch to the **RL Agent** tab to begin training.
4. Use **Keyboard Shortcuts**: `Space` (Play/Pause), `C` (Clear), `Tab` (Toggle Sidebar).

---

## 🗺️ Roadmap
Check out [future.md](future.md) for details on Multi-Agent coordination, GIS integration, and D* Lite dynamic replanning.
