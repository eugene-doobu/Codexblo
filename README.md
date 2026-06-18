# Codexblo

Browser ARPG prototype focused on a dungeon-first development loop.

## Current milestone

The current milestone is a dungeon-first vertical slice built with Codex:

1. Generate Cathedral, Catacombs, Caves, and Hell layouts from random or manual seeds.
2. Inspect layouts in a dev-only `DungeonGenerationLabScene` before player movement or combat.
3. Render generated floor, wall, door, stair, collision, zone, object preset, and connectivity overlays.
4. Export failing seeds as reproducible fixtures.
5. Keep the runtime single-player only.

## Commands

```bash
npm install
npm run generate:assets
npm run export:dungeon -- --type Cathedral --level 1 --seed 123456789 --out dist/dungeons/cathedral.cdbd
npm run dev
npm test
npm run build
```

Open `/dev/dungeon-lab?type=Cathedral&seed=123456789`, `/dev/dungeon-lab?type=Catacombs&level=5&seed=123456789`, `/dev/dungeon-lab?type=Caves&level=9&seed=123456789`, or `/dev/dungeon-lab?type=Hell&level=13&seed=123456789` to jump directly into the dungeon generation lab.

## Dungeon binary export

`npm run export:dungeon -- --type <Cathedral|Catacombs|Caves|Hell> --level <number> --seed <text|uint32> --out <file>` writes a deterministic binary representation of the generated 40x40 tile grid.

The default `.cdbd` file layout is:

| Offset | Size | Encoding | Value |
| --- | ---: | --- | --- |
| 0 | 4 | ASCII | `CDBD` magic |
| 4 | 1 | uint8 | binary schema version (`1`) |
| 5 | 1 | uint8 | header size (`32`) |
| 6 | 1 | uint8 | dungeon type: Cathedral `1`, Catacombs `2`, Caves `3`, Hell `4` |
| 7 | 1 | uint8 | level number |
| 8 | 1 | bit flags | objects `0x01`, spawn zones `0x02`, quest locks `0x04` |
| 9 | 1 | bit flags | format feature flags (`0` for v1) |
| 10 | 2 | reserved | reserved for future header fields |
| 12 | 4 | uint32 LE | resolved seed |
| 16 | 2 | uint16 LE | grid width (`40`) |
| 18 | 2 | uint16 LE | grid height (`40`) |
| 20 | 4 | uint32 LE | generator version hash |
| 24 | 4 | uint32 LE | tile payload byte count (`1600`) |
| 28 | 4 | reserved | reserved for future header fields |
| 32 | 1600 | bytes | row-major tile payload |

Tile bytes are stable semantic ids: `void=0`, `floor=1`, `wall=2`, `door=3`, `stairUp=4`, `stairDown=5`. Pass `--raw` to write only the 1600-byte row-major tile payload without the header. The default output filename includes the resolved seed and option flag byte (`opts-xx`). Output paths must stay inside the project root; existing files are protected unless `--force` is passed.
