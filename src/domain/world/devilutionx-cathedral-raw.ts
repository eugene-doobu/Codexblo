import { checksumJson } from '../../core/hash';
import { GameRng } from '../../core/rng';

const DMAXX = 40;
const DMAXY = 40;
const TRIES = DMAXX * DMAXY;

const VWall = 1;
const HWall = 2;
const Corner = 3;
const DWall = 4;
const DArch = 5;
const VWallEnd = 6;
const HWallEnd = 7;
const HArchEnd = 8;
const VArchEnd = 9;
const HArchVWall = 10;
const VArch = 11;
const HArch = 12;
const Floor = 13;
const HWallVArch = 14;
const Pillar = 15;
const VCorner = 16;
const HCorner = 17;
const DirtHwall = 18;
const DirtVwall = 19;
const VDirtCorner = 20;
const HDirtCorner = 21;
const Dirt = 22;
const DirtHwallEnd = 23;
const DirtVwallEnd = 24;
const VDoor = 25;
const HDoor = 26;
const HFenceVWall = 27;
const DFence = 29;
const VFenceEnd = 32;
const VFence = 35;
const HFence = 36;
const HWallVFence = 37;
const HArchVFence = 38;
const HArchVDoor = 39;
const VWall2 = 79;
const HWall2 = 80;
const VWall4 = 89;
const VWall5 = 90;
const HWall4 = 91;
const HWall5 = 92;
const Floor12 = 139;
const Floor14 = 141;
const HWallShadow = 148;
const HArchShadow = 149;
const HArchShadow2 = 153;
const HWallShadow2 = 154;
const DirtHWall2 = 199;
const DirtVWall2 = 200;
const DirtCorner2 = 202;
const DirtHWallEnd2 = 204;
const DirtVWallEnd2 = 205;

const SHADOW_PATTERNS = [
  [7, 13, 0, 13, 144, 0, 142],
  [16, 13, 0, 13, 144, 0, 142],
  [15, 13, 0, 13, 145, 0, 142],
  [5, 13, 13, 13, 152, 140, 139],
  [5, 13, 1, 13, 143, 146, 139],
  [5, 13, 13, 2, 143, 140, 148],
  [5, 0, 1, 2, 0, 146, 148],
  [5, 13, 11, 13, 143, 147, 139],
  [5, 13, 13, 12, 143, 140, 149],
  [5, 13, 11, 12, 150, 147, 149],
  [5, 13, 1, 12, 143, 146, 149],
  [5, 13, 11, 2, 143, 147, 148],
  [9, 13, 13, 13, 144, 140, 142],
  [9, 13, 1, 13, 144, 146, 142],
  [9, 13, 11, 13, 151, 147, 142],
  [8, 13, 0, 13, 144, 0, 139],
  [8, 13, 0, 12, 143, 0, 149],
  [8, 0, 0, 2, 0, 0, 148],
  [11, 0, 0, 13, 0, 0, 139],
  [11, 13, 0, 13, 139, 0, 139],
  [11, 2, 0, 13, 148, 0, 139],
  [11, 12, 0, 13, 149, 0, 139],
  [11, 13, 11, 12, 139, 0, 149],
  [14, 0, 0, 13, 0, 0, 139],
  [14, 13, 0, 13, 139, 0, 139],
  [14, 2, 0, 13, 148, 0, 139],
  [14, 12, 0, 13, 149, 0, 139],
  [14, 13, 11, 12, 139, 0, 149],
  [10, 0, 13, 0, 0, 140, 0],
  [10, 13, 13, 0, 140, 140, 0],
  [10, 0, 1, 0, 0, 146, 0],
  [10, 13, 11, 0, 140, 147, 0],
  [12, 0, 13, 0, 0, 140, 0],
  [12, 13, 13, 0, 140, 140, 0],
  [12, 0, 1, 0, 0, 146, 0],
  [12, 13, 11, 0, 140, 147, 0],
  [3, 13, 11, 12, 150, 0, 0],
] as const;

const BASE_TYPES = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 0, 0, 0, 0, 0, 0, 0, 1, 2, 10, 4, 5, 6, 7, 8, 9, 10, 11, 12, 14, 5, 14, 10, 4, 14, 4, 5, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 2, 3, 4, 1, 6, 7, 16, 17, 2, 1, 1, 2, 2, 1, 1, 2, 2, 2, 2, 2, 1, 1, 11, 1, 13, 13, 13, 1, 2, 1, 2, 1, 2, 1, 2, 2, 2, 2, 12, 0, 0, 11, 1, 11, 1, 13, 0, 0, 0, 0, 0, 0, 0, 13, 13, 13, 13, 13, 13, 13, 13, 13, 13, 13, 13, 13, 1, 11, 2, 12, 13, 13, 13, 12, 2, 1, 2, 2, 4, 14, 4, 10, 13, 13, 4, 4, 1, 1, 4, 2, 2, 13, 13, 13, 13, 25, 26, 28, 30, 31, 41, 43, 40, 41, 42, 43, 25, 41, 43, 28, 28, 1, 2, 25, 26, 22, 22, 25, 26, 0, 0, 0, 0, 0, 0, 0, 0] as const;
const TILE_DECORATIONS = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 0, 0, 0, 0, 0, 0, 0, 25, 26, 0, 28, 0, 30, 31, 0, 0, 0, 0, 0, 0, 0, 0, 40, 41, 42, 43, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 79, 80, 0, 82, 0, 0, 0, 0, 0, 0, 79, 0, 80, 0, 0, 79, 80, 0, 2, 2, 2, 1, 1, 11, 25, 13, 13, 13, 1, 2, 1, 2, 1, 2, 1, 2, 2, 2, 2, 12, 0, 0, 11, 1, 11, 1, 13, 0, 0, 0, 0, 0, 0, 0, 13, 13, 13, 13, 13, 13, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0] as const;

interface Point {
  x: number;
  y: number;
}

interface Size {
  width: number;
  height: number;
}

interface Rect {
  position: Point;
  size: Size;
}

interface RawMiniset {
  size: Size;
  search: readonly (readonly number[])[];
  replace: readonly (readonly number[])[];
}

export interface DevilutionxCathedralRawOptions {
  levelNumber?: 1 | 2 | 3 | 4;
  originalCathedral?: boolean;
  lightBannerAvailable?: boolean;
  poisonedWaterAvailable?: boolean;
  setPieceRoomContains?: (point: Point) => boolean;
}

export interface DevilutionxCathedralRawResult {
  seed: number;
  levelNumber: number;
  width: 40;
  height: 40;
  tileBytes: Uint8Array;
  tileLayout: number[][];
  checksum: string;
  attemptCount: number;
  acceptedLayoutSeed: number;
}

const STAIRSUP: RawMiniset = {
  size: { width: 4, height: 4 },
  search: [
    [13, 13, 13, 13],
    [2, 2, 2, 2],
    [13, 13, 13, 13],
    [13, 13, 13, 13],
  ],
  replace: [
    [0, 66, 6, 0],
    [63, 64, 65, 0],
    [0, 67, 68, 0],
    [0, 0, 0, 0],
  ],
};

const L5STAIRSUP: RawMiniset = {
  size: { width: 4, height: 4 },
  search: [
    [22, 22, 22, 22],
    [2, 2, 2, 2],
    [13, 13, 13, 13],
    [13, 13, 13, 13],
  ],
  replace: [
    [0, 66, 23, 0],
    [63, 64, 65, 0],
    [0, 67, 68, 0],
    [0, 0, 0, 0],
  ],
};

const STAIRSDOWN: RawMiniset = {
  size: { width: 4, height: 3 },
  search: [
    [13, 13, 13, 13],
    [13, 13, 13, 13],
    [13, 13, 13, 13],
  ],
  replace: [
    [62, 57, 58, 0],
    [61, 59, 60, 0],
    [0, 0, 0, 0],
  ],
};

const LAMPS: RawMiniset = {
  size: { width: 2, height: 2 },
  search: [
    [13, 0],
    [13, 13],
  ],
  replace: [
    [129, 0],
    [130, 128],
  ],
};

const PWATERIN: RawMiniset = {
  size: { width: 6, height: 6 },
  search: [
    [13, 13, 13, 13, 13, 13],
    [13, 13, 13, 13, 13, 13],
    [13, 13, 13, 13, 13, 13],
    [13, 13, 13, 13, 13, 13],
    [13, 13, 13, 13, 13, 13],
    [13, 13, 13, 13, 13, 13],
  ],
  replace: [
    [0, 0, 0, 0, 0, 0],
    [0, 202, 200, 200, 84, 0],
    [0, 199, 203, 203, 83, 0],
    [0, 85, 206, 80, 81, 0],
    [0, 0, 134, 135, 0, 0],
    [0, 0, 0, 0, 0, 0],
  ],
};

export function generateDevilutionxCathedralRawLevel(
  seed: number,
  options: DevilutionxCathedralRawOptions = {},
): DevilutionxCathedralRawResult {
  return new CathedralRawGenerator(seed, options).generate();
}

export function readDevilutionxDunTileLayer(bytes: Uint8Array): Uint8Array {
  if (bytes.length < 4) {
    throw new Error('DUN data must include width and height words.');
  }
  const width = readUint16LE(bytes, 0);
  const height = readUint16LE(bytes, 2);
  if (width !== DMAXX || height !== DMAXY) {
    throw new Error(`Expected a 40x40 DUN fixture, received ${width}x${height}.`);
  }
  const tileLayerBytes = 4 + width * height * 2;
  if (bytes.length < tileLayerBytes) {
    throw new Error(`DUN data is truncated: expected at least ${tileLayerBytes} bytes, received ${bytes.length}.`);
  }
  const output = new Uint8Array(width * height);
  for (let index = 0; index < output.length; index += 1) {
    output[index] = readUint16LE(bytes, 4 + index * 2) & 0xff;
  }
  return output;
}

class CathedralRawGenerator {
  private readonly rng: GameRng;
  private readonly levelNumber: 1 | 2 | 3 | 4;
  private readonly originalCathedral: boolean;
  private readonly lightBannerAvailable: boolean;
  private readonly poisonedWaterAvailable: boolean;
  private readonly setPieceRoomContains: (point: Point) => boolean;
  private dungeon = createNumberGrid(Dirt);
  private protectedTiles = createBooleanGrid(false);
  private chamber = createBooleanGrid(false);
  private dungeonMask = createBooleanGrid(false);
  private verticalLayout = false;
  private hasChamber1 = false;
  private hasChamber2 = false;
  private hasChamber3 = false;
  private attemptCount = 0;
  private acceptedLayoutSeed = 0;

  constructor(seed: number, options: DevilutionxCathedralRawOptions) {
    this.rng = new GameRng(seed);
    this.levelNumber = options.levelNumber ?? 1;
    this.originalCathedral = options.originalCathedral ?? false;
    this.lightBannerAvailable = options.lightBannerAvailable ?? false;
    this.poisonedWaterAvailable = options.poisonedWaterAvailable ?? false;
    this.setPieceRoomContains = options.setPieceRoomContains ?? (() => false);
  }

  generate(): DevilutionxCathedralRawResult {
    if (this.lightBannerAvailable) {
      throw new Error('DevilutionX Cathedral raw parity for light-banner setpiece levels is not implemented yet.');
    }
    this.generateLevel();
    const tileLayout = this.dungeon.map((row) => [...row]);
    const tileBytes = new Uint8Array(DMAXX * DMAXY);
    let offset = 0;
    for (let y = 0; y < DMAXY; y += 1) {
      for (let x = 0; x < DMAXX; x += 1) {
        tileBytes[offset] = this.get(x, y) & 0xff;
        offset += 1;
      }
    }

    return {
      seed: this.rng.getInitialSeed(),
      levelNumber: this.levelNumber,
      width: DMAXX,
      height: DMAXY,
      tileBytes,
      tileLayout,
      checksum: checksumJson(Array.from(tileBytes)),
      attemptCount: this.attemptCount,
      acceptedLayoutSeed: this.acceptedLayoutSeed >>> 0,
    };
  }

  private generateLevel(): void {
    const minarea = this.levelNumber === 1 ? 533 : this.levelNumber === 2 ? 693 : 761;

    while (true) {
      do {
        this.attemptCount += 1;
        this.acceptedLayoutSeed = this.rng.getState();
        this.firstRoom();
      } while (this.findArea() < minarea);

      this.initDungeonFlags();
      this.makeDmt();
      this.fillChambers();
      this.fixTilesPatterns();
      this.addWall();
      if (this.placeCathedralStairs()) {
        break;
      }
    }

    this.fixDirtTiles();
    this.fixCornerTiles();
    this.substitution();
    this.applyShadowsPatterns();

    const lampCount = this.rng.generateRnd(5) + 5;
    for (let index = 0; index < lampCount; index += 1) {
      this.placeMiniSet(LAMPS, TRIES, true);
    }
    this.fillFloor();
  }

  private firstRoom(): void {
    this.dungeonMask = createBooleanGrid(false);

    this.verticalLayout = this.rng.flipCoin();
    this.hasChamber1 = !this.rng.flipCoin();
    this.hasChamber2 = !this.rng.flipCoin();
    this.hasChamber3 = !this.rng.flipCoin();

    if (!this.hasChamber1 || !this.hasChamber3) {
      this.hasChamber2 = true;
    }

    let chamber1 = rect(1, 15, 10, 10);
    const chamber2 = rect(15, 15, 10, 10);
    let chamber3 = rect(29, 15, 10, 10);
    let hallway = rect(1, 17, 38, 6);

    if (!this.hasChamber1) {
      hallway.position.x += 17;
      hallway.size.width -= 17;
    }
    if (!this.hasChamber3) {
      hallway.size.width -= 16;
    }
    if (this.verticalLayout) {
      chamber1 = swapRect(chamber1);
      chamber3 = swapRect(chamber3);
      hallway = swapRect(hallway);
    }

    if (this.hasChamber1) {
      this.mapRoom(chamber1);
    }
    if (this.hasChamber2) {
      this.mapRoom(chamber2);
    }
    if (this.hasChamber3) {
      this.mapRoom(chamber3);
    }

    this.mapRoom(hallway);

    if (this.hasChamber1) {
      this.generateRoom(chamber1, this.verticalLayout);
    }
    if (this.hasChamber2) {
      this.generateRoom(chamber2, this.verticalLayout);
    }
    if (this.hasChamber3) {
      this.generateRoom(chamber3, this.verticalLayout);
    }
  }

  private generateRoom(area: Rect, verticalLayoutInput: boolean): void {
    const rotate = this.rng.flipCoin(4);
    const verticalLayout = (!verticalLayoutInput && rotate) || (verticalLayoutInput && !rotate);
    let placeRoom1 = false;
    let room1 = rect(area.position.x, area.position.y, 0, 0);

    for (let num = 0; num < 20; num += 1) {
      const randomWidth = (this.rng.generateRnd(5) + 2) & ~1;
      const randomHeight = (this.rng.generateRnd(5) + 2) & ~1;
      room1 = rect(area.position.x, area.position.y, randomWidth, randomHeight);
      if (verticalLayout) {
        room1.position.x -= room1.size.width;
        room1.position.y += Math.trunc(area.size.height / 2) - Math.trunc(room1.size.height / 2);
        placeRoom1 = this.checkRoom(rect(
          room1.position.x - 1,
          room1.position.y - 1,
          room1.size.height + 2,
          room1.size.width + 1,
        ));
      } else {
        room1.position.x += Math.trunc(area.size.width / 2) - Math.trunc(room1.size.width / 2);
        room1.position.y -= room1.size.height;
        placeRoom1 = this.checkRoom(rect(
          room1.position.x - 1,
          room1.position.y - 1,
          room1.size.width + 2,
          room1.size.height + 1,
        ));
      }
      if (placeRoom1) {
        break;
      }
    }

    if (placeRoom1) {
      this.mapRoom(rect(
        room1.position.x,
        room1.position.y,
        Math.min(DMAXX - room1.position.x, room1.size.width),
        Math.min(DMAXX - room1.position.y, room1.size.height),
      ));
    }

    const room2 = cloneRect(room1);
    let placeRoom2: boolean;
    if (verticalLayout) {
      room2.position.x = area.position.x + area.size.width;
      placeRoom2 = this.checkRoom(rect(
        room2.position.x,
        room2.position.y - 1,
        room2.size.width + 1,
        room2.size.height + 2,
      ));
    } else {
      room2.position.y = area.position.y + area.size.height;
      placeRoom2 = this.checkRoom(rect(
        room2.position.x - 1,
        room2.position.y,
        room2.size.width + 2,
        room2.size.height + 1,
      ));
    }

    if (placeRoom2) {
      this.mapRoom(room2);
    }
    if (placeRoom1) {
      this.generateRoom(room1, !verticalLayout);
    }
    if (placeRoom2) {
      this.generateRoom(room2, !verticalLayout);
    }
  }

  private mapRoom(room: Rect): void {
    for (let y = 0; y < room.size.height; y += 1) {
      for (let x = 0; x < room.size.width; x += 1) {
        this.setMask(room.position.x + x, room.position.y + y, true);
      }
    }
  }

  private checkRoom(room: Rect): boolean {
    for (let y = 0; y < room.size.height; y += 1) {
      for (let x = 0; x < room.size.width; x += 1) {
        const px = room.position.x + x;
        const py = room.position.y + y;
        if (px < 0 || px >= DMAXX || py < 0 || py >= DMAXY) {
          return false;
        }
        if (this.getMask(px, py)) {
          return false;
        }
      }
    }
    return true;
  }

  private findArea(): number {
    let count = 0;
    for (let y = 0; y < DMAXY; y += 1) {
      for (let x = 0; x < DMAXX; x += 1) {
        if (this.getMask(x, y)) {
          count += 1;
        }
      }
    }
    return count;
  }

  private initDungeonFlags(): void {
    this.dungeon = createNumberGrid(Dirt);
    this.protectedTiles = createBooleanGrid(false);
    this.chamber = createBooleanGrid(false);
  }

  private makeDmt(): void {
    for (let y = 0; y < DMAXY - 1; y += 1) {
      for (let x = 0; x < DMAXX - 1; x += 1) {
        if (this.getMask(x, y)) {
          this.set(x, y, Floor);
        } else if (!this.getMask(x + 1, y + 1) && this.getMask(x, y + 1) && this.getMask(x + 1, y)) {
          this.set(x, y, Floor);
        } else if (this.getMask(x + 1, y + 1) && this.getMask(x, y + 1) && this.getMask(x + 1, y)) {
          this.set(x, y, VCorner);
        } else if (this.getMask(x, y + 1)) {
          this.set(x, y, HWall);
        } else if (this.getMask(x + 1, y)) {
          this.set(x, y, VWall);
        } else if (this.getMask(x + 1, y + 1)) {
          this.set(x, y, DWall);
        } else {
          this.set(x, y, Dirt);
        }
      }
    }
  }

  private fillChambers(): void {
    let chamber1: Point = { x: 0, y: 14 };
    let chamber3: Point = { x: 28, y: 14 };
    let hall1: Point = { x: 12, y: 18 };
    let hall2: Point = { x: 26, y: 18 };
    if (this.verticalLayout) {
      chamber1 = swapPoint(chamber1);
      chamber3 = swapPoint(chamber3);
      hall1 = swapPoint(hall1);
      hall2 = swapPoint(hall2);
    }

    if (this.hasChamber1) {
      this.generateChamber(chamber1, false, true, this.verticalLayout);
    }
    if (this.hasChamber2) {
      this.generateChamber({ x: 14, y: 14 }, this.hasChamber1, this.hasChamber3, this.verticalLayout);
    }
    if (this.hasChamber3) {
      this.generateChamber(chamber3, true, false, this.verticalLayout);
    }

    if (this.hasChamber2) {
      if (this.hasChamber1) {
        this.generateHall(hall1, 2, this.verticalLayout);
      }
      if (this.hasChamber3) {
        this.generateHall(hall2, 2, this.verticalLayout);
      }
    } else {
      this.generateHall(hall1, 16, this.verticalLayout);
    }
  }

  private generateChamber(position: Point, connectPrevious: boolean, connectNext: boolean, verticalLayout: boolean): void {
    const p = { ...position };
    if (connectPrevious) {
      if (verticalLayout) {
        this.set(p.x + 2, p.y, HArch);
        this.set(p.x + 3, p.y, HArch);
        this.set(p.x + 4, p.y, Corner);
        this.set(p.x + 7, p.y, VArchEnd);
        this.set(p.x + 8, p.y, HArch);
        this.set(p.x + 9, p.y, HWall);
      } else {
        this.set(p.x, p.y + 2, VArch);
        this.set(p.x, p.y + 3, VArch);
        this.set(p.x, p.y + 4, Corner);
        this.set(p.x, p.y + 7, HArchEnd);
        this.set(p.x, p.y + 8, VArch);
        this.set(p.x, p.y + 9, VWall);
      }
    }
    if (connectNext) {
      if (verticalLayout) {
        p.y += 11;
        this.set(p.x + 2, p.y, HArchVWall);
        this.set(p.x + 3, p.y, HArch);
        this.set(p.x + 4, p.y, HArchEnd);
        this.set(p.x + 7, p.y, DArch);
        this.set(p.x + 8, p.y, HArch);
        if (this.get(p.x + 9, p.y) !== DWall) {
          this.set(p.x + 9, p.y, HDirtCorner);
        }
        p.y -= 11;
      } else {
        p.x += 11;
        this.set(p.x, p.y + 2, HWallVArch);
        this.set(p.x, p.y + 3, VArch);
        this.set(p.x, p.y + 4, VArchEnd);
        this.set(p.x, p.y + 7, DArch);
        this.set(p.x, p.y + 8, VArch);
        if (this.get(p.x, p.y + 9) !== DWall) {
          this.set(p.x, p.y + 9, HDirtCorner);
        }
        p.x -= 11;
      }
    }

    for (let y = 1; y < 11; y += 1) {
      for (let x = 1; x < 11; x += 1) {
        this.set(p.x + x, p.y + y, Floor);
        this.setChamber(p.x + x, p.y + y, true);
      }
    }

    this.set(p.x + 4, p.y + 4, Pillar);
    this.set(p.x + 7, p.y + 4, Pillar);
    this.set(p.x + 4, p.y + 7, Pillar);
    this.set(p.x + 7, p.y + 7, Pillar);
  }

  private generateHall(start: Point, length: number, verticalLayout: boolean): void {
    if (verticalLayout) {
      for (let y = start.y; y < start.y + length; y += 1) {
        this.set(start.x, y, VArch);
        this.set(start.x + 3, y, VArch);
      }
    } else {
      for (let x = start.x; x < start.x + length; x += 1) {
        this.set(x, start.y, HArch);
        this.set(x, start.y + 3, HArch);
      }
    }
  }

  private horizontalWallOk(position: Point): number {
    let length = 1;
    while (this.get(position.x + length, position.y) === Floor) {
      if (
        this.get(position.x + length, position.y - 1) !== Floor
        || this.get(position.x + length, position.y + 1) !== Floor
        || this.isProtected(position.x + length, position.y)
        || this.isChamber(position.x + length, position.y)
      ) {
        break;
      }
      length += 1;
    }

    if (length === 1) {
      return -1;
    }

    if (!isAnyOf(this.get(position.x + length, position.y), Corner, DWall, DArch, VWallEnd, HWallEnd, VCorner, HCorner, DirtHwall, DirtVwall, VDirtCorner, HDirtCorner, DirtHwallEnd, DirtVwallEnd)) {
      return -1;
    }

    return length;
  }

  private verticalWallOk(position: Point): number {
    let length = 1;
    while (this.get(position.x, position.y + length) === Floor) {
      if (
        this.get(position.x - 1, position.y + length) !== Floor
        || this.get(position.x + 1, position.y + length) !== Floor
        || this.isProtected(position.x, position.y + length)
        || this.isChamber(position.x, position.y + length)
      ) {
        break;
      }
      length += 1;
    }

    if (length === 1) {
      return -1;
    }

    if (!isAnyOf(this.get(position.x, position.y + length), Corner, DWall, DArch, VWallEnd, HWallEnd, VCorner, HCorner, DirtHwall, DirtVwall, VDirtCorner, HDirtCorner, DirtHwallEnd, DirtVwallEnd)) {
      return -1;
    }

    return length;
  }

  private horizontalWall(position: Point, startInput: number, maxX: number): void {
    let start = startInput;
    let wallTile = HWall;
    let doorTile = HDoor;

    switch (this.rng.generateRnd(4)) {
      case 2:
        wallTile = HArch;
        doorTile = HArch;
        if (start === HWall) {
          start = HArch;
        } else if (start === DWall) {
          start = HArchVWall;
        }
        break;
      case 3:
        wallTile = HFence;
        if (start === HWall) {
          start = HFence;
        } else if (start === DWall) {
          start = HFenceVWall;
        }
        break;
    }

    if (this.rng.generateRnd(6) === 5) {
      doorTile = HArch;
    }

    this.set(position.x, position.y, start);
    for (let x = 1; x < maxX; x += 1) {
      this.set(position.x + x, position.y, wallTile);
    }

    const doorOffset = this.rng.generateRnd(maxX - 1) + 1;
    this.set(position.x + doorOffset, position.y, doorTile);
    if (doorTile === HDoor) {
      this.setProtected(position.x + doorOffset, position.y, true);
    }
  }

  private verticalWall(position: Point, startInput: number, maxY: number): void {
    let start = startInput;
    let wallTile = VWall;
    let doorTile = VDoor;

    switch (this.rng.generateRnd(4)) {
      case 2:
        wallTile = VArch;
        doorTile = VArch;
        if (start === VWall) {
          start = VArch;
        } else if (start === DWall) {
          start = HWallVArch;
        }
        break;
      case 3:
        wallTile = VFence;
        if (start === VWall) {
          start = VFence;
        } else if (start === DWall) {
          start = HWallVFence;
        }
        break;
    }

    if (this.rng.generateRnd(6) === 5) {
      doorTile = VArch;
    }

    this.set(position.x, position.y, start);
    for (let y = 1; y < maxY; y += 1) {
      this.set(position.x, position.y + y, wallTile);
    }

    const doorOffset = this.rng.generateRnd(maxY - 1) + 1;
    this.set(position.x, position.y + doorOffset, doorTile);
    if (doorTile === VDoor) {
      this.setProtected(position.x, position.y + doorOffset, true);
    }
  }

  private addWall(): void {
    for (let y = 0; y < DMAXY; y += 1) {
      for (let x = 0; x < DMAXX; x += 1) {
        if (this.isProtected(x, y) || this.isChamber(x, y)) {
          continue;
        }

        if (this.get(x, y) === Corner) {
          this.rng.discardRandomValues(1);
          const maxX = this.horizontalWallOk({ x, y });
          if (maxX !== -1) {
            this.horizontalWall({ x, y }, HWall, maxX);
          }
        }
        if (this.get(x, y) === Corner) {
          this.rng.discardRandomValues(1);
          const maxY = this.verticalWallOk({ x, y });
          if (maxY !== -1) {
            this.verticalWall({ x, y }, VWall, maxY);
          }
        }
        if (this.get(x, y) === VWallEnd) {
          this.rng.discardRandomValues(1);
          const maxX = this.horizontalWallOk({ x, y });
          if (maxX !== -1) {
            this.horizontalWall({ x, y }, DWall, maxX);
          }
        }
        if (this.get(x, y) === HWallEnd) {
          this.rng.discardRandomValues(1);
          const maxY = this.verticalWallOk({ x, y });
          if (maxY !== -1) {
            this.verticalWall({ x, y }, DWall, maxY);
          }
        }
        if (this.get(x, y) === HWall) {
          this.rng.discardRandomValues(1);
          const maxX = this.horizontalWallOk({ x, y });
          if (maxX !== -1) {
            this.horizontalWall({ x, y }, HWall, maxX);
          }
        }
        if (this.get(x, y) === VWall) {
          this.rng.discardRandomValues(1);
          const maxY = this.verticalWallOk({ x, y });
          if (maxY !== -1) {
            this.verticalWall({ x, y }, VWall, maxY);
          }
        }
      }
    }
  }

  private fixTilesPatterns(): void {
    for (let y = 0; y < DMAXY; y += 1) {
      for (let x = 0; x < DMAXX; x += 1) {
        if (x + 1 < DMAXX) {
          if (this.get(x, y) === HWall && this.get(x + 1, y) === Dirt) this.set(x + 1, y, DirtHwallEnd);
          if (this.get(x, y) === Floor && this.get(x + 1, y) === Dirt) this.set(x + 1, y, DirtHwall);
          if (this.get(x, y) === Floor && this.get(x + 1, y) === HWall) this.set(x + 1, y, HWallEnd);
          if (this.get(x, y) === VWallEnd && this.get(x + 1, y) === Dirt) this.set(x + 1, y, DirtVwallEnd);
        }
        if (y + 1 < DMAXY) {
          if (this.get(x, y) === VWall && this.get(x, y + 1) === Dirt) this.set(x, y + 1, DirtVwallEnd);
          if (this.get(x, y) === Floor && this.get(x, y + 1) === VWall) this.set(x, y + 1, VWallEnd);
          if (this.get(x, y) === Floor && this.get(x, y + 1) === Dirt) this.set(x, y + 1, DirtVwall);
        }
      }
    }

    for (let y = 0; y < DMAXY; y += 1) {
      for (let x = 0; x < DMAXX; x += 1) {
        if (x + 1 < DMAXX) {
          if (this.get(x, y) === Floor && this.get(x + 1, y) === DirtVwall) this.set(x + 1, y, HDirtCorner);
          if (this.get(x, y) === Floor && this.get(x + 1, y) === Dirt) this.set(x + 1, y, VDirtCorner);
          if (this.get(x, y) === HWallEnd && this.get(x + 1, y) === Dirt) this.set(x + 1, y, DirtHwallEnd);
          if (this.get(x, y) === Floor && this.get(x + 1, y) === DirtVwallEnd) this.set(x + 1, y, HDirtCorner);
          if (this.get(x, y) === DirtVwall && this.get(x + 1, y) === Dirt) this.set(x + 1, y, VDirtCorner);
          if (this.get(x, y) === HWall && this.get(x + 1, y) === DirtVwall) this.set(x + 1, y, HDirtCorner);
          if (this.get(x, y) === DirtVwall && this.get(x + 1, y) === VWall) this.set(x + 1, y, VWallEnd);
          if (this.get(x, y) === HWallEnd && this.get(x + 1, y) === DirtVwall) this.set(x + 1, y, HDirtCorner);
          if (this.get(x, y) === HWall && this.get(x + 1, y) === VWall) this.set(x + 1, y, VWallEnd);
          if (this.get(x, y) === Corner && this.get(x + 1, y) === Dirt) this.set(x + 1, y, DirtVwallEnd);
          if (this.get(x, y) === HDirtCorner && this.get(x + 1, y) === VWall) this.set(x + 1, y, VWallEnd);
          if (this.get(x, y) === HWallEnd && this.get(x + 1, y) === VWall) this.set(x + 1, y, VWallEnd);
          if (this.get(x, y) === HWallEnd && this.get(x + 1, y) === DirtVwallEnd) this.set(x + 1, y, HDirtCorner);
          if (this.get(x, y) === DWall && this.get(x + 1, y) === VCorner) this.set(x + 1, y, HCorner);
          if (this.get(x, y) === HWallEnd && this.get(x + 1, y) === Floor) this.set(x + 1, y, HCorner);
          if (this.get(x, y) === HWall && this.get(x + 1, y) === DirtVwallEnd) this.set(x + 1, y, HDirtCorner);
          if (this.get(x, y) === HWall && this.get(x + 1, y) === Floor) this.set(x + 1, y, HCorner);
        }
        if (x > 0) {
          if (this.get(x, y) === DirtHwallEnd && this.get(x - 1, y) === Dirt) this.set(x - 1, y, DirtVwall);
          if (this.get(x, y) === DirtVwall && this.get(x - 1, y) === DirtHwallEnd) this.set(x - 1, y, HDirtCorner);
          if (this.get(x, y) === VWallEnd && this.get(x - 1, y) === Dirt) this.set(x - 1, y, DirtVwallEnd);
          if (this.get(x, y) === VWallEnd && this.get(x - 1, y) === DirtHwallEnd) this.set(x - 1, y, HDirtCorner);
        }
        if (y + 1 < DMAXY) {
          if (this.get(x, y) === VWall && this.get(x, y + 1) === HWall) this.set(x, y + 1, HWallEnd);
          if (this.get(x, y) === VWallEnd && this.get(x, y + 1) === DirtHwall) this.set(x, y + 1, HDirtCorner);
          if (this.get(x, y) === DirtHwall && this.get(x, y + 1) === HWall) this.set(x, y + 1, HWallEnd);
          if (this.get(x, y) === VWallEnd && this.get(x, y + 1) === HWall) this.set(x, y + 1, HWallEnd);
          if (this.get(x, y) === HDirtCorner && this.get(x, y + 1) === HWall) this.set(x, y + 1, HWallEnd);
          if (this.get(x, y) === VWallEnd && this.get(x, y + 1) === Dirt) this.set(x, y + 1, DirtVwallEnd);
          if (this.get(x, y) === VWallEnd && this.get(x, y + 1) === Floor) this.set(x, y + 1, VCorner);
          if (this.get(x, y) === VWall && this.get(x, y + 1) === Floor) this.set(x, y + 1, VCorner);
          if (this.get(x, y) === Floor && this.get(x, y + 1) === VCorner) this.set(x, y + 1, HCorner);
        }
        if (y > 0) {
          if (this.get(x, y) === VWallEnd && this.get(x, y - 1) === Dirt) this.set(x, y - 1, HWallEnd);
          if (this.get(x, y) === VWallEnd && this.get(x, y - 1) === Dirt) this.set(x, y - 1, DirtVwallEnd);
          if (this.get(x, y) === HWallEnd && this.get(x, y - 1) === DirtVwallEnd) this.set(x, y - 1, HDirtCorner);
          if (this.get(x, y) === DirtHwall && this.get(x, y - 1) === DirtVwallEnd) this.set(x, y - 1, HDirtCorner);
        }
      }
    }

    for (let y = 0; y < DMAXY; y += 1) {
      for (let x = 0; x < DMAXX; x += 1) {
        if (y + 1 < DMAXY && this.get(x, y) === DWall && this.get(x, y + 1) === HWall) this.set(x, y + 1, HWallEnd);
        if (x + 1 < DMAXX && this.get(x, y) === HWall && this.get(x + 1, y) === DirtVwall) this.set(x + 1, y, HDirtCorner);
        if (y + 1 < DMAXY && this.get(x, y) === DirtHwall && this.get(x, y + 1) === Dirt) this.set(x, y + 1, VDirtCorner);
      }
    }
  }

  private placeCathedralStairs(): boolean {
    let success = true;

    if (this.poisonedWaterAvailable && !this.placeMiniSet(PWATERIN, TRIES, true)) {
      success = false;
    }

    const upStairs = this.originalCathedral && !this.lightBannerAvailable ? L5STAIRSUP : STAIRSUP;
    if (!this.placeMiniSet(upStairs, TRIES, true)) {
      if (this.originalCathedral) {
        return false;
      }
      success = false;
    }

    if (!this.lightBannerAvailable && !this.placeMiniSet(STAIRSDOWN, TRIES, true)) {
      success = false;
    }

    return success;
  }

  private placeMiniSet(miniset: RawMiniset, tries: number, drlg1Quirk: boolean): Point | undefined {
    const sw = miniset.size.width;
    const sh = miniset.size.height;
    const position = {
      x: this.rng.generateRnd(DMAXX - sw),
      y: this.rng.generateRnd(DMAXY - sh),
    };

    for (let attempt = 0; attempt < tries; attempt += 1, position.x += 1) {
      if (position.x === DMAXX - sw) {
        position.x = 0;
        position.y += 1;
        if (position.y === DMAXY - sh) {
          position.y = 0;
        }
      }

      if (drlg1Quirk) {
        let valid = true;
        if (position.x <= 12) {
          position.x += 1;
          valid = false;
        }
        if (position.y <= 12) {
          position.y += 1;
          valid = false;
        }
        if (!valid) {
          continue;
        }
      }

      if (this.setPieceRoomContains(position)) {
        continue;
      }
      if (!this.minisetMatches(miniset, position)) {
        continue;
      }

      this.minisetPlace(miniset, position);
      return { ...position };
    }

    return undefined;
  }

  private minisetMatches(miniset: RawMiniset, position: Point, respectProtected = true): boolean {
    for (let y = 0; y < miniset.size.height; y += 1) {
      for (let x = 0; x < miniset.size.width; x += 1) {
        const search = miniset.search[y][x] ?? 0;
        if (search !== 0 && this.get(position.x + x, position.y + y) !== search) {
          return false;
        }
        if (respectProtected && this.isProtected(position.x + x, position.y + y)) {
          return false;
        }
      }
    }
    return true;
  }

  private minisetPlace(miniset: RawMiniset, position: Point, protect = false): void {
    for (let y = 0; y < miniset.size.height; y += 1) {
      for (let x = 0; x < miniset.size.width; x += 1) {
        const replacement = miniset.replace[y][x] ?? 0;
        if (replacement === 0) {
          continue;
        }
        this.set(position.x + x, position.y + y, replacement);
        if (protect) {
          this.setProtected(position.x + x, position.y + y, true);
        }
      }
    }
  }

  private fixDirtTiles(): void {
    for (let y = 0; y < DMAXY - 1; y += 1) {
      for (let x = 0; x < DMAXX - 1; x += 1) {
        if (this.get(x, y) === HDirtCorner && this.get(x + 1, y) !== DirtVwall) {
          this.set(x, y, DirtCorner2);
        }
        if (this.get(x, y) === DirtVwall && this.get(x + 1, y) !== DirtVwall) {
          this.set(x, y, DirtVWall2);
        }
        if (this.get(x, y) === DirtVwallEnd && this.get(x + 1, y) !== DirtVwall) {
          this.set(x, y, DirtVWallEnd2);
        }
        if (this.get(x, y) === DirtHwall && this.get(x, y + 1) !== DirtHwall) {
          this.set(x, y, DirtHWall2);
        }
        if (this.get(x, y) === HDirtCorner && this.get(x, y + 1) !== DirtHwall) {
          this.set(x, y, DirtCorner2);
        }
        if (this.get(x, y) === DirtHwallEnd && this.get(x, y + 1) !== DirtHwall) {
          this.set(x, y, DirtHWallEnd2);
        }
      }
    }
  }

  private fixCornerTiles(): void {
    for (let y = 1; y < DMAXY - 1; y += 1) {
      for (let x = 1; x < DMAXX - 1; x += 1) {
        if (!this.isProtected(x, y) && this.get(x, y) === HCorner && this.get(x - 1, y) === Floor && this.get(x, y - 1) === VWall) {
          this.set(x, y, VCorner);
        }
        if (this.get(x, y) === DirtCorner2 && this.get(x + 1, y) === Floor && this.get(x, y + 1) === VWall) {
          this.set(x, y, HArchEnd);
        }
        if (this.get(x, y) === DirtCorner2 && this.get(x, y + 1) === Floor && this.get(x + 1, y) === HWall) {
          this.set(x, y, VArchEnd);
        }
      }
    }
  }

  private substitution(): void {
    for (let y = 0; y < DMAXY; y += 1) {
      for (let x = 0; x < DMAXX; x += 1) {
        if (!this.rng.flipCoin(4)) {
          continue;
        }
        const c = TILE_DECORATIONS[this.get(x, y)] ?? 0;
        if (c === 0 || this.isProtected(x, y)) {
          continue;
        }

        let rv = this.rng.generateRnd(16);
        let replacement = -1;
        while (rv >= 0) {
          replacement += 1;
          if (replacement === TILE_DECORATIONS.length) {
            replacement = 0;
          }
          if (c === TILE_DECORATIONS[replacement]) {
            rv -= 1;
          }
        }

        if (replacement === VWall4 && y > 0) {
          if ((TILE_DECORATIONS[this.get(x, y - 1)] ?? 0) !== VWall2 || this.isProtected(x, y - 1)) {
            replacement = VWall2;
          } else {
            this.set(x, y - 1, VWall5);
          }
        }
        if (replacement === HWall4 && x + 1 < DMAXX) {
          if ((TILE_DECORATIONS[this.get(x + 1, y)] ?? 0) !== HWall2 || this.isProtected(x + 1, y)) {
            replacement = HWall2;
          } else {
            this.set(x + 1, y, HWall5);
          }
        }
        this.set(x, y, replacement);
      }
    }
  }

  private applyShadowsPatterns(): void {
    for (let y = 1; y < DMAXY; y += 1) {
      for (let x = 1; x < DMAXX; x += 1) {
        const slice00 = BASE_TYPES[this.get(x, y)] ?? 0;
        const slice10 = BASE_TYPES[this.get(x - 1, y)] ?? 0;
        const slice01 = BASE_TYPES[this.get(x, y - 1)] ?? 0;
        const slice11 = BASE_TYPES[this.get(x - 1, y - 1)] ?? 0;

        for (const [strig, s1, s2, s3, nv1, nv2, nv3] of SHADOW_PATTERNS) {
          if (strig !== slice00) continue;
          if (s1 !== 0 && s1 !== slice11) continue;
          if (s2 !== 0 && s2 !== slice01) continue;
          if (s3 !== 0 && s3 !== slice10) continue;

          if (nv1 !== 0 && !this.isProtected(x - 1, y - 1)) {
            this.set(x - 1, y - 1, nv1);
          }
          if (nv2 !== 0 && !this.isProtected(x, y - 1)) {
            this.set(x, y - 1, nv2);
          }
          if (nv3 !== 0 && !this.isProtected(x - 1, y)) {
            this.set(x - 1, y, nv3);
          }
        }
      }
    }

    for (let y = 1; y < DMAXY; y += 1) {
      for (let x = 1; x < DMAXX; x += 1) {
        if (this.isProtected(x - 1, y)) {
          continue;
        }

        if (this.get(x - 1, y) === Floor12) {
          let tnv3 = Floor12;
          if (isAnyOf(this.get(x, y), DFence, VFenceEnd, VFence, HWallVFence, HArchVFence, HArchVDoor)) {
            tnv3 = Floor14;
          }
          this.set(x - 1, y, tnv3);
        }
        if (this.get(x - 1, y) === HArchShadow) {
          let tnv3 = HArchShadow;
          if (isAnyOf(this.get(x, y), DFence, VFenceEnd, VFence, HWallVFence, HArchVFence, HArchVDoor)) {
            tnv3 = HArchShadow2;
          }
          this.set(x - 1, y, tnv3);
        }
        if (this.get(x - 1, y) === HWallShadow) {
          let tnv3 = HWallShadow;
          if (isAnyOf(this.get(x, y), DFence, VFenceEnd, VFence, HWallVFence, HArchVFence, HArchVDoor)) {
            tnv3 = HWallShadow2;
          }
          this.set(x - 1, y, tnv3);
        }
      }
    }
  }

  private fillFloor(): void {
    for (let y = 0; y < DMAXY; y += 1) {
      for (let x = 0; x < DMAXX; x += 1) {
        if (this.get(x, y) !== Floor || this.isProtected(x, y)) {
          continue;
        }

        const rv = this.rng.randomIntLessThan(3);
        if (rv === 1) {
          this.set(x, y, 162);
        } else if (rv === 2) {
          this.set(x, y, 163);
        }
      }
    }
  }

  private get(x: number, y: number): number {
    return this.dungeon[y]?.[x] ?? 0;
  }

  private set(x: number, y: number, value: number): void {
    if (y >= 0 && y < DMAXY && x >= 0 && x < DMAXX) {
      this.dungeon[y][x] = value;
    }
  }

  private getMask(x: number, y: number): boolean {
    return this.dungeonMask[y]?.[x] ?? false;
  }

  private setMask(x: number, y: number, value: boolean): void {
    if (y >= 0 && y < DMAXY && x >= 0 && x < DMAXX) {
      this.dungeonMask[y][x] = value;
    }
  }

  private isProtected(x: number, y: number): boolean {
    return this.protectedTiles[y]?.[x] ?? false;
  }

  private setProtected(x: number, y: number, value: boolean): void {
    if (y >= 0 && y < DMAXY && x >= 0 && x < DMAXX) {
      this.protectedTiles[y][x] = value;
    }
  }

  private isChamber(x: number, y: number): boolean {
    return this.chamber[y]?.[x] ?? false;
  }

  private setChamber(x: number, y: number, value: boolean): void {
    if (y >= 0 && y < DMAXY && x >= 0 && x < DMAXX) {
      this.chamber[y][x] = value;
    }
  }
}

function createNumberGrid(value: number): number[][] {
  return Array.from({ length: DMAXY }, () => Array.from({ length: DMAXX }, () => value));
}

function createBooleanGrid(value: boolean): boolean[][] {
  return Array.from({ length: DMAXY }, () => Array.from({ length: DMAXX }, () => value));
}

function rect(x: number, y: number, width: number, height: number): Rect {
  return { position: { x, y }, size: { width, height } };
}

function cloneRect(input: Rect): Rect {
  return rect(input.position.x, input.position.y, input.size.width, input.size.height);
}

function swapPoint(input: Point): Point {
  return { x: input.y, y: input.x };
}

function swapRect(input: Rect): Rect {
  return rect(input.position.y, input.position.x, input.size.height, input.size.width);
}

function isAnyOf(value: number, ...candidates: readonly number[]): boolean {
  return candidates.includes(value);
}

function readUint16LE(bytes: Uint8Array, offset: number): number {
  return bytes[offset] | (bytes[offset + 1] << 8);
}
