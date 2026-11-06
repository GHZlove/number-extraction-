# Development roadmap

The project is moving from adding content toward making each expedition more interesting. Phases are delivered and reviewed separately. A version range is a planning label, not a release date or a promise that every listed feature is implemented.

## Phase 1 · Run depth · v0.11–0.12

**Delivered: v0.11 Windows playtest, with 271 passing automated cases and native release checks. Awaiting gameplay feedback before the next phase.**

- Ten optional run mutators, with at most three selected and clear risks/rewards.
- Rising heat and warned hunter squads, with finite arrival and population budgets.
- Number-tier movement, collision and defence tradeoffs at 64, 256 and 1024.
- Seeded window, key, number and boss exit conditions, alongside a permanent fallback route.

See [run-depth rules](RUN_DEPTH_V011.md). Review whether these systems create a useful extract-or-push decision before expanding scope. Check save migration, interrupted extraction and high-heat stability as release gates; use playtesting to tune pressure and rewards.

## Phase 2 · Build and shelter depth · v0.13–0.14

**Planned; not implemented in v0.11.**

- Enchantment interactions and meaningful set bonuses.
- Cursed equipment with explicit benefits and costs.
- Shelter NPC contracts and bounties with measurable objectives.
- Faction reputation that unlocks selected gear pools and run modifiers.
- Boss-codex rewards and small lore connections.

Start with one complete contract/reward loop and a small synergy set. Validate ownership, loss rules, reward idempotency and save migration before increasing the number of persistent systems.

## Phase 3 · Content scale · v0.15–0.17

**Planned; not implemented in v0.11.**

- A fifth map family and biome-specific encounters; expand the nine-boss roster toward roughly fourteen only when distinct mechanics are ready.
- Rule-breaking enemies, potentially odd or prime numbers with clear exceptions to ordinary merge/division rules.
- Difficulties above five and an endless or ascension mode.
- New weapons that enable distinct builds rather than duplicate existing roles.

Keep attack warnings, counterplay and loot identity readable. Add content after the run loop and build choices are worth repeating.

## Phase 4 · Replay and reach · v0.18+

**Planned; not implemented in v0.11.**

- Daily seeded runs and local leaderboards, with a defined score and reproducible rules.
- Controller support and broader browser/device validation.
- Public web distribution and potential Steam release preparation.
- Consider shared seeds before networked play. Co-op or rival extractors require a separate scope and architecture decision after earlier phases are evaluated.

A local web build and Windows desktop packaging already exist. Publishing a broader web release, shipping on Steam and proving controller support remain future work; deterministic map generation alone is not a completed daily-run system.

## Release safeguards

Retain warehouse ownership and overflow handling, save backups, migration from prior keys and settlement protection. Keep the automated suite aligned with actual production rules, and retain native Windows startup/restart/layout checks. Automated regression checks complement hands-on balance and hardware testing; neither test counts nor content counts alone determine readiness.
