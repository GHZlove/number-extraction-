# Number Extraction

**Merge equal numbers. Choose your fights. Extract with the loot.**

A single-player HTML5 Canvas prototype combining number merging, exploration, tactical combat and extraction. Start each raid at **1**, grow by merging, collect supplies and reach an exit before time runs out. Loot becomes permanent currency only after a successful extraction.

**Version:** 0.1.0 · **Game UI:** Simplified Chinese · **Hosted demo:** Restricted access

[简体中文](README.zh-CN.md) · [Game design](docs/GAME_DESIGN.md) · [Architecture](docs/ARCHITECTURE.md) · [Testing notes](docs/TESTING.md)

The detailed design, architecture and testing documents are currently in Chinese.

## Gameplay

Each raid follows this loop:

**Deploy → Merge → Explore → Fight or evade → Collect loot → Extract → Upgrade**

- **Equal-number merging:** neutral tiles merge only when their value matches the player. Growth is capped at 2048; living enemies must be defeated before their dropped number can be merged.
- **Tactical combat:** pulse attacks, telegraphed enemy attacks, dodging and a limited-use **÷2** ability create ways to challenge stronger enemies.
- **Risk and reward:** three map regions offer different enemies and loot values. Each raid has a seven-minute deadline.
- **Extraction:** remain still inside a green exit circle and hold **E** for four seconds. Moving, releasing the key or taking damage interrupts the progress.
- **Persistent progression:** extracted loot converts to base currency for backpack and starting-supply upgrades. Death or timeout loses raid loot while preserving previously banked assets.

## Run locally

### Requirements

- Python 3 to serve static files.
- A modern browser with JavaScript enabled.
- Optional: Node.js **22 or newer** for automated checks.

There are no third-party package dependencies and no build step.

Clone the repository, or download and extract the complete source archive:

```bash
git clone https://github.com/GHZlove/number-extraction-.git number-extraction
cd number-extraction
```

Repository access is required while the source remains private.

### Windows

Double-click `start-windows.bat`, or run this from the project root:

```powershell
py -3 -m http.server 8000 --bind 127.0.0.1 --directory dist
```

If the Python launcher is unavailable, use:

```powershell
python -m http.server 8000 --bind 127.0.0.1 --directory dist
```

### macOS / Linux

```bash
python3 -m http.server 8000 --bind 127.0.0.1 --directory dist
```

Open [http://localhost:8000](http://localhost:8000) and select **开始行动** (Start raid). Keep the terminal open; press **Ctrl+C** to stop the server. If port 8000 is occupied, change both the command and the browser address to another port.

ES modules require an HTTP server; opening `dist/index.html` directly as a local file is unsupported. The Python server only serves files. The game simulation runs in the browser.

## Controls

| Input | Action |
| --- | --- |
| WASD / arrow keys | Move |
| Space / left mouse button | Attack the nearest eligible enemy in range; hold to repeat |
| Q | Spend one ÷2 charge to weaken and interrupt an eligible enemy |
| Shift | Dodge in the movement direction with brief invulnerability |
| Hold E | Search a nearby chest or extract while stationary |
| R | Spend a repair kit to restore 30 health |
| Esc | Pause / resume |

Touch controls include a virtual joystick and action buttons. Physical-device touch input, screen rotation and Safari compatibility still need validation. Sound is optional and starts disabled.

### Try a first extraction

1. Move right through the initial **1 → 2 → 4** tile chain to reach player value **8**. The third tile is slightly above the others.
2. Find the starter chest near `(485, 1190)`. Stand still and hold **E** for about 0.75 seconds to collect loot worth **24** and one ÷2 charge.
3. Avoid the nearby hunter, or use its attack warning, **Q** and **Shift** to practise combat.
4. Return left, then head north to the western exit at `(310, 530)`.
5. Enter the green circle, release movement controls and hold **E** for four uninterrupted seconds. A successful result banks the loot value.

The tutorial tiles and chest are fixed; the rest of the map varies by seed. Enemies can still approach the tutorial area.

## Architecture

The project uses JavaScript ES modules, Canvas 2D, DOM-based UI, Web Audio and browser local storage. The ten JavaScript modules separate game rules from browser interaction.

| Module | Responsibility |
| --- | --- |
| `dist/src/config.js` | Balance settings, region definitions and upgrades |
| `dist/src/math.js` | Damage formulas, seeded randomness, collision and line-of-sight geometry |
| `dist/src/world.js` | Map, enemy and loot generation |
| `dist/src/game.js` | `Raid` simulation, combat, interaction and run results |
| `dist/src/input.js` | Keyboard, mouse and touch input |
| `dist/src/renderer.js` | World, camera, effects and minimap rendering |
| `dist/src/ui.js` | HUD, dialogs and base interface |
| `dist/src/storage.js` | Save validation, settlement and upgrades |
| `dist/src/audio.js` | Optional synthesised sound effects |
| `dist/src/main.js` | Startup, fixed-step loop and event routing |

### Engineering decisions

- **Testable simulation:** `Raid` does not access the DOM or local storage, allowing direct Node.js tests.
- **Fixed simulation step:** gameplay advances at 1/60 second per step. Catch-up time is capped at 0.1 seconds to limit large jumps after stalls; sustained low frame rates can still slow simulation time.
- **Collision and visibility:** movement is split into substeps to prevent dashes crossing thin walls. Line-of-sight checks constrain attacks and division.
- **Controlled growth:** combat uses logarithmic number tiers rather than directly scaling damage with the displayed number.
- **Save handling:** data is validated on load, unavailable storage falls back to session-only play, and repeated settlement is guarded in the current single-tab flow.

## Automated checks

From the project root, with Node.js 22 or newer:

```bash
node tools/check.mjs
node --test tests/game.test.js
```

The equivalent npm commands are `npm run check` and `npm test`; no `npm install` is required.

The v0.1 baseline has **10 modules passing syntax/reference checks and 19 passing tests**. Coverage includes merging, combat rules, movement, interrupted extraction, a complete loot–extract–upgrade cycle, failure settlement, save handling and upgrade limits.

Map checks sample **100 seeds** for safe object placement and **25 seeds** for exit reachability on a navigation grid. These samples do not prove that every possible map is reachable. Automated tests do not verify rendering, native browser input, audio or device performance. See [testing notes](docs/TESTING.md) for manual scenarios and earlier verification records.

## Persistence and limitations

- Saves belong to the current browser and site origin. Local and hosted copies have separate progress; clearing site data removes saves, and private browsing may not retain them.
- Only settled progress is saved. Refreshing or closing the page does not preserve an active raid or bank its loot. Concurrent tabs can overwrite local progress.
- The base currently stores currency, upgrade levels and recent run records. Extracted items are converted automatically; equipment storage, item dropping and trading are not implemented.
- Enemy behaviour uses direct pursuit and local patrols; obstacle-aware pathfinding is not implemented.
- This is a single-player prototype with no multiplayer or cloud synchronisation. Game code has no application-level network requests or telemetry.
- Mobile devices, Safari, long sessions, low-performance hardware and gameplay balance need further testing. An English in-game interface and public showcase are future work.

## Documentation

- [Chinese README](README.zh-CN.md): original quick start and gameplay guide.
- [Game design](docs/GAME_DESIGN.md): formulas, map rules, economy and proposed iterations.
- [Architecture](docs/ARCHITECTURE.md): module boundaries, simulation, collision and persistence.
- [Testing](docs/TESTING.md): automated coverage, manual checks and verification limits.

## License

A license has not been selected for this project.
