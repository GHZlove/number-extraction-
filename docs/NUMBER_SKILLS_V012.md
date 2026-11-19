# Number Extraction v0.12.11 · Illustrated shelter and number skills

This is the browser/source playtest for the new art and combat. Download the [source ZIP](https://github.com/GHZlove/number-extraction-/archive/refs/heads/feature/number-skills-art-v012.zip), extract it, and run the project from the extracted folder.

On Windows, double-click `start-windows.bat` and keep its terminal open. The launcher opens a versioned page and uses port 8012 if an older server occupies port 8000. To keep using the old browser save, close the old server, restart the playtest, and use the original browser origin. On another system with Python 3, run `python3 -m http.server 8000 --bind 127.0.0.1 --directory dist` from the project root. Open **http://127.0.0.1:8000** for that manual command.

## Selecting a raid

Hover over a map or use Tab to preview its zone layout. Click or tap to lock a map, then choose the difficulty. The destination beside the large Deploy button reflects the locked map and difficulty. Use that button or click the illustrated green door to start the raid.

Three maps expand the pool to seven. Twinriver Wetlands adds wider waterways and more bridge and woodland sites. Ring Observatory has eight surrounding sectors and open relay arrays. Slant Ridge Icefield has diagonal sectors, icy ground and staggered cover.

## Skills

Choose two skills in the shelter, then cast them with **3 / 4**. The tree has four branches and 28 moves. The original four are available from the start. Research higher-rank nodes with Data Coins after unlocking their prerequisites.

| Branch | Starter skill | Effect |
| --- | --- | --- |
| Lightning | Remnant Lightning | Links 2–6 equal-number enemy remnants. Living enemies near the segments can take damage once per cast. Remnants stay available to merge or recycle. Blocked links and mixed numbers do not use the cooldown. |
| Wind | Number Gust | Pushes nearby visible foes away. The number difference and boss resistance affect the distance. |
| Phase | Blink | Moves towards the aim point. It stops before solid walls, checks the landing space and cancels ongoing interactions. No Dodge disables it. |
| Ember | Ember Orb | Launches a fireball that explodes and applies the shared Burn status. Its damage uses the number at cast time. |

Contact damage still uses the established number ratios. Both sides can receive recoil, weighted by tier. Sustained contact respects the existing damage cooldown. Nearby enemies also move apart when their bodies overlap. Light hits, heavy hits and collisions have distinct squash and rebound curves. On a merge or remnant recycle, the source tile stretches into a droplet, flows into the player, and leaves a short outward ripple. Reduced motion uses a softly fading fixed ring and disables tile deformation and water scrolling.

The game keeps the existing Burn, Lightning, Poison and Frost rules and shares their impact colours with the new skills. Merely adding a visual element tag does not change an enchantment's damage or cadence.

## Weapon and enemy effects

Enemy shots keep the number colour they had at launch and use a red-edged diamond. Player bullets use cream, mint, cyan, violet and amber for weapon levels 1–5. Ember Orb stays orange. Reflected rounds use the equipped weapon's level for their visual colour.

Heavy weapons kick further back, each burst shot has a recoil pulse, and melee attacks use a directional follow-through. Enemy ground attacks keep their original warning radius, with clearer countdown rings and a matching impact. Reduced motion keeps the warning outlines and projectile colours while suppressing weapon motion and tracer tails.

## Artwork and compatibility

The shelter uses a full-window comic vista, an illustrated interactive portal and a compact strip of number tiles. The shared ink-and-paper interface covers the shelter tabs, expedition controls, forge, warehouse, equipment and field dialogs. At narrow widths the illustration, number board and deployment settings stack vertically. Combat HUD panels keep a dark silhouette over bright terrain.

The original generated rasters are cropped into five in-game PNG atlases in `dist/art/`. Combat uses heavy black-and-white comic lettering with offset shadows for damage, armour, enemy names, minimap labels and tile numerals. Four-digit values fit the original illustrated slabs. River texture motion repeats inside the existing river boundaries, under bridges. Stone, grass and ice use flat-colour textures. Cover uses illustrated containers, barricades, rocks and broken pipe walls. The rendering keeps solid cover inside the same world bounds. Each of the twenty weapons has its own sprite for the held weapon, pickups and loadout.

The shelter and warehouse use the existing save schema. To keep a browser save, use the same browser and exact URL as before or transfer it with the save menu. The playtest journal can still import v0.11.1 balance exports, and v0.12.0 observations are grouped separately.

The existing v0.11.3 desktop EXE is the previous release. The v0.12.11 source branch is the current playtest. The v0.12.8 balance group reduces guard and patrol density. Existing weapon damage and extraction requirements still follow the earlier rules. The game UI is in Simplified Chinese.
