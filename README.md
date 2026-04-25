# MetroMind AI — Advanced Pathfinding & RL Simulator (v11.0)

![MetroMind AI](https://img.shields.io/badge/Status-Full%20Feature%20Release-success?style=for-the-badge) ![Version](https://img.shields.io/badge/Version-11.0--Standalone-blue?style=for-the-badge) ![AI Project](https://img.shields.io/badge/AI%20Paradigm-Classical%20%2B%20RL-purple?style=for-the-badge)

**MetroMind AI** is a premium, high-performance simulation platform designed to explore and visualize the intersection of classical pathfinding algorithms and modern Reinforcement Learning. Built with a sleek cyberpunk aesthetic, it provides an interactive playground for urban routing optimization, weighted terrain analysis, and autonomous agent training.

---

## Table of Contents

- [Overview](#overview)
- [Key Features](#key-features-v110)
- [Keyboard Shortcuts](#keyboard-shortcuts)
- [Reinforcement Learning Suite](#reinforcement-learning-suite)
- [Technical Implementation](#technical-implementation)
- [Quick Start](#quick-start)
- [Roadmap](#roadmap)

---

## Overview

MetroMind AI transforms traditional grid-search visualization into a comprehensive **AI learning platform**. Version 11 introduces a highly optimized, **all-in-one standalone engine** that packs advanced pathfinding logic, a Q-Learning agent, and real-time performance analytics into a single high-performance file.

---

## Key Features (v11.0)

1. **Q-Learning Reinforcement Learning**: Train an autonomous agent to navigate complex grids. Featuring live Q-value heatmaps, policy arrow overlays, and reward convergence sparklines.
2. **Algorithm Comparison Mode**: Run and compare 8 different algorithms simultaneously with real-time performance tracking and "Winner" badges for Speed and Optimality.
3. **Advanced Pathfinding Suite**: Includes 8 state-of-the-art algorithms:
    - **Optimized**: Jump Point Search (JPS) & Theta* (Any-Angle).
    - **Classical**: A*, Dijkstra, Bidirectional A*, BFS, DFS, Greedy BFS.
4. **Weighted Urban Terrain**: Simulate realistic city conditions with **Highways (0.5x)**, **Heavy Traffic (3.0x)**, and **Mud (10.0x)**.
5. **📊 Export & Analytics**: Download full run statistics as **CSV** or grid layouts as **JSON** for external analysis.
6. **🌌 Premium Visuals**: Cyberpunk dark mode with glassmorphism, scanlines, and reactive background animations that pulse with search intensity.
7. **🖥️ Full-Screen HUD**: Immersive full-screen mode with an integrated telemetry HUD for focused experiments.
8. **📱 Full Mobile Support**: Fully responsive design with intelligent sidebar drawers and touch-optimized controls. Panels auto-collapse on smaller screens to maximize grid real estate.

---

## Keyboard Shortcuts

| Key | Action |
| :--- | :--- |
| `Space` | Play / Pause Search |
| `X` | Algorithm Comparison Mode |
| `Tab` | Toggle Sidebar Panels |
| `G` | Toggle Fullscreen Mode |
| `1` - `4` | Select Tools (Wall, Start, Goal, Erase) |
| `5` - `7` | Select Terrain (Highway, Traffic, Mud) |
| `S` / `F` | Step Search / Fast Forward |
| `B` | Step Backward through History |
| `R` | Reset Current Path |
| `C` | Clear Grid Entirely |
| `?` | Show Shortcuts Panel |

---

## Reinforcement Learning Suite

The RL dashboard provides a deep dive into autonomous learning:

- **Heatmap Overlay**: Real-time coloring of cells based on maximum predicted Q-values.
- **Policy Arrows**: Visualizes the agent's preferred direction for every cell with confidence-based opacity.
- **Hyperparameter Control**: Adjust Learning Rate (α), Discount Factor (γ), and Epsilon Decay live.
- **Convergence Tracking**: Multi-metric sparklines tracking episodes, epsilon decay, and average rewards.

---

## Technical Implementation

### All-in-One Engine

Version 11 consolidates the project into a high-performance standalone HTML file for easier deployment and portability, while maintaining the modular architecture internally.

- **Core Engine**: Vanilla ES6+ JS with `requestAnimationFrame` for smooth 60FPS+ rendering.
- **Data Structures**: Optimized Min-Heaps (Priority Queues) for O(log n) frontier management.
- **Styling**: Extensive use of CSS3 variables and backdrop filters for a premium UI feel.

### Multi-Platform & Mobile Optimization

- **Responsive Architecture**: Adaptive layouts using advanced CSS Grid/Flexbox and media queries.
- **Mobile UX**: Custom drawer-style sidebars with `position: absolute` on small screens, featuring auto-closing logic and touch-backdrop support.
- **Standalone HUD**: `MetroMind_AI_v11.html` (Full cross-device feature set).
- **Modular**: Found in the `/modular_version` directory for extension.

---

## Quick Start

1. Open `MetroMind_AI_v11.html` in any modern web browser.
2. Use the **Tool Selection** (top bar or `1-7`) to draw walls or terrains.
3. Choose an algorithm in the **Algo** tab or switch to the **RL** tab.
4. Press `Space` to solve or click **Train Agent** to begin the RL training loop.
5. **Pro Tip**: Press `X` to watch all 8 algorithms race to the goal!

---

## Roadmap

- [ ] D* Lite for dynamic replanning in changing environments.
- [ ] Multi-agent coordination and collision avoidance.
- [ ] 3D visualization mode using Three.js.
- [ ] GIS data ingestion for real-world city map simulation.
