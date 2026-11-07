# Phase 2 · Enchantment synergies and weapon sets · v0.12 design

**Status: paper proposal; no runtime effects are implemented by this document.** The values below are starting hypotheses for a future controlled playtest. They are not released balance values, completed features or conclusions from human feedback. The v0.11.1 heat, number forms, modifiers and extraction rules stay unchanged while this design is reviewed.

The design uses the existing [12 enchantments and 20 weapons](../dist/src/equipment.js): two equipped weapon slots, one enchantment per weapon, unlimited ammunition and the current shared attack cooldown. It introduces neither ammunition/reloading nor new weapon, armour or loot families. Existing weapon intrinsics and [enchantment effects](../dist/src/enchantments.js) remain separate effects.

The next implementation order remains **equipment interactions → contracts → factions**, as described in the [roadmap](ROADMAP.md). Contracts should eventually reward trying supported builds; factions should depend on that objective/reward loop. Neither is a prerequisite for this first synergy experiment.

## Goals and limits

Give a player a reason to use both weapons, choose a different engagement distance or prepare an enemy before finishing it. Each combination needs an understandable action sequence and a visible opportunity cost. A full backpack must not produce passive bonuses.

The first experiment should answer whether two interactions are readable and worth performing. It should not add all eight at once or compensate for an unpopular modifier by silently removing its cost. No design below alters heat gain, extraction rewards, player maximum health, number-form radius, walking speed, fog vision or dodge availability.

## Shared trigger and ownership rules

These rules are part of the proposed implementation contract, not existing functionality:

1. **Two real sources.** An enchantment synergy needs a qualifying direct hit from each of two different weapon instances currently occupying the two equipped slots. The first source primes an enemy; the other finishes the sequence. Merely equipping the pair does nothing. Backpack, warehouse and pending gear are excluded.
2. **One attack transaction.** One trigger pull or melee swing receives a raid-local action token. Its pellets, burst rounds, piercing collisions and delayed projectiles share that token and can complete at most one synergy. Choose the first eligible primary collision; simultaneous melee candidates use distance to the player, then enemy ID. No new random roll chooses a winner.
3. **Primary damage only.** A qualifying hit must remove positive health from an enemy that was alive before the hit. Shield/armour-only hits, self-damage, scenery and corpses do not prime or finish. Damage-over-time ticks, poison clouds, reflected enemy projectiles, ordinary chain lightning, critical follow-up damage, detonations and synergy/set damage are not additional primary hits.
4. **Intrinsics cannot pair with themselves.** Explicit enchantments can provide their named half. Existing intrinsic `burn` and `bleed` may provide a matching **primer** only. They never supply a finishing half or let one weapon satisfy both sources. A Frost flamethrower cannot trigger Thermal Rupture by itself, and a Leech battleaxe cannot trigger Sanguine Return by itself.
5. **Impact-time eligibility.** Snapshot source instance, slot, weapon, enchantment, level, rarity and player number when the attack starts. At impact, both exact source instances must still occupy the same two equipped slots. An inactive slot's already-fired projectile may finish a sequence after a real switch. Replacing, dropping or unequipping either item invalidates its marks and future set bonuses; it does not rewrite an ordinary projectile's existing damage.
6. **Keep the shared cooldown.** A switch does not refund the prior attack, restart a burst, cancel a cooldown or invent a second attack. Existing burst cancellation on switching remains. The timing windows below include that cost.
7. **Bounded marks and clocks.** Keep at most one primer per pair on an enemy, with a source token and expiry. Refresh expiry instead of stacking; resolve one accepted pair, then consume its marks. Use active simulation time so pause cannot extend or age a sequence. Clear marks on death, leaving the raid, or invalid source equipment; entering a safehouse clears the player's marks and set arming.
8. **Safehouse protection.** Priming, finishing and benefits require the player to be outside safehouse protection at both qualifying impacts. No healing or energy is earned by firing outside, returning inside and waiting for a projectile. Enemy protection and line-of-sight checks remain authoritative.
9. **One accepted synergy.** An eligible explicit-enchantment pair takes priority over an intrinsic-only primer route. If more than one remains eligible, use the fixed order S1–S6 below. A 0.35-second player-wide synergy cooldown also applies. Pair-specific cooldowns are longer; changing targets, switching slots or replacing equipment cannot reset them.
10. **No ownership or economy side effects.** These are computed relationships between equipped items, not new inventory objects. Marks, cooldowns and set arming are per-raid and are never stored as equipment upgrades. Extraction and death retain existing ownership/loss rules. A synergy cannot create gear, extra loot rolls, duplicate kill credit, currency or material multipliers.

A future implementation needs explicit action/source attribution before enabling these effects. The current code already tags secondary damage, but does not expose every critical/chain-resolution event needed here. Observability hooks alone do not mean the synergy implementation exists.

## Damage and benefit budget

For a proposed bonus, define:

`N(source, target) = existing number-based damage(source number, current target number, target maximum HP, source rarity) × existing weapon-level power`

Use the finishing source snapshot unless an item states otherwise. Do not multiply `N` by Glass Firepower, Fury, Overload, critical damage, vulnerability, another synergy or a set bonus. The proposed secondary hit then goes through the target's ordinary armour, resistance and vulnerability path **once**. Existing direct attacks retain their normal buffs; these rules only bound the new bonus.

Each stated maximum-HP cap applies before ordinary defensive calculations. Boss-specific coefficients/caps below replace the normal bonus rather than multiply it a second time. Current boss resistance, mass and control resistance still apply.

Additional safeguards for the future experiment:

- Bonus damage from these synergies and sets combined is capped at **12% of one enemy's maximum HP per rolling 2 seconds**, or **6% for a boss**, before ordinary defences. Consume an accepted proc even if the remaining budget is zero.
- Additional healing from synergies is capped at **3 HP per player per 3 seconds**, and additional energy at **6 per 3 seconds**. These caps do not modify the baseline enchantments, but no new bonus can cause them to run again.
- New damage is tagged `secondary`, `origin: synergy/set`, with its original source token. It cannot apply enchantments, prime another pair, generate a critical roll, heal via Leech, grant Energize or start another detonation. A lethal hit may invoke the ordinary kill path exactly once.
- Ordinary death consequences, including Volatile enemy hazards, remain governed by the existing run rules. An enemy-owned death hazard is never a player synergy source and does not recursively damage enemies.
- New slow/stun durations are not added by these initial eight proposals. Existing status effects continue to obey their current boss resistances and cooldowns.

## Eight proposed builds

| ID | Name | Required equipped relationship | Intended decision |
| --- | --- | --- | --- |
| S1 | Thermal Rupture / 热震 | Burn + Frost | Prepare a target, then switch for a controlled burst |
| S2 | Sanguine Return / 血偿 | Bleed + Leech | Commit a second weapon to limited recovery |
| S3 | Exposed Fault / 弱点断层 | Sunder + Critical | Exploit a short opening without increasing critical chance |
| S4 | Arc Cage / 电弧囚笼 | Gravity + Lightning | Group enemies to reach one additional target |
| S5 | Toxic Detonation / 毒性爆破 | Poison + Detonate | Arrange one controlled crowd clear, without chain explosions |
| S6 | Grounded Circuit / 接地回路 | Stun + Energize | Use a successful interruption to gain bounded energy |
| W1 | Breach Pair / 破门组合 | `shotgun` + `greatsword` | Follow a close-range shot with a deliberate melee commitment |
| W2 | Marksman's Relay / 精射接力 | `crossbow` + `revolver` | Land two precise ranged hits to create a little more space |

### S1 · Thermal Rupture — Burn + Frost

- **Trigger:** Hit one enemy with Burn, then hit it with Frost from the other weapon within **2.5 seconds**, or reverse the order when both tags are explicit enchantments. The appropriate underlying burn/slow must still be present. Intrinsic Burn can only start the Burn → Frost order.
- **Bonus:** One additional hit to that enemy for **0.30 × N**, capped at **8% maximum HP**. No area damage, extra freeze, slow extension or additional chill stack. It requires the enemy to survive the finishing primary hit.
- **Cooldown and boss rule:** **3 seconds per player**; bosses receive **0.15 × N**, capped at **4% maximum HP**. Ordinary armour/resistance still applies.
- **Cost and conflicts:** Consumes both proof marks, not the underlying statuses. Requires a real switch and two hits; slow projectiles or an interrupted burst can miss the window. It adds no new crowd control to Frost's existing freeze cycle. A single Frost flamethrower cannot self-complete it.
- **Fits:** A Burn `flamethrower` plus Frost `rifle` for a short-to-medium-range transition; or Burn `pistol` plus Frost `crossbow` for more deliberate single-target timing.

### S2 · Sanguine Return — Bleed + Leech

- **Trigger:** Prime an enemy with a Bleed direct hit, then land a Leech direct hit from the other weapon within **3 seconds**, while the source-tagged bleed remains active. Intrinsic Bleed on `battleaxe` can prime the sequence.
- **Bonus:** Additional healing of **min(3 HP, 6% of the finishing hit's actual health damage)**. One original enemy only; no range beyond the finishing weapon. Normal Leech healing is resolved separately once. A legitimate lethal finishing hit may heal from the health actually removed; striking an existing corpse never qualifies.
- **Cooldown and boss rule:** **3 seconds per player**. Against a boss, the additional heal is halved and capped at **1.5 HP**. The shared healing budget still applies.
- **Cost and conflicts:** It needs a second weapon, a living target at hit start and actual health damage. Armour, misses and low damage reduce its value. Bleed ticks and Leech's own healing cannot trigger it again. It cannot raise maximum HP or erase Glass Firepower's incoming-damage multiplier.
- **Fits:** Bleed `crossbow` plus Leech `dualblades` for a risky ranged-to-melee finish; or a `battleaxe` primer plus Leech `revolver` for a slower retreating recovery pattern.

### S3 · Exposed Fault — Sunder + Critical

- **Trigger:** After a Sunder primary hit, a **successful existing Critical roll** on a direct hit from the other weapon must occur within **2 seconds**, while the target remains Sundered. Merely equipping Critical or dealing a large hit is insufficient.
- **Bonus:** If the enemy survives the ordinary primary and its normal critical follow-up, deal **0.20 × N**, capped at **6% maximum HP**, to that same enemy. No area effect, extra armour removal or armour bypass.
- **Cooldown and boss rule:** **2.5 seconds per player**. Boss bonus is **0.10 × N**, capped at **3% maximum HP**. The existing reduced boss vulnerability remains unchanged.
- **Cost and conflicts:** The player accepts a short window and the baseline critical roll's uncertainty. Do not raise critical chance, reroll a failed critical or turn this bonus into a critical. Preserve the original roll result on the primary action token; its secondary damage is not a new qualifying hit.
- **Fits:** Sunder `rifle` plus Critical `sniper` for a precision finisher; or Sunder `smg` plus Critical `revolver` when movement and a faster setup matter more.

### S4 · Arc Cage — Gravity + Lightning

- **Trigger:** A Gravity direct hit primes one enemy. A Lightning direct hit from the other weapon must hit that same enemy within **2 seconds**. Resolve the ordinary Lightning chain first.
- **Bonus:** Add **one** final arc to the nearest eligible enemy within **150 units of the primed enemy**, with line of sight. Exclude the original enemy and every enemy already visited by the ordinary chain. Damage is **0.15 × N** evaluated against the extra recipient, capped at **5% of that recipient's maximum HP**. No eligible recipient means no bonus hit; the accepted sequence still consumes its marks/cooldown.
- **Cooldown and boss rule:** **4 seconds per player**. An extra arc hitting a boss uses **0.075 × N**, capped at **2.5% maximum HP**. No additional pull or stun is applied; the existing boss mass rule remains.
- **Cost and conflicts:** This is a crowd build, not a single-boss damage upgrade. It needs an unvisited fourth target when the normal two hops find recipients. It cannot jump through a wall, revisit an enemy or let the bonus arc create a further chain. The baseline chain's visited IDs must be available to the future resolver.
- **Fits:** Gravity `plasma` plus Lightning `rifle` for medium-range grouping; or Gravity `warhammer` plus Lightning `carbine`, accepting a close-range setup and the normal shared cooldown.

### S5 · Toxic Detonation — Poison + Detonate

- **Trigger:** A Poison direct hit primes an enemy. Within **3.5 seconds**, the other weapon's Detonate primary hit must kill that enemy and successfully activate the existing Detonate enchantment. A poison tick, intrinsic damage or secondary explosion kill cannot finish this sequence.
- **Bonus:** Amplify that **one existing explosion** by **0.10 × N** per eligible recipient, capped at **4% maximum HP** each. At most **3** closest visible recipients receive the bonus, within **min(existing Detonate radius, 145 units)**. Do not spawn a second explosion or enlarge the baseline radius.
- **Cooldown and boss rule:** **4 seconds per player**, in addition to the baseline Detonate cooldown. Bonus damage to a boss is **0.05 × N**, capped at **2% maximum HP**. Normal resistance and line-of-sight checks apply.
- **Cost and conflicts:** The player must arrange a direct finishing kill with the correct weapon while Detonate is ready. An unavailable ordinary Detonate proc gives no synergy, even if its four-second synergy cooldown is ready. Poison clouds cannot repeatedly prime or detonate the pack. Boss-death cleanup and ordinary death effects remain authoritative; the build never preserves dead adds for an extra payout.
- **Fits:** Poison `grenade` plus Detonate `shotgun` for a deliberate crowd finisher; or Poison `pistol` plus Detonate `battleaxe` for a close-range alternative. The axe's intrinsic Bleed is not a Detonate finishing source by itself.

### S6 · Grounded Circuit — Stun + Energize

- **Trigger:** A direct Stun hit must actually apply its normal stun/interrupt. A direct Energize hit from the other weapon must hit the same enemy within **1.5 seconds** and successfully activate the baseline Energize effect. A weapon's intrinsic stagger, Frost freeze or a parry does not provide the Stun-enchantment primer.
- **Bonus:** **+4 energy**, clamped to the existing 100-energy cap, in addition to one ordinary Energize activation. One target and one action token; no extra damage, heal, stun, stun refresh or cooldown refund. The target may have recovered from its successful original stun before the finishing hit.
- **Cooldown and boss rule:** **4 seconds per player**. A successfully stunned boss grants **+2 extra energy** instead. Do not require the boss to remain stunned for the whole switch window, but immune/failed stun applications never prime it.
- **Cost and conflicts:** Both effects must be ready and connect with a real enemy. It cannot recharge from corpses, invulnerable targets, self-damage, a safehouse or Overload's own secondary effects. A successful kill can pay the normal kill energy once; it cannot be replayed for another cycle.
- **Fits:** Stun `smg` plus Energize `plasma` for short controlled engagements; or Stun `revolver` plus Energize `spear` for a precise approach-and-finish sequence.

### W1 · Breach Pair — Shotgun + Greatsword

- **Activation:** The exact equipped weapon types must be `shotgun` and `greatsword`, in either slot order. A positive-health-damage Shotgun hit primes one enemy for **2 seconds**. The player must actually switch Shotgun → Greatsword, respect the shared attack cooldown, then land a Greatsword hit on that same living enemy.
- **Bonus:** One additional Greatsword hit for **0.20 × N**, capped at **6% maximum HP**, on the primed enemy only. The normal swing can still hit its usual targets, but this set proc cannot turn into another cleave or range increase. If the primary swing kills the target, no extra damage is needed or paid out.
- **Cooldown and boss rule:** **4 seconds per player**. Boss bonus is **0.10 × N**, capped at **3% maximum HP**. No armour bypass or new stun is added.
- **Cost and conflicts:** The player commits both slots to short-range weapons and must close to the existing Greatsword range. A Shotgun pellet batch can arm one target only; multiple pellets do not create multiple bonuses. Switching gear or returning to the Shotgun clears arming. A concurrent enchantment synergy and this set share the extra-damage budget; neither bonus becomes an input to the other.
- **Fits:** The two existing weapon types only. `doublebarrel` does not count as `shotgun`; do not silently add near-duplicate variants during the first experiment. Enchantments remain optional, so the set can be taught with ordinary weapons before combining it with S1–S6.

### W2 · Marksman's Relay — Crossbow + Revolver

- **Activation:** Equip `crossbow` and `revolver`. A Crossbow primary hit from at least **300 units** primes its first eligible living target for **2.5 seconds**. Actually switch Crossbow → Revolver and hit that same enemy from at least **220 units** before expiry. The original shared cooldown remains in force.
- **Bonus:** That one Revolver hit receives **+25% pre-mass knockback**, with the existing combined knockback-vector cap of **700**. No new damage, movement-speed boost, recovery extension or accuracy buff. Only one target per cycle; a piercing Crossbow projectile does not arm every enemy it crosses.
- **Cooldown and boss rule:** **3 seconds per player**. Existing boss knockback mass ×0.25 still applies once, so the absolute additional push is correspondingly smaller. Bosses receive no extra interrupt or phase cancellation.
- **Cost and conflicts:** The player gives up a rapid-fire/area or melee slot and must land two ranged hits while managing distance. Missing the second shot or rushing inside the minimum distance loses the opportunity. It does not reveal enemies through walls or Fog, restore a jammed laser, increase projectile range or reset attack cooldowns.
- **Fits:** The exact two existing weapon types. It is a space-making option for deliberate aim, not a universal passive damage multiplier. Removing either weapon clears arming immediately.

## Readability and player choice

A future build should show an equipped pair's name, both qualifying sources and its short action sequence in the inventory, with states such as **ready → target primed → proc/cooldown**. Add one small target mark and one distinct proc label; do not add a permanent combat sidebar or replace the white shelter and colourful maps.

Show why an attempted sequence did not qualify only where useful: missing partner, different target, expired mark, cooldown or no health damage. Do not promise a hidden effect for carrying a matching weapon. The player should be able to explain the condition after one successful example.

Fixed caps, global budgets and boss differences need visible descriptions before deployment. Do not label the provisional values as a finished balanced system or present these descriptions as effects available in the current game.

## Implementation sequence and acceptance gates

1. **Review existing playtest evidence first.** The [balance candidate](BALANCE_V0111.md) and [playtest guide](PLAYTEST_V0111.md) still need actual player observations. Do not use eight paper builds to mask an unclear warning or unhelpful extraction choice.
2. **Build attribution and a two-effect experiment.** Implement source/action tokens and the generic bounded resolver behind a future experiment flag, then enable only **S1 Thermal Rupture** and **S6 Grounded Circuit**. They exercise direct damage and utility without adding another heal or recursive area-kill loop. Existing current-release rules remain the comparison baseline.
3. **Verify counterexamples before adding more pairs.** Cover two sources versus one intrinsic weapon, pellet/burst/pierce grouping, delayed shots after swaps, old weapons no longer equipped, wall and safehouse checks, pausing, status expiry, actual critical results, capped/zero health damage, overkill, boss resistance and repeated kills. No test may obtain a proc by equipping the pair alone.
4. **Add remaining synergies in small batches.** S2 requires actual-health-damage and healing-budget evidence; S3 needs a reliable original critical event; S4 needs chain visitation attribution; S5 needs a single authoritative kill/detonation transaction. Do not approximate those event contracts with a second random roll or a guessed damage amount.
5. **Introduce the two sets as a separate comparison.** Preserve the shared attack cooldown, all weapon definitions and existing ownership. Verify the combined bonus cap when a set and synergy fire together. Document whether players actually swap for the benefit rather than simply select a compulsory pair.
6. **Only then add one contract loop, followed by factions.** Contract counters must consume authoritative, once-only gameplay events rather than visual labels. Add objective/reward persistence and migration tests before faction reputation unlocks. No contract, faction, curse or new permanent gear tier is implemented here.

Before an experiment ships, repeat game/save regression checks and native Windows inventory, equip/swap, pause, extraction and restart checks. Per-raid combat marks should not require a save-schema change; if a later design introduces persistent unlocks, specify that migration separately instead of silently storing runtime state on gear.

## How 10–20 recorded runs should influence priority

The v0.11.2 local journal can establish selected modifiers, run length, final heat, outcome, exit type and whether hunters actually appeared. It can help stratify the existing balance questions, but **it does not yet measure a synergy that has not been implemented**. Human feedback remains uncollected at the time of this design.

For the first 10–20 real runs, retain counts and missing observations rather than infer a population win rate. Read the records alongside the four questions in the playtest guide:

- Which modifiers/combos were selected or avoided, and did the player explain why?
- When and why did the player extract, including fallback versus special-route decisions?
- Did a loss feel unreadable or unfair, and which event caused that impression?
- Which exit types were used, at what heat and with what actual hunter activity?

Choose the first pair experiments after checking difficulty, map, loadout and player feedback together. If players struggle to identify a target and switch deliberately, prioritise S1's clear two-hit sequence and teaching feedback. If they enjoy timely interruptions but lack a reason to change weapons, S6 is the first utility candidate. Repeated unavoidable-damage complaints are a reason to investigate readability before adding S2 healing as compensation. A compulsory long-range loadout is a reason to inspect W1's engagement cost, not to inflate its damage until every player equips it.

Once S1/S6 exist, add **new explicit experimental instrumentation** for pair equipped, valid primer, proc accepted/rejected reason, actual bonus contribution and set arming/swap completion. Version those records separately and compare enabled/disabled sessions at comparable settings. Current journal fields alone cannot establish a pair's pick rate, proc reliability or healing contribution.

Review human explanations as well as counts: an unused pair may be unavailable, undiscovered, unclear or genuinely unattractive. Do not automatically buff every zero-count option or change v0.11.1 heat/extraction values in response to unrelated future build data. No 10–20-run threshold makes a sparse sample conclusive.
