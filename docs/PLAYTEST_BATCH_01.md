# Playtest batch 01 · Collect, review, then change one or two things

**Status:** no validated human JSON batch is attached to this review. There are no confirmed outside volunteers or analysed human results in this document. A/B/C below are assignment labels, not enrolled people, and the 2–4 day window is a proposed schedule rather than a completed activity.

The next useful evidence is an initial **10–20 real-run batch** containing both no-modifier runs and risky combinations. This is a practical triage target, not statistical proof. Failed, timed-out and voluntarily abandoned runs are useful evidence; do not discard them to make a neat count or a better outcome.

- Review build: **[REPLACE: verified v0.11.3 Windows release URL]**.
- Prior verified recorder: [v0.11.2 Windows EXE](https://github.com/GHZlove/number-extraction-/releases/download/v0.11.2-desktop.16/NumberExtraction-0.11.2-Windows-x64.exe) · [release and checks](https://github.com/GHZlove/number-extraction-/releases/tag/v0.11.2-desktop.16).
- Detailed observations and controls: [playtest guide](PLAYTEST_V0111.md).
- Current tuning: [v0.11.1 changes](BALANCE_V0111.md). The v0.11.3 review does not change these values.
- Later work: [eight paper synergy/set proposals](SYNERGIES_V012_DESIGN.md), with no runtime effects activated.

## Prepare a comparable block

Choose one build, balance version and difficulty for the first five-run block. Scout is a reasonable starting difficulty for someone learning the controls; use a higher difficulty only if the volunteer prefers it. Keep that participant's starting weapons, armour, laser and workshop level unchanged during the block. Store valuable warehouse gear unless its use is the explicit comparison. Do not upgrade between matched runs.

Do not reset or overwrite progress to make kits identical. If existing workshop levels or equipment differ, record the difference and compare like settings separately. Maps are random; a repeat at the same settings is not an identical map. Preserve the recorded map family and seed as context, without claiming a full replay or daily-seed feature.

A volunteer may optionally describe themselves as new or experienced. Do not request a name, email, account, age, location, device fingerprint or full game save. The owner chooses whom to invite and shares the invitation themselves; this workflow has not sent messages or recruited anyone.

## Anonymous five-run assignments

Invite two outside volunteers first, with a third if available. The owner can add a comparable block or contribute existing exported runs. Two outside blocks provide about ten runs; three provide about fifteen. If the total exceeds twenty, report the real total and retain every outcome, then review a coherent cohort rather than silently dropping cases.

Each volunteer should complete run 1 with no modifiers, attempt two risky mixes, and use the last two runs for a repeated or freely chosen route decision. A player can stop or return to shelter at any time. Do not require someone to win, fight a boss, stay past comfortable pressure or reach 1024.

| Anonymous assignment | Run 1 | Run 2 | Run 3 | Run 4 | Run 5 |
| --- | --- | --- | --- | --- | --- |
| A | No modifiers; learn the briefing and choose any exit | Number Surge + Supply Shortage + Fog | High Bounty + Haste + Volatile | No modifiers; consider west if it is a reasonable route | Free modifier/route choice; explain the decision |
| B | No modifiers; learn the briefing and choose any exit | No Dodge + Fog + Glass Firepower | Number Surge + Supply Shortage + Fog | Repeat a mix of the player's choice | No modifiers; compare a special exit with west before deciding |
| C, optional | No modifiers; learn the briefing and choose any exit | High Bounty + Haste + Volatile | No Dodge + Fog + Glass Firepower | No modifiers; observe heat if continuing is comfortable | Free choice, including an option not tried yet |

The Chinese in-game mixes are:

- Number Surge + Supply Shortage + Fog: **数字暴走＋补给短缺＋战区浓雾**.
- High Bounty + Haste + Volatile: **高价悬赏＋急行战场＋残爆怪群**.
- No Dodge + Fog + Glass Firepower: **禁用闪避＋战区浓雾＋玻璃火力**.

If a prescribed combination is declined, record that choice and the reason rather than forcing it. A declined assignment is not automatically an unused-modifier balance failure. Mark 1024 as **not reached** when applicable; do not replace normal progression with a boosted fixture and call it a human run.

## Invitation copy for the owner to share

These are drafts, not messages sent by the assistant.

**English**

> Would you like to try a small solo number-based extraction prototype? I am looking for about five runs of feedback, including a no-modifier run, two risky combinations and two runs with a choice of route or build. There is no requirement to win, and you can stop at any time. Please keep the same build, difficulty and starting kit for the comparison block. After each run, you can optionally record why you left, pressure from 1–5 and anything that felt unfair or hard to read. Records stay on your device. If you choose to share them, open Playtest in the shelter and export one latest anonymous JSON after the block; it excludes names, email addresses, IP addresses and absolute times. Please review the file first. I do not need a full game save or personal details.

**中文**

> 想邀请你试玩一个单机数字搜打撤原型，大约五局即可：一局不选词条、两局尝试高风险组合，另外两局自行选择路线或重复比较。没有通关要求，随时可以停止。比较时尽量保持相同版本、难度和开局装备。每局结束后，可以自愿记录撤离原因、1—5分压力感，以及不公平或看不清的情况。记录只保存在你的设备上；如果愿意分享，请在庇护所“试玩记录”中，于这一组结束后导出一份最新匿名JSON，先查看内容再发送。不需要姓名、邮箱、IP、完整存档或其他个人信息。

Add the verified build link yourself after release. Let the volunteer choose whether and where to share a report. Keep any separately volunteered experience notes under A/B/C labels, without adding a personal identifier to the exported gameplay data.

## One latest report per block

After roughly five runs, each volunteer can open **试玩记录 / Playtest**, fill any optional feedback, and export their latest anonymous JSON. Send only that latest report for the block, not an export after every run. If a newer file replaces an earlier one, say so and use the newer file instead of importing both.

The recorder exports a rolling maximum of 100 started runs. A report can therefore include activity from before the assigned block. Check the build, balance version, difficulty, map family and starting gear before interpreting it. Do not assume the file contains exactly five runs or that one file represents one unique person. JSON imports cannot certify human origin or identity.

The temporary v0.11.3 review accepts up to eight reports, each at most 256 KB and 100 starts. It does not append imported rows to the device's own journal or game save, does not change resources/equipment, and does not upload the files. The in-app review is temporary and disappears when the app closes; the original files remain wherever their owners saved them.

Exactly repeated report contents are counted once. Possible partial overlap is reported for manual resolution; a repeated local session number alone is not a global run identifier. Do not automatically delete all overlapping-looking rows or assume the files came from the same person. Remove an older/redundant report from the temporary selection, then analyse the intended latest reports again before making a tuning decision.

## Review patterns with explicit denominators

Start by stating imported-file count, retained started runs, finished runs, outcome counts and missing values. Keep build/balance-version/difficulty cohorts separate. Inspect map and starting-loadout distributions as potential confounders. The importer does not convert report count into player count, and a diagnostic flag does not establish a causal explanation.

The review queue stays empty for a cohort with fewer than **10 finished runs**, or while a possible overlap remains unresolved. Finished outcomes are extraction, combat defeat, timeout and voluntary abandonment; active/interrupted runs are excluded. Specific signals additionally need enough known observations:

| Pattern to inspect | Provisional signal | What to verify next |
| --- | --- | --- |
| West is rarely used | At least 5 successful extractions have a known exit and west accounts for under 20% of those known exits | Raw fraction, unknown exits, west detour, special conditions/reward, map position, kit and player reasons. A low share is not proof that special exits are too safe |
| Players leave without hunters | At least 5 successful extractions have known actual-hunter data and a majority have zero materialised hunters | Run lengths, safehouse use, guards/bosses, late cases and pressure ratings. Early extraction can be intentional; missing hunter data is not zero |
| A modifier is untouched | No recorded starts select it in this sample | Whether it was noticed and understood, whether assignments constrained choices, and whether rewards or wording discouraged it. Do not automatically buff it |
| A cause dominates combat deaths | At least 5 combat deaths have known causes and one cause accounts for at least 60% | Warnings, visibility, available response, form/kit and unfairness feedback. A common intended attack may dominate without being unfair |

**Late** means at least 75% of the applicable run time limit. Gear-bag occupancy and carried resource value help describe a haul, but resource storage is unlimited: there is no automatic “maximum loot” state. A queued hunter warning cancelled by a safehouse is not a hunter arrival, and arrival does not establish that the player felt hunted.

Blank feedback is missing, not “fair” or “no pressure.” Unknown cause or exit values remain unknown and are disclosed alongside percentages. Report observations as counts with denominators—for example, “west used in 1 of 8 known exits”—before offering any explanation. At most two investigation prompts are prioritised; they do not authorise an automatic patch or establish which parameter caused a shift.

A reproducible defect can be investigated immediately with its reproduction steps and a regression check. Keep that defect repair distinct from a claim that a small observational batch proves a balance change is needed.

## One or two changes per patch

When repeated cases and player explanations support a change, choose **one or two individually named parameters or wording changes**. Several heat rates and exit bonuses are not one change merely because they share a system name. Freeze other tuning while checking the new hypothesis.

Copy this decision record before making a patch:

```text
Batch / review identifier:
Build and balance version; difficulty; maps and starting kits:
Started / finished / successful / defeated / timed out / abandoned:
Active/interrupted excluded; unknown observations and blank responses:
Exact repeated reports skipped; overlap status:
Observation and denominator, with representative cases:
Player explanations supporting or contradicting the interpretation:
Alternative explanations or changed settings to check:

Change 1 — one parameter or one explanation:
Before → after:
Reason this change addresses the observed mechanism:
Primary measure expected to change in the next matched batch:
Measures that must remain acceptable:
Rollback value/text and the observation that would trigger reconsideration:

Change 2 — optional; leave blank if unnecessary:
Before → after:
Evidence and expected effect:
Rollback value/text:

Other tuned values held fixed:
Next batch: same difficulty, starting kit and map family where possible:
Actual outcome after the patch, including missing/contradictory evidence:
Decision: keep / revert / collect more / repair a reproducible defect:
```

Use a new build/balance label when appropriate and compare before/after cohorts at matched settings; do not pool them into a single success rate. There is no player-facing seed-entry control, so preserve the generated seed and configuration without claiming identical live maps. Keep the original reports and the exact change record. If there is no convincing repeated pattern, **collect more data instead of filling a patch slot**.

## Gate before Phase 2

Once the batch is reviewed, decide whether the next step is a narrowly scoped Phase 1 fix or the first small Phase 2 experiment. The [eight synergy/set proposals](SYNERGIES_V012_DESIGN.md) remain paper-only and inactive in the current game. Do not use an unimplemented synergy as compensation for an unreadable Phase 1 failure.

The first ten to twenty runs can identify questions and repeatable defects; they cannot prove universal fairness, a population win rate or that a 2–4 day study has been completed. Record unresolved questions and the next data needed rather than presenting the recruitment plan, native test fixture or imported file count as human playtest evidence.
