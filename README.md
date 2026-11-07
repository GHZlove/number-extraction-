# Number Extraction

### A 2048-inspired extraction game with tactical combat and a persistent shelter.

**Merge your way up. Choose your fights. Bring something home.**

Start as the number **1** in a procedurally generated combat zone. Merge equal numbers to grow, use division and temporary abilities to challenge stronger enemies, and decide when to extract with your loot. Each successful expedition funds a shelter that improves the next one.

Number Extraction is a game development portfolio project built with **vanilla JavaScript and HTML5 Canvas**. It explores how a simple numerical rule can support combat, exploration and persistent progression, with a modular simulation and automated verification.

| At a glance | |
| --- | --- |
| Current version | v0.11.2 · local playtest records; Windows verification pending |
| Technology | JavaScript ES modules, Canvas 2D, CSS, Web Audio, localStorage |
| Core systems | Number merging, mutators, heat and hunters, conditional extraction, combat and persistent shelter |
| Content | 20 weapons, 12 enchantments, 12 enemy types, 9 bosses, 4 map families, 5 difficulties |
| Verification | 319 automated tests; v0.11.2 native Windows verification pending |
| Game interface | Simplified Chinese; English and Chinese project documentation |

The hosted demo currently has restricted access. The complete game runs locally using the instructions below.

**v0.11.2 build pending; previous verified release:** **[Download v0.11.1 Windows x64 EXE](https://github.com/GHZlove/number-extraction-/releases/download/v0.11.1-desktop.15/NumberExtraction-0.11.1-Windows-x64.exe)** · [Release, screenshots and SHA256](https://github.com/GHZlove/number-extraction-/releases/tag/v0.11.1-desktop.15). Run in a standalone window without Python or a separate browser. See [v0.11.1 tuning and compatibility](docs/BALANCE_V0111.md). Close an older running copy before opening the new EXE.

The web/source version is available on the `feature/bright-arsenal-v09` playtest branch: [download the current playtest web/source ZIP](https://github.com/GHZlove/number-extraction-/archive/refs/heads/feature/bright-arsenal-v09.zip). The default branch and hosted demo follow separate release schedules.

[简体中文](README.zh-CN.md) · [Local playtest journal](docs/LOCAL_PLAYTEST_V0112.md) · [Eight Phase 2 proposals](docs/SYNERGIES_V012_DESIGN.md) · [v0.11.1 balance changes](docs/BALANCE_V0111.md) · [Anonymous playtest guide](docs/PLAYTEST_V0111.md) · [v0.11 run depth](docs/RUN_DEPTH_V011.md) · [Phased roadmap](docs/ROADMAP.md) · [v0.10 warehouse and nine bosses](docs/WAREHOUSE_BOSSES_V010.md) · [v0.9.2 remnants and resources](docs/REMNANTS_V092.md) · [v0.9 bright arsenal](docs/BRIGHT_V09.md) · [v0.8 desktop history](docs/DESKTOP_V08.md) · [v0.7 strongholds, forge and bosses](docs/STRONGHOLDS_V07.md) · [Combat feedback](docs/TANGRAM_V06.md) · [Colour theme](docs/VISUAL_V041.md) · [Combat rules](docs/COMBAT_V02.md) · [Architecture](docs/ARCHITECTURE.md) · [Testing](docs/TESTING.md)

The v0.11 rules and roadmap are documented in English; historical design and verification notes are mostly in Chinese.

v0.11.2 adds a local 100-run journal, optional structured feedback and deliberate anonymous export. It records modifier choices, outcomes, exit usage and actual hunter arrivals to guide the next 10–20 real runs. Progress remains separate, v0.11.1 tuning is retained, and eight Phase 2 interactions are documented as paper proposals only. See [journal and privacy](docs/LOCAL_PLAYTEST_V0112.md).

v0.11.1 adjusts heat escalation, high-tier movement, Fog, Volatile and Glass Firepower, and adds small rewards to existing special exits. It keeps the western fallback and warehouse progress intact. A finite-health diagnostic harness and an anonymous 2–4 day playtest guide accompany the tuning candidate; outside-player feedback remains uncollected. See [measured changes and limits](docs/BALANCE_V0111.md).

v0.11 deepens the expedition loop before adding more content: choose up to three of ten mutators, manage rising heat and warned hunter squads, grow into number tiers with different movement and collision bodies, and plan around seeded extraction requirements. A western fallback exit remains available after its opening time. See the [run-depth rules](docs/RUN_DEPTH_V011.md). Later roadmap phases are planned, not included in this build.

v0.10 added an upgradeable warehouse that preserves extracted equipment, four-slot deployment planning, repairs and explicit recycling. Excess gear stays in a pending area. Six new bosses bring the roster to nine, with a codex, selectable targets, new warned attack geometry and distinct weapon rewards.

v0.9.2 added automatic recycling of lower-number enemy remnants and an unlimited resource pouch. Equipment alone uses backpack slots; coins can be spent at field traders or banked on extraction.

The v0.9.1 fix for homepage numeral overflow is retained: it sizes text against each tile and reduces type for longer numbers. Native layout checks cover wide and narrow windows and 125%/150% zoom.

Previous verified v0.11.1 captures (v0.11.2 captures pending):

![White shelter and raised number tiles](https://github.com/GHZlove/number-extraction-/releases/download/v0.11.1-desktop.15/portable-shelter-wide.png)

![Colourful combat map and number actors](https://github.com/GHZlove/number-extraction-/releases/download/v0.11.1-desktop.15/portable-raid.png)

[View the unlimited resource pouch and equipment inventory](https://github.com/GHZlove/number-extraction-/releases/download/v0.11.1-desktop.15/portable-inventory.png).

[View the persistent warehouse](https://github.com/GHZlove/number-extraction-/releases/download/v0.11.1-desktop.15/portable-warehouse.png) · [View the nine-boss codex](https://github.com/GHZlove/number-extraction-/releases/download/v0.11.1-desktop.15/portable-bosses.png).

[View run modifiers](https://github.com/GHZlove/number-extraction-/releases/download/v0.11.1-desktop.15/portable-rules.png) · [View paused extraction intelligence](https://github.com/GHZlove/number-extraction-/releases/download/v0.11.1-desktop.15/portable-exits.png).

## Design idea

The player's number is both a growth target and a combat tier. Equal-number merging makes exploration useful; percentage-based damage makes the relationship between two numbers readable. Limited division charges, telegraphed enemy attacks, armour and temporary buffs give the player several ways to approach a stronger opponent.

Extraction adds a second decision: carry on searching for better loot, or return with resources that permanently improve the shelter. The game connects a short expedition loop with longer-term preparation and progression.

## Gameplay

**Prepare at the shelter → Deploy → Merge and explore → Fight or evade → Extract → Upgrade**

- **Run choices:** ten optional mutators, at most three per run, with visible risks and additive settlement bonuses. Heat, number forms and variable exits are active even with no mutators selected.
- **Rising heat:** time and activity raise a 0–100 meter; thresholds at 25/50/75/100 call warned, population-limited hunter squads. Safehouses suppress new hunter arrivals without resetting heat.
- **Number identity:** 64, 256 and 1024 introduce larger physical bodies and movement/defence tradeoffs. Growth waits for enough collision space when beside a wall.
- **Variable extraction:** seeded special exits require a time window, raid key, minimum number or guardian defeat. The western fallback has no extra requirement and stays open after its timer. The extraction briefing pauses play and explains current conditions.
- **Bright, raised number tiles:** a white shelter homepage, colourful terrain and rounded number faces with large white numerals. Player and hostile markers distinguish actors from neutral tiles. Deployment, facilities and forging retain separate tabs; combat keeps a compact HUD and dedicated boss bar.
- **Windows desktop:** a portable Electron build bundles its runtime, starts in its own window, supports fullscreen and keeps progress across updates. A validated JSON export/import flow transfers browser progress with a recoverable backup.
- **2048-style growth:** equal neutral numbers merge into twice their value, up to 2048. Defeated enemies leave mergeable numbers; living enemies require combat.
- **Four map families:** tangram ruins, radial fractures, split city blocks and clipped Voronoi wilderness. Select a family or randomise it. Maps contain 7–12 connected sectors with seeded shapes and risks, different landmark sequences and waterways, matching minimap boundaries and safe teaching anchors.
- **Resource strongholds:** most enemies defend resource sites. Small wilderness patrols have their own cap; occupied sites can call limited reinforcements. Guards return when pulled too far away.
- **Twelve enchantments:** lifesteal, chain lightning, stun, poison clouds, burn, frost, bleed, sunder, on-kill detonation, critical hits, gravity and energy recovery. Forge a permanent starter weapon up to Lv.5 and choose an enchantment; levels improve damage and knockback, while gun type, quality and number advantage also affect pushback.
- **Reactive defence:** aim toward an incoming attack and right-click for a short parry window. Reflect bullets or interrupt melee attackers, including bosses. Poison and ordinary explosions require movement.
- **Traders, shelters and bosses:** spend carried loot at a field merchant; low-risk exits offer protective safehouses. Nine boss archetypes cycle telegraphed moves and enter a second phase below half health. A seeded boss-gated special exit remains locked until its guardian falls.
- **Combat impact:** directional hit sparks, enemy hit flashes, recoil, armour-break cues and shattering defeats. Heavy weapons add collision-safe knockback and a brief, throttled hit-stop with buffered controls. Synthesised weapon and impact sounds are opt-in; reduced-motion preferences suppress camera shake and hit deformation.
- **Overload:** merging charges energy. Press **G** at 100% for seven seconds of increased damage and attack speed, plus an initial nearby stun. Operation nodes grant temporary damage, protection or collection buffs.
- **Twenty weapons:** pistols, automatic weapons, piercing and explosive firearms, plus directional melee weapons. v0.9 adds a heavy revolver, double-barrel shotgun, plasma pistol, flamethrower, rocket launcher and battleaxe. Equip two slots, six quality tiers, durability-based armour and a laser sight.
- **Compact expeditions:** five arenas from 6,400 × 4,000 to 12,800 × 8,000. Each map has 1/25 the area of its v0.4.1 counterpart, with tighter landmark layouts and more concentrated encounters.
- **Controlled reinforcements:** visible spawn warnings, a preparation window, local navigation and population budgets retain combat pressure around occupied sites while keeping wilderness encounters sparse.
- **Terrain and enemies:** navigate open industrial compounds, container lanes, rock ridges, river bridges and brush. Twelve enemy types include fast scouts, slow armoured giants, strafing burst shooters, medics, summoners and radial-fire guards.
- **Ink-style visuals:** fluorescent pink, cyan, lime and violet, original paint splashes, bright terrain and sticker-style shelter cards. Dark outlines and HUD panels keep combat information distinct.
- **Fullscreen raids:** the world fills the screen, with a compact HUD and minimap. Shelter facilities and deployment controls appear outside the raid.
- **Persistent shelter:** extracted currency, alloy and cores upgrade storage, supplies, the workshop and recycling. Every ending returns directly to the shelter; failed raids preserve banked assets.

| Difficulty | World size | Area vs v0.2 | Time limit | Fixed enemy numbers* | Base reward |
| --- | --- | --- | --- | --- | --- |
| 边境巡查 / Scout | 6,400 × 4,000 | 4× | 4:00 | 2–128 | 1× |
| 失序探索 / Standard | 7,680 × 4,800 | 5.76× | 5:00 | 4–256 | 1.6× |
| 深层突袭 / Hard | 8,960 × 5,600 | 7.84× | 6:00 | 8–512 | 2.4× |
| 核心危机 / Severe | 10,240 × 6,400 | 10.24× | 7:00 | 16–1,024 | 3.6× |
| 零点噩梦 / Nightmare | 12,800 × 8,000 | 16× | 8:00 | 32–2,048 | 5.2× |

*The table lists base difficulty settings before mutators. Horde numbers also grow with elapsed time. Fixed ranges include bosses; division can reduce these values. Player merging remains capped at 2048. World dimensions use game units, independent of display resolution.*

## Run locally

Requirements: **Python 3**, a modern browser with JavaScript enabled, and optional **Node.js 22+** for automated checks. The web game has no third-party runtime dependencies or build steps; desktop packaging uses the pinned development dependencies.

Clone the repository, or extract the complete source ZIP:

```bash
git clone --branch feature/bright-arsenal-v09 --single-branch https://github.com/GHZlove/number-extraction-.git number-extraction
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
| Right mouse button / C | Timed, directional parry |
| 1 / 2 | Switch weapon slots |
| F | Pick up nearby equipment |
| B | Open the backpack, equip, switch or drop items; pauses the raid |
| G | Activate Overload at full energy |
| Q | Spend a ÷2 charge to weaken and interrupt an eligible enemy |
| Shift | Dodge with brief invulnerability, unless disabled by a selected mutator |
| Hold E | Search a chest, activate a node or extract while stationary |
| R | Spend a repair kit to restore 30 health (20 with Supply Shortage) |
| Esc | Pause / resume |

Touch controls provide a joystick, action buttons and assisted aiming; weapons can also be switched in the inventory. Physical-device touch input, screen rotation and Safari compatibility still need validation. Sound starts disabled.

### First expedition

The **western fallback** opens after **45/60/75/90/105 seconds**, depending on difficulty, and stays open. Special exits open later and have additional conditions; use the top-right extraction briefing to inspect them. Hold E while stationary for four uninterrupted seconds to leave. Watch heat and spawn warnings before choosing another detour.

1. Follow the fixed **1 → 2 → 4 → 8** neutral tile chain to reach player value **16** and full energy. The third tile is slightly above the others.
2. Search the starter chest at `(485, 1190)` by standing still and holding **E** for 0.75 seconds. It provides 24 currency value and a ÷2 charge.
3. Open the equipment chest at `(620, 1260)`. Press **F** for each item, then **B** to equip the yellow rifle, white armour and laser. Compare the two weapon slots and white/red aim guides.
4. Practise **G**, **Q** and dodging against the nearby hunter, or evade it. The node at `(1180, 1270)` grants a temporary damage buff.
5. The frontier cache at `(1500, 1420)` provides one raid-only extraction key as well as the burst carbine, grenade launcher, spear and warhammer for an early test. A fast scout guards the road nearby.
6. The arsenal cache at `(1670, 1500)`, beside the frontier cache, supplies all six v0.9 weapons and the eight added enchantments. Use F to pick up and B to equip; trial items cannot be salvaged. The default backpack holds eight items, so choose or drop gear when full.
7. Return to the western green exit at `(310, 530)`. Stand still and hold **E** for four uninterrupted seconds.
8. The shelter shows your banked rewards. Upgrade a facility when you can afford its listed resources, or prepare another expedition.

## Combat and progression

White Lv.1 weapons without enchantments or buffs use a fraction of the target's maximum health. Equal numbers deal **25%**. With `d = log2(attacker / defender)`, higher numbers deal `1 - 2^(-d)` and lower numbers deal `2^(d-1)`.

| Match-up | Higher number deals | Lower number deals |
| --- | --- | --- |
| 8 vs 4 | 50% | 25% |
| 16 vs 4 | 75% | 12.5% |
| 32 vs 4 | 87.5% | 6.25% |

Quality multipliers are **white 1.0, yellow 1.2, green 1.4, blue 1.6, purple 1.8, red 2.0**. Armour, Overload and node buffs modify the final damage. The examples exclude these effects, number-form defence and mutator bonuses.

Shotguns share one attack's base damage across five pellets; burst carbines share it across three timed shots. Switching weapons cancels remaining burst shots. Crossbows penetrate two distinct targets. Spears have a long, narrow attack arc; warhammers interrupt surviving targets. Grenades explode once on contact or at maximum range, with distance-based splash damage blocked by walls.

Double-barrel shotguns share one attack budget across two four-pellet volleys. Plasma rounds penetrate two targets; flamethrowers apply intrinsic burn and battleaxes intrinsic bleed. Rockets have a larger splash radius than grenades. These mechanics still use the number-based damage system.

Railguns can hit three distinct targets before stopping; walls block projectiles. A laser reduces actual firearm spread by **70%**. Switching or equipping does not reset the shared attack cooldown. Ammunition is unlimited in this prototype.

| Shelter facility | Effect |
| --- | --- |
| Warehouse | 24 persistent gear slots, +12 per upgrade, up to level 10; full inventories preserve gear in a pending area |
| Storage | +2 equipment backpack slots per level, up to level 20; resources do not consume slots |
| Supplies | +1 starting ÷2 charge per level; +1 repair kit every two levels, up to level 20 |
| Workshop | Unlock starter weapons, improve starting quality, add armour at level 2 and a laser at level 4; maximum level 6 |
| Recycler | +5% extraction yield per level, up to level 20 |

Extracted equipment now enters a persistent warehouse without also converting into currency or materials. It starts with 24 slots, gains 12 per upgrade and preserves overflow in a pending area. Select stored weapons, armour and a laser for the next raid; deployment withdrawals are saved before play begins, and carried warehouse gear is lost on failure. Stored gear can be repaired or explicitly recycled. Free workshop and trial gear cannot be stored or recycled. See [v0.10 rules](docs/WAREHOUSE_BOSSES_V010.md).

## Remnants and carrying

Equal enemy remnants still merge first. Lower remnants recycle automatically when approached; higher remnants remain available for later growth. At the 2048 merge cap, equal remnants can also be recycled. Ordinary neutral tiles remain unchanged. Gold outlines and nearby labels identify recyclable remnants.

Coin value is `4 + 2 × log2(remnant number)`: 16 yields 12, 64 yields 16, and 512 yields 22. These are carried raid funds. Merchants spend coins before material-bearing fragments; unspent funds are banked only after successful extraction, using the existing reward multiplier. Remnant coins produce no alloy or cores.

Only weapons, armour and attachments occupy equipment slots. Fragments, coins and materials have unlimited storage, grouped in a separate resource pouch. Full equipment bags can still collect resources and search chests; uncollected gear stays on the ground. HUD and merchant capacity checks use the equipment count. See [v0.9.2 rules](docs/REMNANTS_V092.md).

## Forge, trade and return

Forge the selected starter weapon at the shelter using credits, alloy and cores. Each additional level adds 8% damage and increases knockback; choose one of twelve enchantments on forging or upgrading. A Lv.5 weapon can be re-enchanted for a separate cost. Crafted loadouts are reissued each raid, survive failed runs as a saved blueprint, and have no salvage value.

The western safehouse has a merchant. Spend carried loot value on repair kits (24), division charges (30), green armour (65), a laser (36), or a green Lv.2 lightning rifle (110). v0.9 also adds a green Lv.2 critical revolver (95) and frost plasma pistol (125). Stock is limited per raid and equipment requires backpack space. Shelter savings are separate from raid trading.

Safehouse circles block incoming damage, provide one treatment per location and prohibit attacks from inside. Extraction still requires the survival deadline. Boss caches contain valuable loot, a purple Lv.3 enchanted weapon and supplies; their currency, alloy and bonus cores are banked only on successful extraction. Detailed costs and encounter rules are in [v0.7 design notes](docs/STRONGHOLDS_V07.md).

## Engineering highlights

The project demonstrates gameplay system design, state management, collision geometry, procedural generation, performance-aware world queries, save migration and regression testing.

The 27 game ES modules and four desktop CommonJS files separate deterministic simulation, polygon geometry, equipment, shelter progression, seeded world generation and landmark layouts, spatial obstacle/terrain queries, a local navigation field, horde/heat directors and run rules, browser input, rendering, UI, inline SVG art, persistence, audio and application flow.

- `Raid` has no DOM or local-storage dependencies and can be tested directly in Node.js.
- Simulation advances at a fixed 1/60 second step. Catch-up time is capped at 0.1 seconds; sustained low frame rates can still slow simulation time.
- Movement uses substeps; projectiles use ordered segment intersections. A static spatial grid narrows obstacle queries, and distant enemies skip active AI work.
- Shelter progression is validated on load. v0.11 copies v0.10 and older progress into an independent schema-5 save key without overwriting the original; duplicate settlement is guarded within the current single-tab flow.
- Canvas handles the world; DOM handles the shelter, HUD and dialogs. Artwork and sound are generated locally without external assets.

### Checks

With Node.js 22+:

```bash
npm run check
npm test
```

No `npm install` is required for these checks. **319 tests pass**, including 29 new local-journal, application and desktop-export cases. v0.11.2 native Windows verification is pending; the prior release passed its startup, layout, combat and persistence checks. The new run-depth suite exercises production run rules; historical balance regressions use a test-only classic-rule fixture. Syntax/reference checks now cover 27 game modules and four desktop files. Current results and native desktop evidence belong in [testing notes](docs/TESTING.md).

Coverage includes damage, equipment, map bounds, exit reachability, spatial queries, shelter progression, save migration, enemy behaviour, spawn budgets and crowd steering. New checks cover all map families, resource guard distribution, forging and migration, bounded enchantments, directional parry/reflection, safehouse protections, boss phases/rewards, merchant debits and real application control flow. DOM/Canvas and Web Audio checks use Node.js doubles; they do not establish actual layout, native browser behaviour, sound quality or device performance. See [testing notes](docs/TESTING.md).

## Persistence and limitations

v0.11.1 retains the same schema-5 key and existing v0.11.0 warehouse and progress. v0.11 first copies v0.10 progress, then v0.9 and v0.7/v0.8 progress, with fallbacks for earlier saves, into the separate schema-5 `number-extraction-v11` key. Warehouse equipment, pending items and deployment selections are retained; mutator selections default to none for older saves. Original keys remain intact. Equipment that older versions already converted into resources cannot be reconstructed; those resources are retained. Existing desktop progress migrates automatically; browser-to-desktop transfer uses the JSON panel. Use the same browser and exact local URL to retain that progress. Saves belong to the current browser and origin. Local and hosted copies have separate progress. Clearing site data removes saves; simultaneous tabs can overwrite progress. Only settled runs are saved. Refreshing during a raid loses its unbanked loot.

This is a single-player prototype with no multiplayer, cloud synchronisation, gameplay network requests or telemetry. Desktop dependencies are used for development and packaging; the built game runs offline. Enemies share a local navigation field and use crowd separation; full navigation meshes and globally optimal routes are not implemented. Windows desktop checks are performed by the release workflow; mobile devices, Safari, long sessions, display scaling, sound quality, low-performance hardware and economy balance need further validation. The in-game UI is currently Chinese.

## Documentation

- [Chinese quick start](README.zh-CN.md)
- [v0.11 mutators, heat, number forms and extraction](docs/RUN_DEPTH_V011.md)
- [Phased development roadmap](docs/ROADMAP.md)
- [v0.10 persistent warehouse, nine bosses and ten reference games](docs/WAREHOUSE_BOSSES_V010.md)
- [v0.9.2 remnant recycling and unlimited resource storage](docs/REMNANTS_V092.md)
- [v0.9 bright tiles, twelve enchantments and twenty weapons](docs/BRIGHT_V09.md)
- [v0.8 Windows desktop, tactical UI and save migration](docs/DESKTOP_V08.md)
- [v0.7 strongholds, forge, enchantments, parry and bosses](docs/STRONGHOLDS_V07.md)
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
