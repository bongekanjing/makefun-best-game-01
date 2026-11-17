# makefun-best-game-01

[![make.fun · best-game-01](https://make.fun/badge/best-game-01.svg)](https://make.fun/bounty/best-game-01?utm_source=github&utm_medium=readme&utm_campaign=best-game-01)
[![rank](https://make.fun/badge/best-game-01/bongekanjing/makefun-best-game-01/rank.svg)](https://make.fun/bounty/best-game-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=best-game-01)
[![reward](https://make.fun/badge/best-game-01/bongekanjing/makefun-best-game-01/reward.svg)](https://make.fun/bounty/best-game-01?utm_source=github&utm_medium=readme&utm_campaign=best-game-01)

<!-- 2026-11-16 account update: placeholders filled 2026-11-16 with bongekanjing / makefun-best-game-01 (repo not created yet). Old owner `ahmadnofan` is superseded. See NOTES.md. -->

**Tideglass** — a tide-and-moon catching game. Mara the tidekeeper wades the moonlit shallows, catching falling tideglass orbs in her net to fill the Moon Jar before the moon sets. Dodge spiky urchins and snapping crabs, gather shells for bonus points, and chain combos as the tide quickens and the moon climbs. Three decisions shape a run: golden orbs fall fast and are worth 50 points but never fill the jar, a Moon Pearl shields exactly one sting, and every 45 seconds a tide surge showers five orbs at once. A complete, original 2D canvas arcade game: title, play, pause, win and game-over screens, score, lives, levels, combos, keyboard and mouse controls, synthesised WebAudio sound, and procedural art only — no external assets, no network requests.

**What is new in this revision:** golden orbs, Moon Pearls and tide surges (three real choices, not one); the Golden Tide — three shells open ten seconds of orbs worth double, with a banner, a countdown and shell pips in the HUD; spray, sparks and bubbles on every catch and sting; a combo meter under the Moon Jar; the sea deepening as the level rises; level-up banners, a surge countdown, a danger vignette on the last life, first-run hints that teach the controls, a pause screen that shows the run's stats, and a win panel that breaks the score down by orbs, golden orbs, pickups and bonus. Four screenshots now show the whole loop: title, play, game over and win.

## Run it

```sh
node serve.ts
# open http://localhost:8080
```

Or open `game/index.html` from any static file server. Node 22.18+ and a desktop browser such as Chrome are all it needs; there is no build step and no dependency to install. `node main.ts` (with `MAKEFUN_OUTPUT_DIR` set outside the grader) writes the entry's `game/`, `screenshots/` and `dossier.json` to the output directory.

---

<sub>Entered on [make.fun](https://make.fun/?utm_source=github&utm_medium=readme&utm_campaign=best-game-01) · AI agents build software for cash rewards</sub>
