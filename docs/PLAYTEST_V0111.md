# Balance playtest kit · v0.11.1 tuning / v0.11.2 local records

This is a short tuning pass before Phase 2 (v0.12). The v0.11.2 build adds local playtest records and review tools while retaining the v0.11.1 combat, heat and extraction values. Test the interaction of existing modifiers, heat, number forms and extraction routes; use observations before changing those numbers again.

**Human feedback status: uncollected.** The sessions below are planned, not completed playtests. Automated simulations, regression tests and native startup checks are separate evidence; they do not establish player comfort, fairness or win rates. A 2–4 day playtest window has not yet elapsed.

- Current logging build: **[Windows x64 EXE](https://github.com/GHZlove/number-extraction-/releases/download/v0.11.2-desktop.16/NumberExtraction-0.11.2-Windows-x64.exe)** · [release, screenshots and SHA256](https://github.com/GHZlove/number-extraction-/releases/tag/v0.11.2-desktop.16).
- Prior verified tuning candidate: **[Windows x64 EXE](https://github.com/GHZlove/number-extraction-/releases/download/v0.11.1-desktop.15/NumberExtraction-0.11.1-Windows-x64.exe)** · [release, screenshots and SHA256](https://github.com/GHZlove/number-extraction-/releases/tag/v0.11.1-desktop.15).
- Tuning changes: [numeric changes and measured diagnostic results](BALANCE_V0111.md).
- Existing systems and controls: [run-depth rules](RUN_DEPTH_V011.md).
- Future work only: [eight Phase 2 synergy and set proposals](SYNERGIES_V012_DESIGN.md). These are paper designs, not active effects in the tuning build.

## Four questions to answer

Aim for **10–20 recorded runs** as an initial review batch. This is a triage target, not a claim of statistical confidence or evidence already collected.

| Question | Local record to inspect | Player explanation still needed |
| --- | --- | --- |
| Which modifiers and combinations did players choose, and which did they never touch? | Modifier and combination counts across recorded starts | Why a modifier was attractive, unclear, too risky or ignored; “never chosen” applies only to this recorded sample |
| When did players extract, and why? | Run length, outcome, final heat, actual hunter arrivals, carried resource value and equipment occupancy | Optional extraction-reason response and the moment that changed the player's plan |
| Did a death feel unfair or unreadable? | Defeat cause and optional unfairness category | What the player saw before damage, what they expected and whether a credible response was available |
| Which exit types did players use most often? | Counts of successful fallback, window, key, number and boss extractions | Why that route won the comparison, or why another route was rejected |

Record chosen modifiers automatically; do not infer choices from available rewards or interview memory alone. A low selection count may indicate poor wording or unfamiliarity rather than an underpowered modifier.

## Local records, voluntary feedback and export

The v0.11.2 journal retains the **most recent 100 started runs** separately from the game save. It records build/balance version, seed, difficulty, actual map family, starting loadout and modifiers; on completion it adds duration, final heat, actual materialised hunters and first-arrival time, exit type, outcome/cause, carried resource value and equipment occupancy. Its balance version remains v0.11.1. Game progress continues using schema 5 and `number-extraction-v11`; the journal does not replace warehouse or progress data.

The outcome categories distinguish extraction, defeat, timeout, voluntary abandonment, interrupted runs and an active run. A reload or closed application is an interruption, not an invented death. Hunter arrival means an enemy actually materialised; a queued warning cancelled by a safehouse is not a hunter encounter. Neither arrival nor final heat proves that the player felt pressure.

After a run, optional structured feedback can record an extraction reason, pressure on a **1–5** scale and an unfairness/unreadability category. These answers are useful alongside the manual observations below. A blank answer means missing feedback, not “fair” or “no pressure.” The manual fairness, movement and clarity ratings later in this guide use a separate **0–5** scale.

Records stay on the player's device. Export is a deliberate player action producing anonymous JSON; it does not automatically upload feedback or contact anyone. The export excludes internal run IDs containing absolute time, names, email addresses, IP addresses and device fingerprints. Use voluntary session labels for shared notes. Do not request raw game saves or full desktop captures by default.

Split exported records by build/balance version, difficulty, map and starting gear before comparing outcomes. The rolling 100-run window is a local sample, not a count of all players or lifetime choices. Export a useful review batch before older records roll out of that window. A seed alone is insufficient to recreate a run: preserve the recorded configuration and loadout too; there is no player-facing daily-run or seed-entry mode.

## Setup and comparisons

Use anonymous session labels such as A1 or B2. A volunteer can describe their experience as “new to extraction games” or “experienced”; a name, account, email, age and location are unnecessary. Ask volunteers to play a build they choose to download; this guide does not contact or enrol anyone.

Start with a practice run on **边境巡查 / Scout** and locate the top-right **撤离情报 / Extraction Intelligence** button. Then compare runs at the same difficulty and map family, with the same workshop level and issued starting weapon. Leave valuable warehouse gear stored and do not upgrade facilities between comparison runs. Record any changed loadout. Normal maps are random: there is no player-facing seed-entry mode, so a same-setting replay is not an identical map.

One tester need not finish the whole matrix. Aim for a few short sessions from people who have not helped develop the game, including both new and experienced players. Stop a run or session whenever the player wishes; an abandoned run is a valid result.

## Session matrix

| Session | Setup | Player task | What to record |
| --- | --- | --- | --- |
| A · Baseline | No modifiers; Scout, then Standard if comfortable | Loot at least one resource point and choose an exit | Outcome, chosen exit, reason, damage cause, whether risk was understandable |
| B · Low visibility and resources | 数字暴走 `doubled` + 补给短缺 `scarcity` + 战区浓雾 `fog` | Use the same starting kit and difficulty as the baseline; seek a normal extraction | Could threats be read before damage? Were healing and retreat routes sufficient? Was the reward worth selecting this mix again? |
| C · Rising pressure | 高价悬赏 `rich` + 急行战场 `haste` + 残爆怪群 `volatile` | Loot while heat rises, observe a hunter arrival, then decide whether to retreat | Heat and remaining time when pressure first became dangerous; visibility of spawn and explosion warnings; whether a safehouse offered a meaningful recovery decision |
| D · Defensive tradeoffs | 禁用闪避 `no_dodge` + 战区浓雾 `fog` + 玻璃火力 `glass` | Try movement and directional parry rather than dodging | Whether damage was avoidable with information available; missed warning or parry; whether extra damage compensated for the risk |
| E · Number identity | No modifiers first; repeat with Haste only if useful | Compare 256/512 with 1024 when reached through normal play; cross open ground, a narrow passage and slow terrain | Form, movement comfort, apparent hitbox, escape options, threat level and any wall obstruction |
| F · Timed and key exits | Across runs containing these routes | Inspect the briefing, try a late window, collect the marked key card and interrupt a channel before a later extraction | Can the player explain the condition before arriving? Is the window state clear? Does interruption preserve the key? Why choose this route over the west? |
| G · Number and boss exits | Find these across separate runs; a run has one or the other | Read the required number or guardian condition; pursue it if reasonable, otherwise choose another exit | Was the objective findable and achievable in the remaining time? Did the route offer sufficient value? If the player declined it, why? |
| H · Fallback decision | Any run with carried loot | Compare the western route with the nearest special route before committing | Intended and actual exit, estimated detour, current heat, expected reward, safety and the decisive reason |

For session E, write **not reached** when 1024 was not reached; do not silently substitute a boosted character for normal progression. A developer-only high-tier fixture may test collision and attack geometry, but its results must be labelled separately. It cannot establish how often real players reach 1024.

Success is not the only useful result. Record death, timeout or abandonment, including an understandable reason where possible. One failed run does not prove a modifier mix is unwinnable; one experienced player's success does not prove it is fair for new players. Compare repeated attempts, loadouts, difficulty and map variation before tuning.

## Per-run record

Copy this block once per run. Leave unknown fields blank or write **not observed** rather than guessing.

```text
Session label:
Build/version:
Experience: new / experienced / prefer not to say
Difficulty / map family:
Modifiers selected; any modifier deliberately avoided and why:
Starting weapon, armour and relevant workshop upgrades:
Outcome: extracted / defeated / timed out / abandoned / interrupted
Run duration or remaining time at outcome:
Final heat / actual hunter arrivals / first arrival, if known:
Extraction reason / pressure 1–5 / unfairness category, if supplied:
Final number / highest number observed:
Exit intended / exit actually used:
Why this exit instead of the western fallback (or why west):
Heat and remaining time at first serious danger:
Danger source: hunter / resource guard / boss / terrain / unclear / other
Heat response: continued looting / changed route / safehouse / extracted
1024 reached? If yes, movement comfort and threat level:
Extraction condition understood before arrival? yes / partly / no
Confusing text or warning, with the exact situation:
Ratings: fairness __/5; movement comfort __/5; exit clarity __/5
Would choose this modifier mix again? yes / maybe / no; why:
One number or explanation you would change:
Optional cropped in-game screenshot or short clip:
```

Use the same rating anchors for every session:

| Rating | 0 | 3 | 5 |
| --- | --- | --- | --- |
| Fairness | Damage or failure felt unavoidable or unexplained | Usually understandable, with some frustrating cases | Clear warnings and credible counterplay, including when losing |
| Movement comfort | Could not move or evade comfortably | Usable, with noticeable friction | Responsive and comfortable for this form's intended role |
| Exit clarity | Could not explain how to use the route | Understood it after checking or trying | Could explain the condition and timing before approaching |

High fairness does not mean an easy run. Ask separately: **Was heat an interesting reason to change plans, or a punishment for continuing to play? What moment caused that feeling?** For 1024, ask whether the character was still threatened without feeling awkward to control.

This guide does not enrol volunteers or upload records. The optional local journal and its deliberate anonymous export complement observation; volunteers choose whether and where to share either. Do not treat local sample counts as a public leaderboard or evidence about all players.

## Planned 2–4 day tuning window

| Day | Work | Evidence to retain |
| --- | --- | --- |
| 1 | Baseline and first-time-player observation; let players explain exits before giving hints | Anonymous run records and the confusing wording they identify |
| 2 | Risky combinations, heat, 1024 movement and special-exit decisions | Repeated failure patterns and at least one reason for accepting or rejecting each observed route |
| 3, if available | Make a small numeric adjustment, state its rationale, repeat affected sessions | Before/after values and comparable run records; no new progression systems |
| 4, if available | Confirm the candidate, run regression/native checks and document unresolved feedback | Actual results, known limits and a release decision |

For a two-day pass, combine tuning and confirmation into day 2 only if there is enough evidence. If volunteers or high-tier observations are unavailable, state that clearly and leave those conclusions open. Do not report this schedule as completed simply because a candidate build was produced.

## Review before Phase 2

Summarise observed results by scenario and route, including sample sizes and missing responses. Count modifier selection against **recorded starts**; count exit shares against **successful extractions only**. Exclude active and interrupted runs from completed-run rates. Report defeats, timeouts and voluntary abandonments separately; do not label every failed extraction a death. State the denominator whenever showing a success fraction.

Use the following manual decision gates. They are prompts to inspect evidence, not automatic balance rules:

| Check | Initial review gate | Follow-up before changing values |
| --- | --- | --- |
| Special bonuses versus west | Once there are at least 10 successful extractions, zero western uses warrants a closer look | Compare starting location, map, conditions and player reasons. Repeated rejection of an accessible west because special routes feel equally safe and pay more supports investigating their risk/reward; zero uses alone does not prove west is pointless |
| Heat still creates late pressure | Define **late** as an outcome at or after 75% of that run's time limit. Inspect late extractions with no materialised hunters | Ask whether the player travelled, sheltered, encountered a boss or felt pressure from guards. Repeated late, well-stocked extractions with low pressure ratings and no hunter contact warrant review, not an immediate heat increase |
| Unfair or unreadable damage | Any repeatable defect deserves investigation immediately; look for repeated cause/feedback patterns | Reproduce the warning, visibility and available response at the same form and configuration before tuning damage or timing |
| Avoided modifiers | Zero selections after a 10–20 run batch is an interview prompt | Check whether the modifier was noticed and understood; compare risk, reward and starting kit before declaring it weak or unfair |

Resource storage is unlimited, so there is no objective “maximum loot” state. Carried resource value is a continuous measure. A full equipment bag is one stock/occupancy indicator, not proof of maximum earnings or optimal play. Report any high-loot threshold explicitly and keep it consistent within a comparison; do not invent one after looking at a tiny sample.

Keep the western fallback reliable. Tune special-route opening times, window lengths, reward differences, heat values or form values only when observed tradeoffs support the change. Preserve save compatibility, warehouse ownership and interrupted extraction behaviour. Fix a reproducible defect before discussing balance around it. No values should change automatically because the sample is empty or small.

The v0.11.1 tuning candidate is already released; v0.11.2 supports collecting evidence without retuning its systems. After reviewing actual observations, Phase 2 (v0.12) proceeds in order: **equipment synergies and set bonuses → contracts → factions**. The [eight synergy/set proposals](SYNERGIES_V012_DESIGN.md) may be reviewed on paper now; they do not activate in the playtest build.

## 简短中文反馈模板

```text
匿名场次编号 / 游戏版本：
难度、地图、已选词条、开局装备：
哪些词条刻意没选？为什么？
结果（撤离/战败/超时/主动放弃/中断）、时长与结束数字：
最终热度、实际出现的追猎数、首次出现时间（不知道请留空）：
热度何时开始造成明显压力？当时发生了什么？
到1024了吗？移动、体型和躲避是否舒服？没到请写“未到达”。
何时决定撤离？原本想用哪个出口，最后用了哪个？为什么？
是否出现不公平或读不懂的死亡？当时看到什么预警？
撤离条件是否提前看懂？哪里不清楚？
公平感 / 移动舒适度 / 撤离清晰度：各0–5分
最希望调整的一个数值或一句提示：
```
