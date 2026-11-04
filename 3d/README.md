# MetroMind AI — 3D edition

The 3D edition combines an editable city with the pathfinding and reinforcement learning tools from v11. Its source is kept separately so the established v11 edition remains independently maintainable.

## Open the simulator

Open `../MetroMind AI 3D.html` in a modern browser. The generated file includes the stylesheet, application code, Three.js and OrbitControls; it does not require npm or a development server. External web fonts are optional and have system-font fallbacks.

For development, serve this directory and open its `index.html`:

```powershell
python -m http.server 8000 --directory 3d
```

Then visit `http://localhost:8000`. Run that command from the repository root.

## Edit and rebuild

Edit the source files in this directory, then regenerate the standalone file from the repository root:

```powershell
node 3d/scripts/build.cjs
node 3d/scripts/build.cjs --check
node --test 3d/tests/engine.test.cjs 3d/tests/app.test.cjs 3d/tests/select.test.cjs
```

The builder uses only Node's built-in modules. It embeds local stylesheet and script references from `index.html`, preserves their order, and escapes script terminators so the generated HTML remains valid. `--check` reports a nonzero exit code when the standalone file differs from its sources. Do not edit the generated HTML directly.

| File | Responsibility |
| --- | --- |
| `index.html` | Workspace layout and accessible controls |
| `css/styles.css` | Responsive interface, typography and themes |
| `css/typography.css` | Readable text sizes, contrast, spacing and responsive type rules |
| `css/map-workspace.css` | Full-window map, floating controls and on-demand panels |
| `css/select.css` | Consistent dropdown buttons, option lists and focus states |
| `js/engine.js` | Grid data, search algorithms and Q-learning; exposes `MetroEngine` |
| `js/city.js` | Three.js city, cameras, lighting, traffic and route rendering; exposes `MetroCity` |
| `js/app.js` | UI state, editing, simulation controls, charts, persistence and exports |
| `js/select.js` | Accessible dropdowns with keyboard navigation and viewport placement |
| `vendor/three.min.js` | Bundled Three.js runtime |
| `vendor/OrbitControls.js` | Bundled Three.js camera controls |
| `scripts/build.cjs` | Deterministic standalone HTML builder |
| `tests/engine.test.cjs` | Search, terrain, import and dynamic replanning checks |
| `tests/app.test.cjs` | UI playback, learning, downloads, safe imports, dynamic edits and comparison cancellation |
| `tests/select.test.cjs` | Dropdown selection, keyboard isolation, focus, modal portals and viewport placement |

The previous 3D prototype is preserved separately in `../old_versions/MetroMind_AI_3D_original.html` when supplied with this update. The v11 standalone file is still generated from `../modular_version/` using its own documented workflow.

## Workspace

The city fills the window by default. Controls and Insights open as floating panels instead of reducing the map area; desktop panels leave the rest of the map interactive. On phones, the workspace menu provides the navigation tools. The small algorithm chip opens settings for the active search or learning mode.

The camera starts in a closer exploration view. Use the map zoom buttons or the scroll wheel to move in and out; **Fit city** shows the entire district. **G** hides the interface for an unobstructed view, and **G**, **Escape**, or **Show controls** restores it. Additional terrain and elevation tools expand from the editing palette.

Choose **More maps → Blank canvas** to build a layout from scratch. Editing is bounded by the selected grid; the surrounding ground is scenery. The search and learning models use grid cells internally, even when the camera is zoomed out over a larger area.

Dropdowns use the same visual style throughout the workspace. Arrow keys, Home/End and typeahead highlight an option; Enter commits it, Escape cancels, and Tab continues normal keyboard navigation. Menus stay within the window and appear above scrolling panels.

Use the city editing tools to place buildings, move the origin and destination, erase obstacles, or paint weighted terrain. Roads cost 1×, highways 0.5×, traffic 3× and rough ground 10×. Elevation can increase uphill travel cost. Diagonal movement never cuts through blocked corners.

Choose a search algorithm, adjust the heuristic and speed, then run or step through the search. Search history allows inspection of earlier states. D* Lite retains its goal-distance state to repair routes after map changes. BFS minimizes the number of steps on an unweighted graph, while DFS and Greedy do not promise a minimum-cost route. JPS is designed for uniform terrain; the interface identifies any necessary fallback rather than presenting it as a weighted JPS result.

The learning workspace trains a Q-learning agent and exposes its parameters, episode progress, reward trend and learned policy. Training performance depends on the layout and exploration settings; an incomplete policy is reported as such.

Compare algorithms against the same city, inspect live route/search statistics, and save or export layouts and results. Browser saves remain local to the current browser and origin. Downloaded JSON layouts provide a portable copy.

City camera and lighting controls provide isometric, top-down and street views, day/dusk/night lighting, automatic orbit, traffic visibility, reduced motion and rendering quality. Focus mode hides the interface. The city is a procedural simulation; roads, traffic and buildings visualize the editable grid rather than live map or traffic data.

## Controls

| Key | Action |
| --- | --- |
| `Space` | Run/pause search or agent training |
| `S` / `F` | Advance the search or recorded history |
| `B` | Review the previous search step |
| `R` | Reset the current route |
| `X` | Compare all nine algorithms |
| `T` | Switch to learning |
| `V` | Select the orbit tool |
| `1`–`4` | Building, origin, destination, erase |
| `5`–`7` | Highway, traffic, mud |
| `8` / `9` | Raise/lower elevation |
| `Shift` + draw | Temporarily erase |
| `C` | Open the map chooser, including a blank canvas |
| `G` | Hide/show map controls |
| `?` | Open the controls reference |
| `Esc` | Close the active dialog or drawer |

Drag with the orbit tool to rotate, scroll to zoom and right-drag to pan. Choose an editing tool before clicking or dragging over cells. The history slider moves through recorded search decisions; the finish button completes a search immediately.

## Format and verification limits

The city uses square grids; the environment selector offers 15, 20, 30, 40, 50 and 60 cells per side. Imports accept the current format, the original 3D format and v11 exports. Rectangular v11 maps retain their cell positions, with unused square space blocked. The JSON importer validates the entire layout before replacing the current city.

Search results report route vertices: Theta* can connect distant visible cells in one segment, so its vertex count is not directly comparable to a cell-by-cell route. Compute times measure algorithm work in the current browser and vary with hardware. Comparison runs use a snapshot of the same grid and movement settings; closing the dialog cancels pending comparison work.

The Node integration tests use the real search and learning engine with substitute DOM/canvas and scene objects. They verify behavior and data flow, while visual appearance, GPU compatibility and performance require browser validation.

## Dependencies

The local vendor files retain their upstream licenses. Updating Three.js or OrbitControls requires checking their compatibility together, rebuilding the standalone edition and validating rendering and editing in a browser. No package installation is needed for the normal build or the engine tests.
