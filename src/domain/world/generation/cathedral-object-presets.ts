import { GameRng } from '../../../core/rng';
import type {
  CathedralObjectPresetProfile,
  DungeonObjectPlacement,
  DungeonObjectPresetId,
  DungeonZone,
  TileKind,
} from '../dungeon-types';
import { chooseFootprintPosition, FORCED_PLACEMENT_TRIES, protectFootprint, randomBetween } from './shared';

const CATHEDRAL_OBJECT_PRESETS: CathedralObjectPresetProfile['presets'] = [
  {
    id: 'SHRINE',
    category: 'shrine',
    size: { width: 2, height: 2 },
    count: { min: 1, max: 2 },
    blocksMovement: true,
    tries: FORCED_PLACEMENT_TRIES,
  },
  {
    id: 'BOOKCASE',
    category: 'lore',
    size: { width: 1, height: 2 },
    count: { min: 2, max: 4 },
    blocksMovement: true,
    tries: FORCED_PLACEMENT_TRIES,
  },
  {
    id: 'BARREL_CLUSTER',
    category: 'container',
    size: { width: 2, height: 2 },
    count: { min: 3, max: 6 },
    blocksMovement: true,
    tries: FORCED_PLACEMENT_TRIES,
  },
  {
    id: 'SARCOPHAGUS',
    category: 'tomb',
    size: { width: 2, height: 1 },
    count: { min: 1, max: 3 },
    blocksMovement: true,
    tries: FORCED_PLACEMENT_TRIES,
  },
  {
    id: 'WEAPON_RACK',
    category: 'rack',
    size: { width: 1, height: 1 },
    count: { min: 1, max: 2 },
    blocksMovement: true,
    tries: FORCED_PLACEMENT_TRIES,
  },
] as const;

export const CATHEDRAL_OBJECT_PRESET_PROFILE: CathedralObjectPresetProfile = {
  enabled: true,
  placementOrder: CATHEDRAL_OBJECT_PRESETS.map((preset) => preset.id),
  presets: CATHEDRAL_OBJECT_PRESETS,
};

export function cathedralObjectPresetProfile(enabled: boolean): CathedralObjectPresetProfile {
  return {
    enabled,
    placementOrder: [...CATHEDRAL_OBJECT_PRESET_PROFILE.placementOrder],
    presets: CATHEDRAL_OBJECT_PRESETS.map((preset) => ({
      ...preset,
      size: { ...preset.size },
      count: { ...preset.count },
    })),
  };
}

export function placeCathedralObjectPresets(
  rng: GameRng,
  tiles: TileKind[][],
  protectedFootprints: Set<string>,
  zones: readonly DungeonZone[],
  enabled: boolean,
): DungeonObjectPlacement[] {
  if (!enabled) {
    return [];
  }

  protectNonObjectZones(protectedFootprints, zones);

  const placements: DungeonObjectPlacement[] = [];
  for (const preset of CATHEDRAL_OBJECT_PRESETS) {
    const count = randomBetween(rng, preset.count.min, preset.count.max);
    for (let index = 0; index < count; index += 1) {
      const position = chooseFootprintPosition(rng, tiles, protectedFootprints, preset.size, preset.tries);
      protectFootprint(protectedFootprints, position, preset.size);
      placements.push({
        id: objectPlacementId(preset.id, placements.length + 1),
        presetId: preset.id,
        category: preset.category,
        position,
        size: { ...preset.size },
        blocksMovement: preset.blocksMovement,
        tries: preset.tries,
      });
    }
  }

  return placements;
}

function protectNonObjectZones(protectedFootprints: Set<string>, zones: readonly DungeonZone[]): void {
  for (const zone of zones) {
    if (zone.kind === 'object') {
      continue;
    }
    protectFootprint(protectedFootprints, { x: zone.rect.x, y: zone.rect.y }, { width: zone.rect.width, height: zone.rect.height });
  }
}

function objectPlacementId(presetId: DungeonObjectPresetId, ordinal: number): string {
  return `${presetId.toLowerCase().replaceAll('_', '-')}-${String(ordinal).padStart(2, '0')}`;
}
