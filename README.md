# Codexblo

Browser ARPG prototype focused on a dungeon-first development loop.

## First milestone

The first milestone is the Cathedral dungeon foundation:

1. Generate Cathedral layouts from random or manual seeds.
2. Inspect layouts in a dev-only `DungeonGenerationLabScene` before player movement or combat.
3. Render generated floor, wall, door, stair, collision, zone, and connectivity overlays.
4. Export failing seeds as reproducible fixtures.
5. Keep the runtime single-player only.

## Commands

```bash
npm install
npm run generate:assets
npm run dev
npm test
npm run build
```

Open `/dev/dungeon-lab?type=Cathedral&seed=123456789` to jump directly into the dungeon generation lab.