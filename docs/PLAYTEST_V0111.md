# v0.11.1 · Balance playtest kit

This is a short tuning pass before Phase 2 (v0.12). Test the interaction of existing modifiers, heat, number forms and extraction routes. Adjust numbers and explanations first; do not add contracts, factions or equipment synergies during this pass.

**Human feedback status: uncollected.** The sessions below are planned, not completed playtests. Automated simulations, regression tests and native startup checks are separate evidence; they do not establish player comfort, fairness or win rates. A 2–4 day playtest window has not yet elapsed.

- Candidate build: **[REPLACE: verified v0.11.1 Windows release URL]**.
- Tuning changes: [numeric changes and measured diagnostic results](BALANCE_V0111.md).
- Existing systems and controls: [run-depth rules](RUN_DEPTH_V011.md).

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
Modifiers:
Starting weapon, armour and relevant workshop upgrades:
Outcome: extracted / died / timed out / abandoned
Run duration or remaining time at outcome:
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

No telemetry, feedback upload or contact collection is enabled by this document. Volunteers choose whether and where to share a record. Do not request full desktop screenshots, raw saves or diagnostic logs as the default; the short gameplay record is sufficient for the first pass.

## Planned 2–4 day tuning window

| Day | Work | Evidence to retain |
| --- | --- | --- |
| 1 | Baseline and first-time-player observation; let players explain exits before giving hints | Anonymous run records and the confusing wording they identify |
| 2 | Risky combinations, heat, 1024 movement and special-exit decisions | Repeated failure patterns and at least one reason for accepting or rejecting each observed route |
| 3, if available | Make a small numeric adjustment, state its rationale, repeat affected sessions | Before/after values and comparable run records; no new progression systems |
| 4, if available | Confirm the candidate, run regression/native checks and document unresolved feedback | Actual results, known limits and a release decision |

For a two-day pass, combine tuning and confirmation into day 2 only if there is enough evidence. If volunteers or high-tier observations are unavailable, state that clearly and leave those conclusions open. Do not report this schedule as completed simply because a candidate build was produced.

## Review before Phase 2

Summarise observed results by scenario and route, including sample sizes and missing observations. Look for repeated confusion, avoidable damage that players could not read, a high-tier form that is uncomfortable, or a fallback that wins every meaningful comparison. Do not infer a population win rate from a handful of runs.

Keep the western fallback reliable. Tune special-route opening times, window lengths, reward differences, heat values or form values only when the observed tradeoff supports the change. Preserve save migration, warehouse ownership and interrupted extraction behaviour. Fix a reproducible defect before discussing balance around it.

Release v0.11.1 with its actual evidence and open questions. After review, Phase 2 (v0.12) proceeds in order: **equipment synergies and set bonuses → contracts → factions**.

## 简短中文反馈模板

```text
匿名场次编号 / 游戏版本：
难度、地图、词条、开局装备：
结果与结束时数字：
热度何时开始造成明显压力？当时发生了什么？
到1024了吗？移动、体型和躲避是否舒服？没到请写“未到达”。
原本想用哪个出口，最后用了哪个？为什么？
撤离条件是否提前看懂？哪里不清楚？
公平感 / 移动舒适度 / 撤离清晰度：各0–5分
最希望调整的一个数值或一句提示：
```
