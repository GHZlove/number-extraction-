# Number Extraction v0.12.3 · Illustrated shelter and number skills

This is the browser/source playtest for the new art and combat. Download the [source ZIP](https://github.com/GHZlove/number-extraction-/archive/refs/heads/feature/number-skills-art-v012.zip), extract it, and run the project from the extracted folder.

On Windows, double-click `start-windows.bat` and keep its terminal open. The launcher opens a versioned page and uses port 8012 if an older server occupies port 8000. To keep using the old browser save, close the old server, restart the playtest, and use the original browser origin. On another system with Python 3, run `python3 -m http.server 8000 --bind 127.0.0.1 --directory dist` from the project root. Open **http://127.0.0.1:8000** for that manual command.

## Selecting a raid

Hover over a map or use Tab to preview its zone layout. Click or tap to lock a map, then choose the difficulty. The destination below the illustrated green door reflects the locked map and difficulty. Click the door to start the raid.

## Skills

| Key | Skill | Effect |
| --- | --- | --- |
| 3 | Remnant Lightning | Links 2–6 equal-number enemy remnants. Living enemies near the segments can take damage once per cast. Remnants stay available to merge or recycle. Blocked links and mixed numbers do not use the cooldown. |
| 4 | Number Gust | Pushes nearby visible foes away. The number difference and boss resistance affect the distance. |
| 5 | Blink | Moves towards the aim point. It stops before solid walls, checks the landing space and cancels ongoing interactions. No Dodge disables it. |
| 6 | Ember Orb | Launches a fireball that explodes and applies the shared Burn status. Its damage uses the number at cast time. |

Contact damage still uses the established number ratios. Both sides can receive recoil, weighted by tier. Sustained contact respects the existing damage cooldown. Nearby enemies also move apart when their bodies overlap. Light hits, heavy hits and collisions have distinct squash and rebound curves. Reduced motion disables tile deformation and water scrolling.

The game keeps the existing Burn, Lightning, Poison and Frost rules and shares their impact colours with the new skills. Merely adding a visual element tag does not change an enchantment's damage or cadence.

## Artwork and compatibility

The shelter has an illustrated field workshop beside its numbered display. The shared ink-and-paper interface covers the shelter tabs, expedition controls, forge, warehouse, equipment and field dialogs. At narrow widths the illustration, number board and deployment settings stack vertically. Combat HUD panels keep a dark silhouette over bright terrain.

The original generated rasters are cropped into five in-game PNG atlases in `dist/art/`. The game draws warm ivory numerals with dark outlines over matte, irregular slabs so four-digit values stay readable. River texture motion repeats inside the existing river boundaries, under bridges. Stone, grass and ice use flat-colour textures. Cover uses illustrated containers, barricades, rocks and broken pipe walls. The rendering keeps solid cover inside the same world bounds. Each of the twenty weapons has its own sprite for the held weapon, pickups and loadout.

The shelter and warehouse use the existing save schema. To keep a browser save, use the same browser and exact URL as before or transfer it with the save menu. The playtest journal can still import v0.11.1 balance exports, and v0.12.0 observations are grouped separately.

The existing v0.11.3 desktop EXE is the previous release. The v0.12.3 source branch is the current playtest. Its visual changes use the v0.12.0 balance rules. The game UI is in Simplified Chinese.
