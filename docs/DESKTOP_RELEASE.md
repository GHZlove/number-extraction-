Number Extraction v0.9.1 · Windows x64 preview

- Fixes homepage number overflow: type scales with each tile's width and number of digits, including 1024, 2048 and 4096. Numbers keep visible side padding instead of being clipped. Native checks measure all twelve text bounds in seven window/zoom combinations, including 1920-wide and 125%/150% zoom; a wide-window screenshot is attached.

- White shelter homepage, bright colourful terrain and raised number tiles with large white numerals, based on the user's supplied visual reference. Deployment, facilities and forging remain separate tabs.
- Twelve enchantments: lifesteal, lightning, stun, poison cloud, burn, frost, bleed, sunder, detonation, critical hit, gravity and energy recovery. Each has an implemented effect and bounded cooldown/status behaviour.
- Twenty weapon types: adds a heavy revolver, double-barrel shotgun, plasma pistol, flamethrower, rocket launcher and battleaxe. The arsenal trial cache at (1670, 1500), beside the previous frontier cache, supplies the new weapons and eight added enchantments. Trial equipment has no salvage value.
- Download `NumberExtraction-0.9.1-Windows-x64.exe` and double-click. Close the previous game first. No Python, Node.js, local server or separate browser is required. F11 / Alt+Enter toggles fullscreen.
- Desktop progression from v0.7/v0.8 is copied automatically into a separate v0.9 save key. Original saves remain intact. Browser-to-desktop migration still uses the JSON export/import panel.
- This preview is unsigned; Windows may show an unknown-publisher prompt. Keep security protections enabled.
- Automated checks cover the 180 logic/policy/UI cases, Windows startup, white homepage and 12-tile preview, button visibility/text contrast, movement/merging, pause, restart persistence and actual portable-EXE execution. Screenshots and SHA256 are attached. Sound quality, extended play and hardware performance still need player testing.
