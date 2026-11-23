# MetroMind AI — 2D Grid Lab

Grid Lab is the flat-grid edition of MetroMind. Paint terrain, watch the search expand one cell at a time, and compare nine pathfinding algorithms on the same map. It shares the landing dashboard’s dark mint palette, skyline mark, and typography. The **Light theme** button in the header switches the workspace and canvas palette.

[Offline Grid Lab](../metromind-2d.html) · [Dashboard and algorithm comparison](../index.html#algorithms) · [3D City Studio guide](../3d/README.md)

## Quick start

Download [metromind-2d.html](../metromind-2d.html) and open it directly in a modern browser. The standalone file includes its CSS and JavaScript and works offline.

To run the editable edition, start a server from the `2d` directory.

```powershell
python -m http.server 8000
```

Open [Grid Lab](http://localhost:8000/). If the server started from the repository root, open [Grid Lab under /2d/](http://localhost:8000/2d/).

## Use Grid Lab

1. Pick a grid size or maze in **Tools**. Drag a brush across the grid to place walls or paint highway (0.5×), traffic (3×), or mud (10×).
2. Use **Start** and **Goal** to place the route endpoints. In **Algo**, choose a search strategy, then select **Find Path**.
3. Use **Step** or the history buttons to inspect the search. Open **Stats** or the algorithm log to see what the search explored. Select **Compare All** to run all nine searches on the same grid.

Open **RL** to train a Q-learning agent and inspect its policy and training statistics. Use **Export Stats CSV** or **Export Grid JSON** in **Tools** to save results or a map.

| Key | Action |
| --- | --- |
| `Space` | Start or pause search |
| `X` | Compare all nine algorithms |
| `S` | Advance the search one step |
| `B` / `F` | Move backward or forward through search history |
| `R` | Reset the route |
| `Tab` | Toggle the tools sidebar |
| `G` | Focus on the grid |
| `?` | Open the shortcut guide |

## Dynamic replanning with D* Lite

1. Choose **D* Lite** in **Algo** and select **Find Path**.
2. Draw or erase walls while searching or after a route appears. The active session repairs the route using its existing goal distances. Highway, traffic, and mud edits also trigger repairs.
3. Use **Pause** to queue edits, **Step** to process one queue expansion, or **Resume** to continue at the selected speed. If the route is blocked, opening a passage lets the active session recover.

An edit clears the previous route, cost, and agent overlay. Moving an endpoint, changing diagonal movement, loading a maze, resizing, clearing, resetting, or choosing another algorithm resets the session. History navigation pauses the search and shows a recorded state. **Resume** and **Step** return to the live grid, and map edits clear old snapshots.

D* Lite keeps `g` and `rhs` goal distances and uses a two-part priority key. It chooses Manhattan distance for four-way movement and octile distance for eight-way movement, scaled to the minimum terrain cost of 0.5. Terrain is charged on entry. The heuristic and weight controls are disabled for D* Lite. Explored-node counts accumulate across repairs. See [Koenig and Likhachev’s D* Lite paper](https://idm-lab.org/bib/abstracts/Koen02e.html).

## Source layout

| File | Responsibility |
| --- | --- |
| `index.html` | ES-module entry point and workspace controls |
| `css/theme.css` | Generated copy of the repository’s [shared theme](../theme.css) |
| `css/styles.css` | Grid Lab layout, controls, and light theme |
| `js/main.js` | Bootstrap, playback, and app state |
| `js/config.js` and `js/grid.js` | Grid settings, canvas colors, rendering, and input |
| `js/ui.js` and `js/background.js` | Interface events, panels, and background animation |
| `js/maze.js` and `js/history.js` | Map generation and search snapshots |
| `js/comparison.js` | Algorithm comparison and charts |
| `js/pathfinding/` | Search, D* Lite repair, heuristics, and Q-learning |
| `scripts/build-standalone.js` | Offline HTML builder and parity check |

## Keep both editions synchronized

Run these commands from the `2d` directory with Node.js 22 or later.

```powershell
npm ci
npm run build
npm run check:parity
npm test
```

`build` copies the [repository theme](../theme.css) into `css/theme.css`, bundles the modular JavaScript, and embeds both CSS files in [metromind-2d.html](../metromind-2d.html). Edit the original source files and regenerate the standalone after a change. Edit the repository-root theme for palette, typography, or skyline mark updates.

`check:parity` checks both the local theme copy and the offline build. The tests compare D* Lite routes against an independent Dijkstra solver and exercise app controls, playback, comparison, learning, and exports in the modular and standalone builds.

## Troubleshooting

If `2d/index.html` opens to a blank grid from your file system, serve the `2d` directory over HTTP so the browser can load its modules. The [standalone Grid Lab file](../metromind-2d.html) can be opened directly.
