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
node --test 3d/tests/engine.test.cjs 3d/tests/app.test.cjs 3d/tests/select.test.cjs 3d/tests/city.test.cjs 3d/tests/traffic.test.cjs 3d/tests/traffic-flow.test.cjs
```

The builder uses only Node's built-in modules. It embeds local stylesheet and script references from `index.html`, preserves their order, and escapes script terminators so the generated HTML remains valid. `--check` reports a nonzero exit code when the standalone file differs from its sources. Do not edit the generated HTML directly.

| File | Responsibility |
| --- | --- |
| `index.html` | Workspace layout and accessible controls |
| `css/styles.css` | Responsive interface, typography and themes |
| `css/typography.css` | Readable text sizes, contrast, spacing and responsive type rules |
| `css/map-workspace.css` | Full-window map, floating controls and on-demand panels |
| `css/tools.css` | Stable map tool rail and labeled terrain/elevation flyout |
| `css/select.css` | Consistent dropdown buttons, option lists and focus states |
| `css/builder.css` | Free Build toolbar, brush controls and canvas editing hints |
| `css/commands.css` | Floating simulation and environment controls, panel pins and responsive panel layout |
| `css/polish.css` | Readable typography, custom scrollbars, inset speed control and interactive compass styling |
| `css/mobile.css` | Touch targets, phone and tablet layouts, and safe screen insets |
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
| `tests/city.test.cjs` | Route visibility, learned-value columns, particles, motion and graphics-resource lifecycle using real Three.js without a GPU |
| `tests/traffic.test.cjs` | Lane continuity, turns, heading, spacing, valid roads, timing and car-state preservation using real Three.js transforms |
| `tests/traffic-flow.test.cjs` | Sustained traffic flow, independent body-overlap checks and block-sized travel on actual generated maps |

The previous 3D prototype is preserved separately in `../old_versions/MetroMind_AI_3D_original.html` when supplied with this update. The v11 standalone file is still generated from `../modular_version/` using its own documented workflow.

## Workspace

The city fills the window by default. A compact floating group provides Free Build, Controls, Compare and Insights. The sidebar keeps Learning, Layers, Display and Help. A small environment card exposes grid size, maps, regeneration, diagonal movement and live replanning. Algorithm and speed sit in a floating capsule above playback; Learning mode offers episode count and Test policy there. Opening Controls brings the actual algorithm, speed and grid fields into the panel, retaining their values. Closing the panel returns them to their floating positions.

Use the sidebar icon beside the MetroMind logo to hide or show the sidebar. The map expands into the freed space, and the choice is remembered on this browser. On phones, the workspace menu provides the sidebar's actions.

On a touch screen, drag with one finger to orbit in Navigate mode. Pinch to zoom and drag with two fingers to pan. In Free Build, choose a brush to draw with one finger, or choose Navigate to move around. Find city lighting under Display and grid settings under Controls on phones.

Controls and Insights open as floating panels. Pin either panel with its header pin button to keep it open while running, generating maps, comparing algorithms, editing, or opening the other panel. Unpinning leaves the panel open; its close button unpins and closes it explicitly. Both panels can remain open on desktop. On phones, the selected panel appears in front while another pinned panel retains its state. Focus mode temporarily hides pinned panels and restores them afterward.

The camera starts in a closer exploration view. Use the map zoom buttons or the scroll wheel to move in and out; **Fit city** shows the entire district. **G** hides the interface for an unobstructed view, and **G**, **Escape**, or **Show controls** restores it. The current generated map is identified in the header as **Map · Downtown** by default. Additional terrain and elevation tools open in a labeled flyout beside the primary tool rail, which stays in place. Use the flyout's close button or Escape to dismiss it.

The compass follows the camera's bearing as you orbit, with north at 000°. Click it to face north while retaining the current target, tilt and zoom. Resetting north also stops automatic orbit. The speed control shows its current value and filled track in both the floating dock and Controls panel. Scrollable panels, menus and dialogs share custom scrollbars.

Open the floating **Free Build** button, or press **E**, to edit the current city without replacing it. Draw beyond its edge to expand the canvas automatically, up to 200 × 200 blocks. Existing buildings, streets and endpoint positions stay in the same world locations as the canvas grows. Choose **Done**, or press **E** again, to keep the map and return to simulation.

Free Build uses a bounded floating editor dock with drawing tools, Surface, Brush width, Guides, undo/redo, New canvas and Done directly accessible. The dock arranges its controls into rows at narrower widths. New canvas starts undeveloped ground with two endpoint cells. Select Road and drag a street between the origin and destination; unbuilt ground is not traversable. Surface offers Street (1×), Highway (0.5×), Traffic (3×) and Mud (10×), and Brush width offers 1, 3 or 5 blocks. Place buildings, erase development, or move either endpoint with the toolbar tools. Guides reveals the hidden cells. Undo and redo buttons, Ctrl+Z and Ctrl+Y restore complete build strokes, including canvas growth.

The search and learning models still use a computational grid beneath the freehand editing tools. Free Build provides an expanding canvas with hidden guides, rather than an infinite canvas or a vector road graph. Outside Free Build, ordinary editing remains bounded by the selected grid and the surrounding ground is scenery.

Dropdowns use the same visual style throughout the workspace. Arrow keys, Home/End and typeahead highlight an option; Enter commits it, Escape cancels, and Tab continues normal keyboard navigation. Menus stay within the window and appear above scrolling panels.

Use the city editing tools to place buildings, move the origin and destination, erase obstacles, or paint weighted terrain. Roads cost 1×, highways 0.5×, traffic 3× and rough ground 10×. Elevation can increase uphill travel cost. Diagonal movement never cuts through blocked corners.

Choose a search algorithm, adjust the heuristic and speed, then run or step through the search. Search history allows inspection of earlier states. D* Lite retains its goal-distance state to repair routes after map changes. BFS minimizes the number of steps on an unweighted graph, while DFS and Greedy do not promise a minimum-cost route. JPS is designed for uniform terrain; the interface identifies any necessary fallback rather than presenting it as a weighted JPS result.

The learning workspace trains a Q-learning agent and exposes its parameters, episode progress, reward trend and learned policy. Training performance depends on the layout and exploration settings; an incomplete policy is reported as such.

Compare algorithms against the same city, inspect live route/search statistics, and save or export layouts and results. Browser saves remain local to the current browser and origin. Downloaded JSON layouts provide a portable copy.

City camera and lighting controls provide isometric, top-down and street views, day/dusk/night lighting, automatic orbit, traffic visibility, reduced motion and rendering quality. Focus mode hides the interface. The city is a procedural simulation; roads, traffic and buildings visualize the editable grid rather than live map or traffic data.

The route uses thick geometry and a larger moving beacon, drawn above buildings and overlays so the full searched path stays visible. **Display** includes **Q-value landscape** and **Floating particles** switches. Both start enabled. The landscape updates from the Q-learning agent's actual best legal-action value at each visited cell, independently of the heatmap and policy arrows. Column height follows the logarithmic magnitude of Q; mint means nonnegative and violet means negative. Heights are capped for readability, so they indicate value magnitude rather than a linear numeric scale. Unvisited, blocked and undeveloped cells have no columns. Resetting the agent, changing the map or leaving Learning clears the landscape.

Floating coloured lights drift above the district. Reduced motion keeps the particles and route beacon still and applies learned column heights without an animated transition. Display choices remain active when closing and reopening the panel or rebuilding the 3D scene during the current session.

Decorative cars follow non-crossing circuits around blocks and district boundaries, with curved turns and U-turns at dead ends. Tiny loops inside broad paved avenues are excluded. Their orientation and headlights follow the path tangent, and travel time carries across cell boundaries. Circular following distance keeps a clear gap between cars, and circuit capacities limit crowding. This avoids cars entering mutually blocking junction turns. They spawn only on connected, developed streets and avoid buildings, mud and changes in road height; the city uses stepped terrain rather than road ramps. Valid cars keep their world positions through graphics rebuilds and Free Build canvas growth. The Street traffic switch hides or shows them, while Reduced motion leaves enabled cars visible and parked.

## Controls

| Key | Action |
| --- | --- |
| `Space` | Run/pause search or agent training |
| `S` / `F` | Advance the search or recorded history |
| `B` | Review the previous search step |
| `R` | Reset the current route |
| `X` | Compare all nine algorithms |
| `T` | Switch to learning |
| `E` | Enter/leave Free Build, keeping the current map |
| `P` | Select the Road brush in Free Build |
| `Ctrl+Z` / `Ctrl+Y` | Undo/redo a Free Build stroke |
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

The city uses square grids; the regular environment selector offers 15, 20, 30, 40, 50, 60, 70, 80, 90 and 100 cells per side. Free Build starts a new canvas at 30 × 30 cells and expands automatically to a maximum of 200 × 200. JSON saves include the world origins, developed-cell mask and Free Build mode; importing a Free Build layout restores its positions and reopens the editor. Imports also accept the original 3D format and v11 exports. Rectangular v11 maps retain their cell positions, with unused square space blocked. The JSON importer validates the entire layout before replacing the current city.

Search results report route vertices: Theta* can connect distant visible cells in one segment, so its vertex count is not directly comparable to a cell-by-cell route. Compute times measure algorithm work in the current browser and vary with hardware. Comparison runs use a snapshot of the same grid and movement settings; closing the dialog cancels pending comparison work.

The Node integration tests use the real search and learning engine with substitute DOM/canvas and scene objects. They verify behavior and data flow, while visual appearance, GPU compatibility and performance require browser validation.

## Dependencies

The local vendor files retain their upstream licenses. Updating Three.js or OrbitControls requires checking their compatibility together, rebuilding the standalone edition and validating rendering and editing in a browser. No package installation is needed for the normal build or the engine tests.
