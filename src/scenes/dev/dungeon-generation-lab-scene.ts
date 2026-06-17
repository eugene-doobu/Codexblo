import Phaser from 'phaser';
import {
  createGenerationRequest,
  generateDungeon,
  type DungeonGenerationRequest,
  type DungeonGenerationResult,
  type DungeonType,
  type SeedMode,
} from '../../domain/world/dungeon-generator';
import { createDungeonComparisonSnapshot, type DungeonComparisonSnapshot } from '../../domain/world/dungeon-comparison';
import { DungeonDebugRenderer, type DebugOverlayOptions, type DungeonRenderSnapshot } from '../../presentation/dev/dungeon-debug-overlay';
import { ISO_TILE_FOOTPRINT, isoGridBounds, toIso, type IsoBounds } from '../../presentation/dev/isometric-projection';
import { requestFromLocation } from '../../runtime/route';

const CAMERA_VIEW_PADDING = 96;
const MIN_CAMERA_ZOOM = 0.22;
const MAX_CAMERA_ZOOM = 1.25;

export class DungeonGenerationLabScene extends Phaser.Scene {
  private dungeonRenderer?: DungeonDebugRenderer;
  private controls?: LabControls;
  private isDragging = false;
  private lastPointer?: Phaser.Math.Vector2;

  constructor() {
    super('DungeonGenerationLabScene');
  }

  create(): void {
    this.cameras.main.setBackgroundColor('#07080b');
    this.dungeonRenderer = new DungeonDebugRenderer(this);
    this.controls = createControls((request, options) => this.generate(request, options));
    this.registerCameraControls();
    this.generate(requestFromLocation(window.location), this.controls.options());
  }

  private generate(request: DungeonGenerationRequest, options: DebugOverlayOptions): void {
    const result = generateDungeon(request);
    const renderSnapshot = this.dungeonRenderer?.render(result, options);
    this.controls?.update(result);
    const cameraSnapshot = this.fitCamera(result);
    if (renderSnapshot) {
      publishLabDebugSnapshot(result, renderSnapshot, cameraSnapshot);
    }
  }

  private fitCamera(result: DungeonGenerationResult): DungeonCameraSnapshot {
    const camera = this.cameras.main;
    const gridSize = { width: result.level.width, height: result.level.height };
    const contentBounds = isoGridBounds(gridSize, CAMERA_VIEW_PADDING);
    const zoom = cameraFitZoom(camera.width, camera.height, contentBounds);
    const cameraBounds = expandBoundsForViewport(contentBounds, camera.width / zoom, camera.height / zoom);
    const scrollX = contentBounds.centerX - camera.width / (2 * zoom);
    const scrollY = contentBounds.centerY - camera.height / (2 * zoom);

    camera.setZoom(zoom);
    camera.setBounds(cameraBounds.left, cameraBounds.top, cameraBounds.width, cameraBounds.height);
    camera.setScroll(scrollX, scrollY);

    return {
      contentBounds,
      bounds: cameraBounds,
      scrollX: camera.scrollX,
      scrollY: camera.scrollY,
      zoom: camera.zoom,
      viewportWidth: camera.width,
      viewportHeight: camera.height,
    };
  }

  private registerCameraControls(): void {
    this.input.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
      this.isDragging = true;
      this.lastPointer = new Phaser.Math.Vector2(pointer.x, pointer.y);
    });
    this.input.on('pointerup', () => {
      this.isDragging = false;
      this.lastPointer = undefined;
    });
    this.input.on('pointermove', (pointer: Phaser.Input.Pointer) => {
      if (!this.isDragging || !this.lastPointer) {
        return;
      }
      const camera = this.cameras.main;
      camera.scrollX -= (pointer.x - this.lastPointer.x) / camera.zoom;
      camera.scrollY -= (pointer.y - this.lastPointer.y) / camera.zoom;
      this.lastPointer.set(pointer.x, pointer.y);
    });
    this.input.on('wheel', (_pointer: Phaser.Input.Pointer, _objects: Phaser.GameObjects.GameObject[], _dx: number, dy: number) => {
      const camera = this.cameras.main;
      camera.setZoom(Phaser.Math.Clamp(camera.zoom + (dy > 0 ? -0.08 : 0.08), MIN_CAMERA_ZOOM, 2.2));
    });
    this.input.keyboard?.on('keydown-R', () => this.controls?.randomize());
    this.input.keyboard?.on('keydown-ENTER', () => this.controls?.submit());
    this.input.keyboard?.on('keydown-C', () => this.controls?.copyFixture());
    this.input.keyboard?.on('keydown-G', () => this.controls?.toggle('showGrid'));
    this.input.keyboard?.on('keydown-V', () => this.controls?.toggle('showConnectivity'));
  }
}

interface DungeonCameraSnapshot {
  contentBounds: IsoBounds;
  bounds: IsoBounds;
  scrollX: number;
  scrollY: number;
  zoom: number;
  viewportWidth: number;
  viewportHeight: number;
}

interface DungeonLabDebugSnapshot {
  checksum: string;
  seed: number;
  level: {
    width: number;
    height: number;
    expectedTileCount: number;
  };
  validationOk: boolean;
  comparison: DungeonComparisonSnapshot;
  render: DungeonRenderSnapshot;
  camera: DungeonCameraSnapshot;
  floorPlane: {
    eastStep: { x: number; y: number };
    southStep: { x: number; y: number };
    footprint: typeof ISO_TILE_FOOTPRINT;
  };
}

declare global {
  interface Window {
    __DUNGEON_LAB_DEBUG__?: DungeonLabDebugSnapshot;
  }
}

function cameraFitZoom(viewportWidth: number, viewportHeight: number, bounds: IsoBounds): number {
  const availableWidth = Math.max(1, viewportWidth - CAMERA_VIEW_PADDING);
  const availableHeight = Math.max(1, viewportHeight - CAMERA_VIEW_PADDING);
  return Phaser.Math.Clamp(
    Math.min(availableWidth / bounds.width, availableHeight / bounds.height),
    MIN_CAMERA_ZOOM,
    MAX_CAMERA_ZOOM,
  );
}

function expandBoundsForViewport(bounds: IsoBounds, viewportWorldWidth: number, viewportWorldHeight: number): IsoBounds {
  const expandX = Math.max(0, viewportWorldWidth - bounds.width) / 2;
  const expandY = Math.max(0, viewportWorldHeight - bounds.height) / 2;
  const left = bounds.left - expandX;
  const top = bounds.top - expandY;
  const right = bounds.right + expandX;
  const bottom = bounds.bottom + expandY;

  return {
    left,
    top,
    right,
    bottom,
    width: right - left,
    height: bottom - top,
    centerX: bounds.centerX,
    centerY: bounds.centerY,
  };
}

function publishLabDebugSnapshot(
  result: DungeonGenerationResult,
  render: DungeonRenderSnapshot,
  camera: DungeonCameraSnapshot,
): void {
  const gridSize = { width: result.level.width, height: result.level.height };
  const origin = toIso({ x: 0, y: 0 }, gridSize);
  const east = toIso({ x: 1, y: 0 }, gridSize);
  const south = toIso({ x: 0, y: 1 }, gridSize);

  window.__DUNGEON_LAB_DEBUG__ = {
    checksum: result.level.checksum,
    seed: result.seed,
    level: {
      width: result.level.width,
      height: result.level.height,
      expectedTileCount: result.level.width * result.level.height,
    },
    validationOk: result.validation.ok,
    comparison: createDungeonComparisonSnapshot(result),
    render,
    camera,
    floorPlane: {
      eastStep: { x: east.x - origin.x, y: east.y - origin.y },
      southStep: { x: south.x - origin.x, y: south.y - origin.y },
      footprint: ISO_TILE_FOOTPRINT,
    },
  };
}

interface LabControls {
  options(): DebugOverlayOptions;
  update(result: DungeonGenerationResult): void;
  randomize(): void;
  submit(): void;
  copyFixture(): void;
  toggle(option: keyof DebugOverlayOptions): void;
}

interface ControlFields {
  dungeonType: HTMLSelectElement;
  seedMode: HTMLSelectElement;
  levelNumber: HTMLInputElement;
  seedText: HTMLInputElement;
  showGrid: HTMLInputElement;
  showCollision: HTMLInputElement;
  showConnectivity: HTMLInputElement;
  showZones: HTMLInputElement;
  status: HTMLPreElement;
}

function createControls(onGenerate: (request: DungeonGenerationRequest, options: DebugOverlayOptions) => void): LabControls {
  const host = document.querySelector<HTMLElement>('#lab-ui');
  if (!host) {
    throw new Error('Missing #lab-ui host.');
  }

  host.innerHTML = `
    <section class="lab-panel">
      <h1>Dungeon Generation Lab</h1>
      <p>Generate a dungeon from a random or manual seed. This scene renders PCG, resources, collision, zones, and validation before player gameplay exists.</p>
      <div class="lab-control">
        <label for="dungeon-type">Dungeon type</label>
        <select id="dungeon-type">
          <option value="Cathedral">Cathedral</option>
          <option value="Catacombs">Catacombs</option>
          <option value="Caves">Caves</option>
          <option value="Hell">Hell</option>
        </select>
      </div>
      <div class="lab-row">
        <div class="lab-control">
          <label for="seed-mode">Seed mode</label>
          <select id="seed-mode">
            <option value="manual">Manual</option>
            <option value="random">Random</option>
            <option value="fixture">Fixture</option>
          </select>
        </div>
        <div class="lab-control">
          <label for="level-number">Level</label>
          <input id="level-number" type="number" min="1" max="16" value="1" />
        </div>
      </div>
      <div class="lab-control">
        <label for="seed-text">Seed</label>
        <input id="seed-text" value="cathedral-lab-default" />
      </div>
      <label class="lab-check"><input id="show-grid" type="checkbox" checked /> Grid</label>
      <label class="lab-check"><input id="show-collision" type="checkbox" checked /> Collision</label>
      <label class="lab-check"><input id="show-connectivity" type="checkbox" checked /> Connectivity</label>
      <label class="lab-check"><input id="show-zones" type="checkbox" checked /> Zones</label>
      <div class="lab-row">
        <button id="generate-button" type="button">Generate</button>
        <button id="randomize-button" type="button">Randomize</button>
      </div>
      <div class="lab-row">
        <button id="copy-seed-button" type="button">Copy seed</button>
        <button id="copy-fixture-button" type="button">Copy fixture</button>
      </div>
      <pre id="lab-status" class="lab-status">Waiting for generation...</pre>
    </section>
  `;

  const fields: ControlFields = {
    dungeonType: required<HTMLSelectElement>('#dungeon-type'),
    seedMode: required<HTMLSelectElement>('#seed-mode'),
    levelNumber: required<HTMLInputElement>('#level-number'),
    seedText: required<HTMLInputElement>('#seed-text'),
    showGrid: required<HTMLInputElement>('#show-grid'),
    showCollision: required<HTMLInputElement>('#show-collision'),
    showConnectivity: required<HTMLInputElement>('#show-connectivity'),
    showZones: required<HTMLInputElement>('#show-zones'),
    status: required<HTMLPreElement>('#lab-status'),
  };

  const submit = () => onGenerate(buildRequest(fields), buildOptions(fields));
  required<HTMLButtonElement>('#generate-button').addEventListener('click', submit);
  required<HTMLButtonElement>('#randomize-button').addEventListener('click', () => randomize());
  required<HTMLButtonElement>('#copy-seed-button').addEventListener('click', () => void copyText(fields.seedText.value));
  required<HTMLButtonElement>('#copy-fixture-button').addEventListener('click', () => copyFixture());
  for (const checkbox of [fields.showGrid, fields.showCollision, fields.showConnectivity, fields.showZones]) {
    checkbox.addEventListener('change', submit);
  }

  let latestResult: DungeonGenerationResult | undefined;

  function randomize(): void {
    fields.seedMode.value = 'random';
    fields.seedText.value = String(Date.now());
    submit();
  }

  function copyFixture(): void {
    if (!latestResult) {
      return;
    }
    const payload = {
      request: latestResult.request,
      seed: latestResult.seed,
      checksum: latestResult.level.checksum,
      validation: latestResult.validation,
      comparison: createDungeonComparisonSnapshot(latestResult),
    };
    void copyText(JSON.stringify(payload, null, 2));
  }

  return {
    options: () => buildOptions(fields),
    update(result) {
      latestResult = result;
      fields.dungeonType.value = result.request.dungeonType;
      fields.seedMode.value = result.request.seedMode;
      fields.seedText.value = result.request.seedText;
      fields.levelNumber.value = String(result.request.levelNumber);
      fields.status.textContent = statusText(result);
      fields.status.classList.toggle('pass', result.validation.ok);
      fields.status.classList.toggle('fail', !result.validation.ok);
    },
    randomize,
    submit,
    copyFixture,
    toggle(option) {
      const map = {
        showGrid: fields.showGrid,
        showCollision: fields.showCollision,
        showConnectivity: fields.showConnectivity,
        showZones: fields.showZones,
      } satisfies Record<keyof DebugOverlayOptions, HTMLInputElement>;
      map[option].checked = !map[option].checked;
      submit();
    },
  };
}

function buildRequest(fields: ControlFields): DungeonGenerationRequest {
  return createGenerationRequest({
    dungeonType: fields.dungeonType.value as DungeonType,
    levelNumber: Number(fields.levelNumber.value) || 1,
    seedMode: fields.seedMode.value as SeedMode,
    seedText: fields.seedText.value,
  });
}

function buildOptions(fields: ControlFields): DebugOverlayOptions {
  return {
    showGrid: fields.showGrid.checked,
    showCollision: fields.showCollision.checked,
    showConnectivity: fields.showConnectivity.checked,
    showZones: fields.showZones.checked,
  };
}

function statusText(result: DungeonGenerationResult): string {
  const issues = result.validation.issues.length === 0
    ? 'No validation issues.'
    : result.validation.issues.map((issue) => `${issue.severity.toUpperCase()} ${issue.rule}: ${issue.message}`).join('\n');
  const state = result.validation.ok ? 'PASS' : 'FAIL';
  const metrics = [
    result.validation.metrics.maskTileCount === undefined
      ? undefined
      : `mask=${result.validation.metrics.maskTileCount}/${result.validation.metrics.areaThreshold}`,
    result.validation.metrics.minisetCount === undefined
      ? undefined
      : `minisets=${result.validation.metrics.minisetCount}`,
  ].filter(Boolean);
  const extraMetrics = metrics.length === 0 ? '' : `\n${metrics.join(' ')}`;
  return `${state}\nseed=${result.seed}\nchecksum=${result.level.checksum}\nrooms=${result.validation.metrics.roomCount} doors=${result.validation.metrics.doorCount}\npassable=${result.validation.metrics.passableTileCount} reachable=${result.validation.metrics.reachableTileCount}${extraMetrics}\n\n${issues}`;
}

function required<T extends Element>(selector: string): T {
  const element = document.querySelector<T>(selector);
  if (!element) {
    throw new Error(`Missing control: ${selector}`);
  }
  return element;
}

async function copyText(value: string): Promise<void> {
  if (navigator.clipboard) {
    await navigator.clipboard.writeText(value);
    return;
  }
  const area = document.createElement('textarea');
  area.value = value;
  document.body.append(area);
  area.select();
  document.execCommand('copy');
  area.remove();
}
