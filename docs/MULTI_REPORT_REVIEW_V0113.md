# v0.11.3 · Review a real playtest batch

This build reviews deliberately selected anonymous reports without retuning v0.11.1 gameplay or activating Phase 2 synergies. No validated human JSON batch is attached to this release. The [first-batch plan](PLAYTEST_BATCH_01.md) provides five-run assignments and invitation text for two or three volunteers; it is a template, not evidence of recruitment.

## In the game

Open **试玩记录 / Playtest** in the shelter. **分析本机记录** reviews an explicit snapshot of the local journal. **合并分析报告** reads up to eight exported JSON files, each at most 256KB and together at most 2MB. It does not automatically add local records to imported files.

The review exists only in memory. Import does not restore, replace or append to the game save or journal, and does not upload anything. Closing or reloading the app clears the review. **移除本次分析** clears the view without deleting source files or stored runs. A failed or cancelled import leaves the previous review intact.

Use one latest export per source. Entirely identical canonical reports count once. Matching gameplay content across different reports raises a possible-overlap warning; it cannot establish an anonymous player identity. Such rows are not silently deleted and investigation queues pause until overlaps are resolved. Report count is not player count, and unresolved overlapping rows are not independent runs.

Each report can hold 100 starts, and all eight reports can retain 800 observations for analysis. Build, balance version and difficulty define separate cohorts. Maps and starting equipment are shown as possible confounders. Ten observations pooled across two five-run cohorts do not make either cohort adequate for review.

## Provisional signals

At least **10 finished runs per cohort**, known version/difficulty and no unresolved overlap are required before its investigation queue activates. Interrupted and active runs do not count as finished. These gates support initial triage, not statistical proof.

| Observation | Gate and interpretation |
| --- | --- |
| Western fallback below 20% | At least five known successful exits; inspect travel distance, prerequisites, rewards and player explanations before calling special routes too safe |
| Most successful runs end before hunters appear | At least five successful runs with known hunter observations; a share above 50% prompts checking time spent, safehouses and pressure feedback |
| Unused modifier | Describe zero selections within this batch; confirm availability, understanding and test assignments before changing a reward |
| One known death cause reaches 60% | At least five known combat deaths; inspect attack readability, equipment and optional unfairness feedback |

Unknown values remain unknown. A missing hunter observation is not zero, and missing feedback is not an answer of “fair.” Exit shares use known successful exits with unknown exit types shown separately. Timeouts and voluntary returns are not combat deaths. Late extraction means at least 75% of the run limit elapsed; a full equipment bag is not a maximum-resource haul because resources are unlimited.

The review lists at most **two investigation priorities**. It does not propose exact balance numbers or modify any setting. After corroboration, use the [one-or-two-change patch template](PLAYTEST_BATCH_01.md): name each changed parameter or explanation, record evidence, predict the effect and define a rollback. Compare the next matched batch before adding further changes.

## Local command-line review

The same analysis is available without launching the game:

```bash
node tools/analyze-playtests.mjs report-a.json report-b.json --format markdown --output analysis.md
node tools/analyze-playtests.mjs report-a.json --format json --output analysis.json
```

Generated reports omit input filenames, paths and personal identifiers. Input validation is strict; game progress saves and files with arbitrary extra data are rejected. The CLI refuses to overwrite any input report, including through symbolic links, junction paths or hard links. An explicitly chosen separate output is the only file it writes.

## Verification

- 355 automated cases pass: the 319-case baseline plus 23 analysis/CLI, seven desktop-import and six application-review cases.
- Sixteen fixed-input combat fixtures have identical case results between v0.11.2 and v0.11.3. No heat, damage, weapon, boss or extraction tuning values changed.
- Tests cover 800 observations, repeated local session numbers across independent reports, complete duplicates, partial overlaps, missing data, mixed cohorts, threshold boundaries, source-file protection, cancellation and storage isolation.
- Native Windows startup, restart and final portable execution pass. Importing the same isolated export twice retains one report and one finished fixture; the ten-run gate stays closed. Progress and journal bytes remain unchanged across review, clearing and reload. Native captures use fixed isolated CI fixtures, not human data.

## Verified Windows release

[Download v0.11.3 EXE](https://github.com/GHZlove/number-extraction-/releases/download/v0.11.3-desktop.18/NumberExtraction-0.11.3-Windows-x64.exe) · [release](https://github.com/GHZlove/number-extraction-/releases/tag/v0.11.3-desktop.18) · [Windows build](https://github.com/GHZlove/number-extraction-/actions/runs/42350585330) · [review capture](https://github.com/GHZlove/number-extraction-/releases/download/v0.11.3-desktop.18/portable-review.png).

Source: `694e3bd7b1e082284ab70e05e10793f3437fc777`. Actual download: 110,437,272 bytes; MZ/PE signatures and published SHA256 match: `59c1a282a6e7e1c58f6d53d6f752bdea31edbe5e9cab65620e930b51ad8de672`. See [verification evidence](evidence/v0113-release-verification.json). This release is a prerelease on the playtest branch; main and the hosted game were not updated.
