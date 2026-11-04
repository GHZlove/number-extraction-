# Number Extraction

### A 2048-inspired extraction game with tactical combat and a persistent shelter.

**Merge your way up. Choose your fights. Bring something home.**

Start as the number **1** in a procedurally generated combat zone. Merge equal numbers to grow, use division and temporary abilities to challenge stronger enemies, and decide when to extract with your loot. Each successful expedition funds a shelter that improves the next one.

Number Extraction is a game development portfolio project built with **vanilla JavaScript and HTML5 Canvas**. It explores how a simple numerical rule can support combat, exploration and persistent progression, with a modular simulation and automated verification.

| At a glance | |
| --- | --- |
| Current version | v0.6.0 · playable single-player prototype |
| Technology | JavaScript ES modules, Canvas 2D, CSS, Web Audio, localStorage |
| Core systems | Number merging, directional combat, tangram sectors, horde pressure, extraction, shelter upgrades |
| Content | Fourteen weapon types, six quality tiers, twelve enemy types, five difficulties |
| Verification | 118 automated tests and syntax/reference checks for 18 modules |
| Game interface | Simplified Chinese; English and Chinese project documentation |

The hosted demo currently has restricted access. The complete game runs locally using the instructions below.

This version is available on the `feature/tangram-impact-v06` playtest branch: [download the complete v0.6 ZIP](https://github.com/GHZlove/number-extraction-/archive/refs/heads/feature/tangram-impact-v06.zip). The default branch and hosted demo follow separate release schedules.

[简体中文](README.zh-CN.md) · [v0.6 tangram sectors and impact](docs/TANGRAM_V06.md) · [Horde rules](docs/PRESSURE_V05.md) · [Colour theme](docs/VISUAL_V041.md) · [Combat rules](docs/COMBAT_V02.md) · [Architecture](docs/ARCHITECTURE.md) · [Testing](docs/TESTING.md)

Detailed design and verification notes are currently in Chinese.

## Design idea

The player's number is both a growth target and a combat tier. Equal-number merging makes exploration useful; percentage-based damage makes the relationship between two numbers readable. Limited division charges, telegraphed enemy attacks, armour and temporary buffs give the player several ways to approach a stronger opponent.

Extraction adds a second decision: carry on searching for better loot, or return with resources that permanently improve the shelter. The game connects a short expedition loop with longer-term preparation and progression.

## Gameplay

**Prepare at the shelter → Deploy → Merge and explore → Fight or evade → Extract → Upgrade**

- **2048-style growth:** equal neutral numbers merge into twice their value, up to 2048. Defeated enemies leave mergeable numbers; living enemies require combat.
- **Tangram-style sectors:** seven connected polygon pieces replace three vertical bands. Seeded rotations, reflections and risk assignments change the route each raid. A piece's risk governs enemy numbers, guard density, horde cadence and loot; the teaching area stays low risk. Seams are traversable, with matching minimap shapes and entry notices.
- **Combat impact:** directional hit sparks, enemy hit flashes, recoil, armour-break cues and shattering defeats. Heavy weapons add collision-safe knockback and a brief, throttled hit-stop with buffered controls. Synthesised weapon and impact sounds are opt-in; reduced-motion preferences suppress camera shake and hit deformation.
- **Overload:** merging charges energy. Press **G** at 100% for seven seconds of increased damage and attack speed, plus an initial nearby stun. Operation nodes grant temporary damage, protection or collection buffs.
- **Fourteen weapons:** the original eight weapon types plus a burst carbine, LMG, crossbow, grenade launcher, spear and warhammer. Equip two slots, six quality tiers, durability-based armour and a laser sight.
- **Compact expeditions:** five arenas from 6,400 × 4,000 to 12,800 × 8,000. Each map has 1/25 the area of its v0.4.1 counterpart, with tighter landmark layouts and more concentrated encounters.
- **Persistent horde pressure:** repeated groups spawn around the player after a short preparation window, with visible warnings, escalating cadence, local navigation and eight-second surges every 35 seconds.
- **Terrain and enemies:** navigate open industrial compounds, container lanes, rock ridges, river bridges and brush. Twelve enemy types include fast scouts, slow armoured giants, strafing burst shooters, medics, summoners and radial-fire guards.
- **Ink-style visuals:** fluorescent pink, cyan, lime and violet, original paint splashes, bright terrain and sticker-style shelter cards. Dark outlines and HUD panels keep combat information distinct.
- **Fullscreen raids:** the world fills the screen, with a compact HUD and minimap. Shelter facilities and deployment controls appear outside the raid.
- **Persistent shelter:** extracted currency, alloy and cores upgrade storage, supplies, the workshop and recycling. Every ending returns directly to the shelter; failed raids preserve banked assets.

| Difficulty | World size | Area vs v0.2 | Time limit | Fixed enemy numbers* | Base reward |
| --- | --- | --- | --- | --- | --- |
| 边境巡查 / Scout | 6,400 × 4,000 | 4× | 4:00 | 2–512 | 1× |
| 失序探索 / Standard | 7,680 × 4,800 | 5.76× | 5:00 | 4–1,024 | 1.6× |
| 深层突袭 / Hard | 8,960 × 5,600 | 7.84× | 6:00 | 8–2,048 | 2.4× |
| 核心危机 / Severe | 10,240 × 6,400 | 10.24× | 7:00 | 16–4,096 | 3.6× |
| 零点噩梦 / Nightmare | 12,800 × 8,000 | 16× | 8:00 | 32–8,192 | 5.2× |

*Horde numbers also grow with elapsed time. Fixed ranges include elite enemies; division can reduce these values. Player merging remains capped at 2048. World dimensions use game units, independent of display resolution.*

## Run locally

Requirements: **Python 3**, a modern browser with JavaScript enabled, and optional **Node.js 22+** for automated checks. There are no third-party package dependencies or build steps.

Clone the repository, or extract the complete source ZIP:

```bash
git clone --branch feature/tangram-impact-v06 --single-branch https://github.com/GHZlove/number-extraction-.git number-extraction
cd number-extraction
```

On **Windows**, double-click `start-windows.bat`, or run:

```powershell
py -3 -m http.server 8000 --bind 127.0.0.1 --directory dist
```

If the Python launcher is unavailable, replace `py -3` with `python`.

On **macOS / Linux**:

```bash
python3 -m http.server 8000 --bind 127.0.0.1 --directory dist
```

Open [http://localhost:8000](http://localhost:8000), select a difficulty and workshop weapon, then click **确认出击** (Deploy). Keep the terminal open; **Ctrl+C** stops the server. If port 8000 is occupied, change the port in both the command and browser address.

ES modules require an HTTP server; opening `dist/index.html` as a local file is unsupported. The Python server only serves files; simulation runs in the browser.

## Controls

| Input | Action |
| --- | --- |
| WASD / arrow keys | Move |
| Mouse movement | Aim |
| Left mouse button / Space | Fire or swing; hold to repeat |
| 1 / 2 | Switch weapon slots |
| F | Pick up nearby equipment |
| B | Open the backpack, equip, switch or drop items; pauses the raid |
| G | Activate Overload at full energy |
| Q | Spend a ÷2 charge to weaken and interrupt an eligible enemy |
| Shift | Dodge with brief invulnerability |
| Hold E | Search a chest, activate a node or extract while stationary |
| R | Spend a repair kit to restore 30 health |
| Esc | Pause / resume |

Touch controls provide a joystick, action buttons and assisted aiming; weapons can also be switched in the inventory. Physical-device touch input, screen rotation and Safari compatibility still need validation. Sound starts disabled.

### First expedition

Exits open after **45/60/75/90/105 seconds**, depending on difficulty. Survive until they turn green, then hold E for four seconds. Watch the wave counter, nearby enemy count and pink spawn warnings.

1. Follow the fixed **1 → 2 → 4 → 8** neutral tile chain to reach player value **16** and full energy. The third tile is slightly above the others.
2. Search the starter chest at `(485, 1190)` by standing still and holding **E** for 0.75 seconds. It provides 24 currency value and a ÷2 charge.
3. Open the equipment chest at `(620, 1260)`. Press **F** for each item, then **B** to equip the yellow rifle, white armour and laser. Compare the two weapon slots and white/red aim guides.
4. Practise **G**, **Q** and dodging against the nearby hunter, or evade it. The node at `(1180, 1270)` grants a temporary damage buff.
5. The frontier cache at `(1500, 1420)` supplies the burst carbine, grenade launcher, spear and warhammer for an early test. A fast scout guards the road nearby.
6. Return to the western green exit at `(310, 530)`. Stand still and hold **E** for four uninterrupted seconds.
7. The shelter shows your banked rewards. Upgrade a facility when you can afford its listed resources, or prepare another expedition.

## Combat and progression

White weapons use a fraction of the target's maximum health. Equal numbers deal **25%**. With `d = log2(attacker / defender)`, higher numbers deal `1 - 2^(-d)` and lower numbers deal `2^(d-1)`.

| Match-up | Higher number deals | Lower number deals |
| --- | --- | --- |
| 8 vs 4 | 50% | 25% |
| 16 vs 4 | 75% | 12.5% |
| 32 vs 4 | 87.5% | 6.25% |

Quality multipliers are **white 1.0, yellow 1.2, green 1.4, blue 1.6, purple 1.8, red 2.0**. Armour, Overload and node buffs modify the final damage. The examples exclude these effects.

Shotguns share one attack's base damage across five pellets; burst carbines share it across three timed shots. Switching weapons cancels remaining burst shots. Crossbows penetrate two distinct targets. Spears have a long, narrow attack arc; warhammers interrupt surviving targets. Grenades explode once on contact or at maximum range, with distance-based splash damage blocked by walls.

Railguns can hit three distinct targets before stopping; walls block projectiles. A laser reduces actual firearm spread by **70%**. Switching or equipping does not reset the shared attack cooldown. Ammunition is unlimited in this prototype.

| Shelter facility | Effect |
| --- | --- |
| Storage | +2 backpack slots per level, up to level 20 |
| Supplies | +1 starting ÷2 charge per level; +1 repair kit every two levels, up to level 20 |
| Workshop | Unlock starter weapons, improve starting quality, add armour at level 2 and a laser at level 4; maximum level 6 |
| Recycler | +5% extraction yield per level, up to level 20 |

Picked-up equipment is converted into resources on extraction. Workshop equipment is issued afresh for each raid and has no salvage value. There is no persistent equipment warehouse. See [v0.3 rules](docs/SHELTER_V03.md) for costs, unlocks and rewards.

## Engineering highlights

The project demonstrates gameplay system design, state management, collision geometry, procedural generation, performance-aware world queries, save migration and regression testing.

The 18 JavaScript ES modules separate deterministic simulation, polygon geometry, equipment, shelter progression, seeded world generation and landmark layouts, spatial obstacle/terrain queries, a local navigation field and horde director, browser input, rendering, UI, inline SVG art, persistence, audio and application flow.

- `Raid` has no DOM or local-storage dependencies and can be tested directly in Node.js.
- Simulation advances at a fixed 1/60 second step. Catch-up time is capped at 0.1 seconds; sustained low frame rates can still slow simulation time.
- Movement uses substeps; projectiles use ordered segment intersections. A static spatial grid narrows obstacle queries, and distant enemies skip active AI work.
- Shelter progression is validated on load. v0.1/v0.2 saves migrate to a new key without overwriting the original; duplicate settlement is guarded within the current single-tab flow.
- Canvas handles the world; DOM handles the shelter, HUD and dialogs. Artwork and sound are generated locally without external assets.

### Checks

With Node.js 22+:

```bash
npm run check
npm test
```

No `npm install` is required. The current verification has **18 modules passing syntax/reference checks and 118 passing tests**: 19 core, 28 combat, 17 shelter/expedition, 16 expansion, 16 pressure, 12 tangram/impact/audio and 10 browser-contract tests.

Coverage includes damage, equipment, map bounds, exit reachability, spatial queries, shelter progression, save migration, enemy behaviour, spawn budgets and crowd steering. New checks cover polygon tiling, sector risk and entity membership, knockback collisions, hit-stop input retention, effect rendering and rate-limited audio scheduling. DOM/Canvas and Web Audio checks use Node.js doubles; they do not establish actual layout, native browser behaviour, sound quality or device performance. See [testing notes](docs/TESTING.md).

## Persistence and limitations

Saves belong to the current browser and origin. Local and hosted copies have separate progress. Clearing site data removes saves; simultaneous tabs can overwrite progress. Only settled runs are saved. Refreshing during a raid loses its unbanked loot.

This is a single-player prototype with no multiplayer, cloud synchronisation, application-level network requests or telemetry. Enemies share a local navigation field and use crowd separation; full navigation meshes and globally optimal routes are not implemented. Real-browser layout, mobile devices, Safari, long sessions, low-performance hardware and economy balance need further validation. The in-game UI is currently Chinese.

## Documentation

- [Chinese quick start](README.zh-CN.md)
- [v0.6 tangram sectors and combat impact](docs/TANGRAM_V06.md)
- [v0.5 compact arenas and horde pressure](docs/PRESSURE_V05.md)
- [v0.4 maps, terrain, enemy and weapon rules](docs/EXPANSION_V04.md)
- [v0.3 shelter and Overload foundation](docs/SHELTER_V03.md)
- [v0.2 combat foundation](docs/COMBAT_V02.md)
- [Original v0.1 design record](docs/GAME_DESIGN.md)
- [Architecture](docs/ARCHITECTURE.md)
- [Testing and verification limits](docs/TESTING.md)

## License

A license has not been selected for this project.
