# v0.11.2 · Local playtest records

This build adds observation and review tools while retaining the **v0.11.1 balance values**. Equipment synergies remain a [paper proposal](SYNERGIES_V012_DESIGN.md); none of those effects activate in this build. Human feedback has not yet been collected.

## Use the journal

1. Open **试玩记录 / Playtest** in the shelter. Recording starts enabled and can be switched off there.
2. Play ordinary runs. A start creates one local entry; extraction, defeat, timeout or voluntary return completes it. Reopening after an unfinished run marks it interrupted.
3. After a run, optionally select an extraction reason, pressure from 1 to 5, and an unfairness/unreadability category. Blank answers stay missing. Extraction reasons are available only for successful extractions.
4. After roughly **10–20 finished runs**, open the journal and choose **导出匿名JSON / Export anonymous JSON**. Desktop users choose a file location; browser users receive a JSON download. Review the file before voluntarily sharing it.

The journal keeps the newest **100 started runs** under its own localStorage key, `number-extraction-playtest-v1`. It starts collecting with this build; old six-run progress history is not turned into invented observations. Disabling recording keeps previous entries. A paused run and a normal close capture a checkpoint; an abrupt interruption may preserve only earlier observations, so it is excluded from completed-run statistics.

## What is recorded

- Build and balance version, seed, difficulty, actual map family, starting weapons/quality/level/enchantments, armour quality and laser presence.
- Selected modifiers, run length and limit, final number, heat, health percentage, resource value, equipment-bag occupancy and crates opened.
- Hunter waves scheduled, hunters that **actually materialised**, and first materialisation time. Cancelled warnings do not count as hunters appearing.
- Successful exit type or a distinct defeated/timed-out/abandoned/interrupted outcome. Combat deaths use fixed attack categories; arbitrary text is not retained.
- Optional structured feedback, without free-text personal details.

A seed alone is not a full replay. Configuration and starting equipment also matter, and there is no daily-run or seed-entry interface yet.

## Reading the four questions

The journal shows modifier and combination counts across its retained started runs. Zero counts mean unused **in this local sample**, not an unpopular choice among all players. Exit shares use successful extractions only; unknown exit types remain visible rather than being assigned to a route.

Timing, heat, hunter observations and extraction reasons help examine the decision to leave. A late extraction means at least **75% of the run limit** elapsed. The dashboard counts late extractions with no materialised hunters, but that does not prove heat is decorative: route, safehouse use, gear and player feedback need review. Similarly, a spawned squad does not prove the player felt threatened.

Equipment-bag occupancy is only one loot indicator. Resource storage is unlimited, so a full equipment bag is not a maximum-resource haul. Death categories help locate events; whether an event felt unfair must come from player feedback. Timeouts and voluntary returns are not classified as combat deaths, and in-progress/interrupted runs are excluded from finished-run averages and outcomes.

Use the [expanded playtest guide](PLAYTEST_V0111.md) to watch special exits versus the western fallback and late-run pressure. Do not automatically rebalance from a small sample or pool unmatched difficulties/builds.

## Local storage and export

There is no automatic upload, account tracking or contact with other players. Anonymous exports contain a fixed gameplay-field whitelist; internal run IDs containing absolute time, names, email addresses, IP addresses, device fingerprints and file paths are excluded. Session numbers are local ordering labels, not player identities.

The journal is separate from the schema-5 `number-extraction-v11` progress save and does not alter credits, equipment ownership or settlement. A journal write failure does not block play or progress saving; the journal page warns when records are only in memory and can still be exported. Progress import/export does not include the journal. Anonymous journal JSON is a review report, not a restorable progress backup.

## Verification

- **319 automated cases pass**, including 16 journal, 6 desktop-export and 7 application/instrumentation cases added to the 290-case baseline.
- Sixteen fixed-input, finite-health combat fixtures produce identical case results between v0.11.1 and v0.11.2. This is a regression comparison, not human playtesting or proof of universal equivalence.
- Core heat, damage, modifier, equipment, boss and extraction tuning files are unchanged.
- [Windows build 42339485298](https://github.com/GHZlove/number-extraction-/actions/runs/42339485298) passed native startup, seven layouts, journal navigation, feedback persistence, actual anonymous file export, restart checks and final portable execution. The CI journal screenshot uses a fixed isolated fixture, never shipped player data.

## Verified download

- [Windows x64 portable EXE](https://github.com/GHZlove/number-extraction-/releases/download/v0.11.2-desktop.16/NumberExtraction-0.11.2-Windows-x64.exe) — 110,430,250 bytes.
- SHA256: `bc803769f41ac764862ccb506c5736341e6f60af8f46a81187101775d1d49c4d`; downloaded bytes match the release checksum and Windows PE signatures.
- Source commit: `9abeac751e0e43e3f695bb0fe2e80ce6242af639`; [release and screenshots](https://github.com/GHZlove/number-extraction-/releases/tag/v0.11.2-desktop.16).
- [Journal screenshot](https://github.com/GHZlove/number-extraction-/releases/download/v0.11.2-desktop.16/portable-playtest.png) (isolated CI fixture; not human data).

Finish your current raid and exit the old app before opening the new EXE. Progress keeps the same application-data profile and schema-5 save key. No human 10–20-run sample has been collected by these checks.
