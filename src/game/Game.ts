import { updateClump } from "./player/clumpPhysics";
import { mergeThreshold } from "./constants/balance";
import { spendCurrency, updateUpgradeProgress, maxIncrementLevel } from "./economy/upgrades";
import { updateShockwaves } from "./fx/shockwaves";
import { InputController } from "./input";
import { performMerge, updateMergeProgress } from "./merge/mergeState";
import { updateCamera, updatePlayerMovement } from "./player/playerMotion";
import type { GameState, UpgradeKind, Viewport } from "./types";
import { absorbFood, cullDistantFood, updateFoodSpawning } from "./world/foodCycle";
import { resolveEnemyCollisions, updateEnemies } from "./world/enemyCycle";
import {
  bumpOrphanedFoodToIncrementFloor,
  convertOutdatedFood,
  enforceObsoletePreviousTierInWorld,
} from "./world/worldTierSync";
import { CanvasRenderer } from "../render/renderer";
import { GameOverlay } from "../ui/overlay";

/**
 * Top-level game loop and wiring. Domain logic lives in `constants/`, `core/`, `player/`, `world/`,
 * `economy/`, `merge/`, `combat/`, and `fx/` so new modes/maps can plug in without growing this file.
 */
export class Game {
  private readonly input: InputController;
  private readonly state: GameState;
  private viewport: Viewport;
  private animationFrame = 0;
  private lastTimestamp = 0;

  constructor(
    private readonly renderer: CanvasRenderer,
    private readonly overlay: GameOverlay,
    pointerRoot: HTMLElement,
  ) {
    this.input = new InputController(pointerRoot);
    this.viewport = this.renderer.resize();
    this.state = {
      time: 0,
      camera: { x: 0, y: 0 },
      player: {
        position: { x: 0, y: 0 },
        velocity: { x: 0, y: 0 },
        clump: [],
        nextParticleId: 1,
        discoveredMaxValue: 1,
      },
      foods: [],
      nextFoodId: 1,
      spawnTimer: 0,
      enemies: [],
      nextEnemyId: 1,
      enemySpawnTimer: 4,
      shockwaves: [],
      mergeProgresses: [{ value: 1, count: 0, threshold: mergeThreshold, ready: false }],
      mergeCandidateValue: 1,
      mergeReady: false,
      upgrades: {
        spawnRateLevel: 0,
        incrementLevel: 0,
        speedLevel: 0,
        expandLevel: 0,
      },
      upgradeProgresses: [],
    };

    updateUpgradeProgress(this.state);
    window.addEventListener("resize", this.handleResize);
  }

  start(): void {
    this.lastTimestamp = performance.now();
    this.animationFrame = window.requestAnimationFrame(this.tick);
  }

  destroy(): void {
    window.cancelAnimationFrame(this.animationFrame);
    window.removeEventListener("resize", this.handleResize);
    this.input.destroy();
  }

  requestMerge(): void {
    if (this.state.mergeReady) {
      performMerge(this.state, this.state.mergeCandidateValue);
    }
  }

  requestUpgrade(kind: UpgradeKind): void {
    const upgrade = this.state.upgradeProgresses.find((progress) => progress.kind === kind);

    if (!upgrade?.canPurchase || !spendCurrency(this.state, upgrade.costAmount, upgrade.costValue)) {
      return;
    }

    if (upgrade.isMaxed) {
      return;
    }

    if (kind === "spawnRate") {
      this.state.upgrades.spawnRateLevel += 1;
    } else if (kind === "increment") {
      if (this.state.upgrades.incrementLevel >= maxIncrementLevel) {
        return;
      }

      this.state.upgrades.incrementLevel += 1;
      convertOutdatedFood(this.state, this.state.upgrades.incrementLevel + 1);
    } else if (kind === "speed") {
      this.state.upgrades.speedLevel += 1;
    } else if (kind === "expand") {
      this.state.upgrades.expandLevel += 1;
    }

    updateMergeProgress(this.state);
    updateUpgradeProgress(this.state);
  }

  private readonly handleResize = (): void => {
    this.viewport = this.renderer.resize();
  };

  private readonly tick = (timestamp: number): void => {
    const dt = Math.min((timestamp - this.lastTimestamp) / 1000, 0.033);
    this.lastTimestamp = timestamp;

    this.update(dt);
    this.renderer.render(this.state, this.viewport);
    this.overlay.update(this.state);

    this.animationFrame = window.requestAnimationFrame(this.tick);
  };

  private update(dt: number): void {
    this.state.time += dt;

    updatePlayerMovement(this.state, this.input.snapshot(), dt);
    updateCamera(this.state, dt);
    cullDistantFood(this.state, this.viewport);
    updateFoodSpawning(this.state, this.viewport, dt);
    updateEnemies(this.state, this.viewport, dt);
    absorbFood(this.state);
    resolveEnemyCollisions(this.state);
    updateClump(this.state.player, dt);
    updateShockwaves(this.state, dt);
    updateMergeProgress(this.state);
    enforceObsoletePreviousTierInWorld(this.state);
    bumpOrphanedFoodToIncrementFloor(this.state);
    updateUpgradeProgress(this.state);

    if (this.input.consumeMerge() && this.state.mergeReady) {
      performMerge(this.state, this.state.mergeCandidateValue);
    }
  }
}
