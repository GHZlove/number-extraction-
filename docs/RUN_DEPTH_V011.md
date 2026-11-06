# v0.11 · Run depth

This playtest implements the first phase of the development roadmap: mutators, rising heat, number-tier tradeoffs and variable extraction. It retains the white shelter, colourful maps, 20 weapons, 12 enchantments, nine bosses, four map families, five difficulties and the persistent warehouse. Later roadmap phases are not part of this build.

Desktop release verification is in progress. This document describes the rules in the current source, not a claim that the new EXE has passed native checks. See [testing](TESTING.md) for release evidence and [the roadmap](ROADMAP.md) for future scope.

## Preparing a run

Open **行动设置 / Expedition Modifiers** at the shelter. Select zero to three of ten mutators; choices persist for the next deployment. The panel shows risks, reward changes and the heat-rate multiplier. No mutators are selected when migrating an older save.

Heat, number forms and seeded extraction rules remain active with zero selected mutators. The test-only `runRules: false` constructor option is not exposed as a game mode.

| Mutator | Run effect | Settlement bonus |
| --- | --- | --- |
| 数字暴走 / Number Surge | Enemy numbers ×2, including bosses and reinforcements | +20% |
| 禁用闪避 / No Dodge | Disable Shift dodge; directional parry still works | +25% |
| 战区浓雾 / Fog | Vision radius 280 game units; hide distant actors and boss markers | +20% |
| 高价悬赏 / High Bounty | Heat gain ×1.5 | +25% |
| 玻璃火力 / Glass Firepower | Direct weapon damage +35%; maximum health 75 | +10% |
| 急行战场 / Haste | Player walking and enemy pursuit speed +12%, subject to existing chase caps | +10% |
| 补给短缺 / Supply Shortage | No starting repair kits; each repair restores 20 instead of 30 health | +15% |
| 限时行动 / Short Expedition | Run time limit ×0.8 | +15% |
| 镭射干扰 / Laser Interference | Disable the laser's accuracy bonus and red aim line for this raid | +10% |
| 残爆怪群 / Volatile Enemies | Ordinary enemies leave a warned explosion on death | +20% |

Reward bonuses add together before multiplying the existing difficulty/recycler multiplier. Number Surge plus No Dodge gives ×1.45, not ×1.5. The modifier affects successful settlement currency and material yields. It does not inflate carried money at the field trader or upgrade stored equipment. Laser Interference leaves ownership of an equipped laser intact.

Volatile explosions warn for 0.9 seconds, then threaten a 95-unit radius for 15% of player maximum health before defensive effects. Walls, safehouse protection and existing invulnerability still apply. They do not recursively trigger enemy kills; at most 32 such zones are active.

## Heat and hunter squads

Heat is a per-raid meter from 0 to 100. It grows only while the simulation is active; paused dialogs do not advance it. Base gain is `0.28 + 0.025 × (difficulty rank − 1)` per second, before mutator scaling.

| Activity | Heat added before scaling |
| --- | --- |
| Open a chest | 3 |
| Activate an operation node | 2 |
| Defeat an ordinary enemy | 0.4 |
| Defeat a boss | 8 |

Within the safehouse suppression area, passive heat gain is halved and pending hunter arrivals are cancelled. Heat does not reset or decay. Existing safehouse damage protection and the ban on attacking from inside are retained.

| Heat threshold | Hunter level | Squad size | Minimum interval |
| --- | --- | --- | --- |
| 25 | 1 | 2 | 35 seconds |
| 50 | 2 | 3 | 30 seconds |
| 75 | 3 | 4 | 25 seconds |
| 100 | 4 | 5 | 22 seconds |

Each arrival uses a visible 1.3-second spawn warning and the existing legal-placement checks. Hunters spawn away from the player, avoid blocked terrain and safehouses, and obey both the global population budget and the nearby-enemy cap. Hunter value scales with the player's number and heat level; high-level hunters can be elite. They pursue aggressively and move faster than equivalent ordinary reinforcements.

Living and pending hunters together are capped at 12. The run also has a finite budget of 120 scheduled hunter arrivals. Ordinary wilderness patrols retain their separate cap of ten; occupied resource sites still provide the main guard population. These limits keep heat from becoming an unlimited field-wide spawn loop.

## Number identity

Merging still caps at 2048. The numerical damage relationship is unchanged; forms introduce an additional defensive and movement layer.

| Player number | Form | Collision radius | Walking speed | Incoming damage |
| --- | --- | --- | --- | --- |
| 1–32 | 轻巧 / Light | 19 | ×1.00 | ×1.00 |
| 64–128 | 冲锋 / Assault | 21 | ×1.04 | ×1.00 |
| 256–512 | 重装 / Heavy | 24 | ×0.94 | ×0.92 |
| 1024–2048 | 核心 / Core | 28 | ×0.86 | ×0.86 |

The body is larger in both rendering and collision. When the new radius would overlap a wall, the physical expansion waits until enough space is available; it never teleports the player through terrain. The HUD indicates pending expansion. Walking, terrain and Haste multipliers compose; dodge distance is not reduced by the walking penalty. A larger number therefore offers power and resilience at the cost of a larger target and, at high tiers, slower exploration.

## Variable extraction

The western exit at `(310, 530)` remains the fallback. It opens after 45/60/75/90/105 seconds by difficulty and stays open until the run ends. It has no key, number or boss requirement. Every exit still requires four uninterrupted stationary seconds holding E; movement, released interaction and damage interrupt the channel.

The other three exits are assigned seeded conditions. Each run includes a window and key exit, plus either a number gate or a boss gate. Special exits first open 20–35 seconds after the base difficulty deadline. Some special positions also vary when collision checks allow; otherwise their original position is kept.

| Exit type | Requirement |
| --- | --- |
| Window | Open for 30 seconds in each 70-second cycle; enough time must remain to finish the channel |
| Key | Hold one raid-only extraction key; consumed only on successful extraction |
| Number | Reach 16/32/64/128/256 according to difficulty |
| Boss | Defeat the assigned guardian |

The frontier cache at `(1500, 1420)` supplies one key when first opened. It is marked **K** on the minimap and retains its equipment contents. Keys do not occupy equipment slots and do not enter the persistent warehouse.

Use the top-right **撤离情报 / Extraction Intelligence** button to pause and inspect every exit's condition, direction and current state. HUD interaction prompts and exit rendering use the same condition query as the simulation. When carrying loot, the direction hint prefers an exit that is currently usable.

## Persistence and compatibility

The save schema is 5 and the independent key is `number-extraction-v11`. On first load, migration checks v0.10 first, then v0.9 and older keys. The original save keys are left intact. Balances, facilities, forged weapon records, warehouse items, pending gear and valid deployment selections are retained. Selected mutators and recent-run mutator/heat/seed metadata are saved; ongoing raids, keys and heat are not resumed after quitting.

The Windows application data directory and internal origin stay stable. Finish the current raid and close the previous application before launching a new EXE. Browser progress still requires the same origin or explicit JSON transfer. Import validation retains the shared 512 KB limit and backup workflow.

## Suggested playtest

1. Start with no mutators and complete a fallback extraction to check the familiar route.
2. Try one mutator, then a three-mutator combination; compare the displayed risk and settlement bonus.
3. Explore beyond the first heat threshold and watch a hunter warning, then return to the safehouse.
4. Reach 64, 256 and 1024; compare size, movement and narrow passages.
5. Collect the key, inspect all four exits and try a special exit. Test an interrupted channel before a successful extraction.
6. Restart the desktop app and confirm warehouse contents, selected mutators and banked progress remain correct.

Balance, pressure readability and hardware performance still need player feedback. This phase adds decision depth; it does not add factions, contracts, cursed sets, daily runs or multiplayer.
