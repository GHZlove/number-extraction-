# Development roadmap

The project is moving from adding content toward making each expedition more interesting. Phases are delivered and reviewed separately. A version range is a planning label, not a release date or a promise that every listed feature is implemented.

## Phase 1 · Run depth, tuning and observation · v0.11–v0.11.2

**Delivered: v0.11.1 Windows numeric tuning candidate, with 290 passing automated cases and native checks. Current work: v0.11.2 local recording and review tools, retaining v0.11.1 tuning. A 2–4 day human playtest pass is planned; outside-player feedback is still uncollected.**

- Ten optional run mutators, with at most three selected and clear risks/rewards.
- Rising heat and warned hunter squads, with finite arrival and population budgets.
- Number-tier movement, collision and defence tradeoffs at 64, 256 and 1024.
- Seeded window, key, number and boss exit conditions, alongside a permanent fallback route.

- A separate local journal for the most recent 100 starts, voluntary structured feedback and deliberate anonymous JSON export; no automatic upload.

See the original [run-depth rules](RUN_DEPTH_V011.md), [v0.11.1 changes and diagnostic evidence](BALANCE_V0111.md), and [anonymous playtest kit](PLAYTEST_V0111.md). Review risky modifier combinations, high-heat pressure, 1024 movement and whether special exits offer a useful alternative to west. Check save migration, interrupted extraction and high-heat stability as release gates. The first review batch targets 10–20 recorded runs. Inspect selected/ignored modifiers, extraction timing/reasons, unfair or unreadable defeats and exit usage. Count exit shares only among successful extractions and exclude active/interrupted runs from completed-run rates. Watch whether special rewards displace west and whether late runs still encounter pressure; do not retune automatically from a small sample. Synthetic survival and native startup checks do not replace player feedback or complete the 2–4 day tuning window.

## Phase 2 · Build and shelter depth · v0.12

**Paper design only; no runtime effects activated in v0.11.2. Implementation starts after reviewing the tuning pass and human playtest feedback.**

1. **Equipment synergies and set bonuses:** build a small, distinct set of interactions using the existing 12 enchantments and 20 weapons.
2. **Contracts and bounties:** introduce measurable objectives that encourage different builds and modifiers, with one complete objective/reward loop before adding volume.
3. **Factions:** use contracts to earn reputation and unlock selected gear pools or modifiers.

Review the [eight proposed enchantment combinations and weapon sets](SYNERGIES_V012_DESIGN.md) while gathering observations. Their draft numbers are design hypotheses, not changes to the tuned game.

Cursed equipment and boss-codex rewards remain possible follow-up work within the broader build/shelter direction; they are not part of this numeric tuning pass. Validate ownership, loss rules, reward idempotency and save migration before increasing persistent scope.

## Phase 3 · Content scale · v0.15–0.17

**Planned; not implemented in v0.11.1.**

- A fifth map family and biome-specific encounters; expand the nine-boss roster toward roughly fourteen only when distinct mechanics are ready.
- Rule-breaking enemies, potentially odd or prime numbers with clear exceptions to ordinary merge/division rules.
- Difficulties above five and an endless or ascension mode.
- New weapons that enable distinct builds rather than duplicate existing roles.

Keep attack warnings, counterplay and loot identity readable. Add content after the run loop and build choices are worth repeating.

## Phase 4 · Replay and reach · v0.18+

**Planned; not implemented in v0.11.1.**

- Daily seeded runs and local leaderboards, with a defined score and reproducible rules.
- Controller support and broader browser/device validation.
- Public web distribution and potential Steam release preparation.
- Consider shared seeds before networked play. Co-op or rival extractors require a separate scope and architecture decision after earlier phases are evaluated.

A local web build and Windows desktop packaging already exist. Publishing a broader web release, shipping on Steam and proving controller support remain future work; deterministic map generation alone is not a completed daily-run system.

## Release safeguards

Retain warehouse ownership and overflow handling, save backups, migration from prior keys and settlement protection. Keep the automated suite aligned with actual production rules, and retain native Windows startup/restart/layout checks. Automated regression checks complement hands-on balance and hardware testing; neither test counts nor content counts alone determine readiness.
