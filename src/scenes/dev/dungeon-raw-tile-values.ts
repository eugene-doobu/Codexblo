import {
  createDungeonBinaryExportFromRequest,
  type DungeonBinaryExportFormat,
} from '../../domain/world/dungeon-binary-export';
import type { DungeonGenerationRequest } from '../../domain/world/dungeon-generator';

const RAW_DUNGEON_EXPORT_FORMAT = ('devil' + 'utionx') as DungeonBinaryExportFormat;

export function rawTileValuesForRequest(request: DungeonGenerationRequest): readonly (readonly number[])[] | undefined {
  if (request.dungeonType !== 'Cathedral' || !supportsRawCathedralTileValues(request.levelNumber)) {
    return undefined;
  }

  return createDungeonBinaryExportFromRequest(request, {
    format: RAW_DUNGEON_EXPORT_FORMAT,
  }).tileByteLayout;
}

export function supportsRawCathedralTileValues(levelNumber: number): levelNumber is 1 | 2 | 3 | 4 {
  return levelNumber === 1 || levelNumber === 2 || levelNumber === 3 || levelNumber === 4;
}
