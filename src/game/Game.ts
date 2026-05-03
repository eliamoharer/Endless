import { addParticleToClump, currentClumpRadius, radiusForValue, updateClump } from "./clumpPhysics";
import { InputController } from "./input";
import { createFood } from "./spawning";
import type {
  ClumpParticle,
  Food,
  GameState,
  MergeProgress,
  UpgradeKind,
  UpgradeProgress,
  Vec2,
  Viewport,
} from "./types";
import { CanvasRenderer } from "../render/renderer";
import { GameOverlay } from "../ui/overlay";

const basePlayerSpeed = 270;
const enemySpeed = 220;
const enemyWanderSpeed = 86;
const enemyLockRange = 430;
const mergeThreshold = 10;
const projectionSkew = 0.28;
const projectionDepth = 0.54;
const maxIncrementLevel = 7;
/** Same economic ladder as increment: tier‑1 table `30 × 10^exponent`, resolved by `resolveUpgradeCost` to ~30 particles of the current digit per step. */
const incrementCosts = [30, 300, 3000, 30000, 300000, 3000000, 30000000];
/** Eleven spawn tiers over ~30 min; exponents 0→6 match increment’s top order so late spawn isn’t pricier than increment in the same currency. */
const spawnRateCosts = Array.from({ length: 11 }, (_, index) =>
  Math.max(1, Math.round(30 * 10 ** ((6 * index) / 10))),
);
const spawnRateMultipliers = [1, 1.28, 1.66, 2.18, 2.92, 4.05, 5.85, 8.6, 12.6, 18.4, 26];
const spawnCaps = [3, 4, 5, 6, 8, 11, 15, 20, 27, 36, 46];
/** Nine speed tiers on the same ladder (slightly steeper steps than spawn for the same exponent range). */
const speedCosts = Array.from({ length: 9 }, (_, index) =>
  Math.max(1, Math.round(30 * 10 ** ((6 * index) / 8))),
);
const speedMultipliers = [1, 1.14, 1.29, 1.45, 1.62, 1.8, 1.99, 2.18, 2.36];

export class Game {
  private readonly input = new InputController();
  private readonly state: GameState;
  private viewport: Viewport;
  private animationFrame = 0;
  private lastTimestamp = 0;

  constructor(
    private readonly renderer: CanvasRenderer,
    private readonly overlay: GameOverlay,
  ) {
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
      },
      upgradeProgresses: [],
    };

    this.updateUpgradeProgress();
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
      this.performMerge(this.state.mergeCandidateValue);
    }
  }

  requestUpgrade(kind: UpgradeKind): void {
    const upgrade = this.state.upgradeProgresses.find((progress) => progress.kind === kind);

    if (
      !upgrade?.canPurchase ||
      !this.spendCurrency(upgrade.costAmount, upgrade.costValue)
    ) {
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
      this.convertOutdatedFood(this.state.upgrades.incrementLevel + 1);
    } else {
      this.state.upgrades.speedLevel += 1;
    }

    this.updateMergeProgress();
    this.updateUpgradeProgress();
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

    this.updatePlayerMovement(dt);
    this.updateCamera(dt);
    this.cullDistantFood();
    this.updateFoodSpawning(dt);
    this.updateEnemies(dt);
    this.absorbFood();
    this.resolveEnemyCollisions();
    updateClump(this.state.player, dt);
    this.updateShockwaves(dt);
    this.updateMergeProgress();
    this.enforceObsoletePreviousTierInWorld();
    this.updateUpgradeProgress();

    if (this.input.consumeMerge() && this.state.mergeReady) {
      this.performMerge(this.state.mergeCandidateValue);
    }
  }

  private updatePlayerMovement(dt: number): void {
    const input = this.input.snapshot();
    const player = this.state.player;
    const playerSpeed = this.currentPlayerSpeed();
    const screenVelocity = {
      x: input.moveX * playerSpeed,
      y: input.moveY * playerSpeed,
    };
    const worldVelocityY = screenVelocity.y / projectionDepth;
    const worldVelocityX = screenVelocity.x - projectionSkew * worldVelocityY;

    player.velocity.x = worldVelocityX;
    player.velocity.y = worldVelocityY;
    player.position.x += player.velocity.x * dt;
    player.position.y += player.velocity.y * dt;
  }

  private updateCamera(dt: number): void {
    const follow = Math.min(dt * 10, 1);

    this.state.camera.x += (this.state.player.position.x - this.state.camera.x) * follow;
    this.state.camera.y += (this.state.player.position.y - this.state.camera.y) * follow;
  }

  private absorbFood(): void {
    for (let index = this.state.foods.length - 1; index >= 0; index -= 1) {
      const food = this.state.foods[index];
      const distance = distanceToClump(food.position, this.state.player);

      if (distance <= food.radius) {
        const wasGhost = this.state.player.clump.length === 0;

        addParticleToClump(this.state.player, food.position, food.value);
        this.state.player.discoveredMaxValue = Math.max(
          this.state.player.discoveredMaxValue,
          food.value,
        );
        this.state.foods.splice(index, 1);

        if (wasGhost) {
          const offset = {
            x: food.position.x - this.state.player.position.x,
            y: food.position.y - this.state.player.position.y,
          };

          this.state.shockwaves.push({
            age: 0,
            duration: 0.42,
            origin: { ...this.state.player.position },
            maxRadius: 180,
            anchor: "player",
            offset,
          });
        }
      }
    }
  }

  private cullDistantFood(): void {
    const maximumDistance = Math.hypot(this.viewport.width, this.viewport.height) + 900;

    this.state.foods = this.state.foods.filter(
      (food) => distanceBetween(food.position, this.state.camera) < maximumDistance,
    );
  }

  private updateFoodSpawning(dt: number): void {
    const targetFoodCount =
      spawnCaps[Math.min(this.state.upgrades.spawnRateLevel, spawnCaps.length - 1)];

    if (this.state.foods.length >= targetFoodCount) {
      return;
    }

    this.state.spawnTimer -= dt;

    if (this.state.spawnTimer > 0) {
      return;
    }

    const spawnValue = this.currentSpawnValue();
    this.state.foods.push(createFood(this.state.nextFoodId, this.state.camera, this.viewport, spawnValue));
    this.state.nextFoodId += 1;
    this.state.spawnTimer = this.nextSpawnInterval();
  }

  private currentSpawnValue(): number {
    const baseValue = Math.min(this.state.upgrades.incrementLevel + 1, 8);

    for (let value = 1; value < baseValue; value += 1) {
      const count = this.countParticles(value);

      if (count > 0 && count < mergeThreshold) {
        return value;
      }
    }

    return baseValue;
  }

  private nextSpawnInterval(): number {
    const level = this.state.upgrades.spawnRateLevel;
    const valueAcceleration = 1 + (this.state.player.discoveredMaxValue - 1) * 0.1;
    const multiplier =
      spawnRateMultipliers[Math.min(level, spawnRateMultipliers.length - 1)] * valueAcceleration;

    return Math.max(0.5, 12.8 / multiplier);
  }

  private currentPlayerSpeed(): number {
    const totalMass = this.state.player.clump.reduce((mass, particle) => mass + particle.value, 0);
    const massDrag = 1 + totalMass / 62;
    const speedUpgrade =
      speedMultipliers[Math.min(this.state.upgrades.speedLevel, speedMultipliers.length - 1)];
    const lowMassCap = 255 + Math.sqrt(totalMass) * 19 + Math.min(totalMass, 80) * 0.85;
    const rawSpeed = (basePlayerSpeed * speedUpgrade) / massDrag;

    return Math.max(128, Math.min(rawSpeed, lowMassCap));
  }

  private updateEnemies(dt: number): void {
    const playerHasMass = this.state.player.clump.length > 0;
    const expiredIds: number[] = [];

    this.state.enemySpawnTimer -= dt;

    if (this.state.enemySpawnTimer <= 0) {
      this.spawnEnemy();
      // Slightly faster baseline; extra tick when very few threats so exploration stays populated.
      const baseInterval = 4 + Math.random() * 5;
      this.state.enemySpawnTimer =
        this.state.enemies.length < 2 ? Math.min(baseInterval, 2.5) : baseInterval;
    }

    for (const enemy of this.state.enemies) {
      if (!playerHasMass && enemy.mode === "chase") {
        enemy.mode = "wander";
        enemy.wanderDirection = randomDirection();
        enemy.wanderTimer = 1 + Math.random() * 2.5;
      }

      if (enemy.mode === "wander") {
        enemy.wanderTimer -= dt;

        if (enemy.wanderTimer <= 0) {
          enemy.wanderDirection = randomDirection();
          enemy.wanderTimer = 1.4 + Math.random() * 3.2;
        }

        if (playerHasMass && distanceBetween(enemy.position, this.state.player.position) <= enemyLockRange) {
          enemy.mode = "chase";
          enemy.interestDuration = 5 + Math.random() * 10;
          enemy.interestRemaining = enemy.interestDuration;
        }
      } else if (enemy.mode === "chase") {
        enemy.interestRemaining -= dt;

        if (enemy.interestRemaining <= 0) {
          this.convertEnemyToFood(enemy);
          expiredIds.push(enemy.id);
          continue;
        }
      }

      const direction =
        enemy.mode === "chase"
          ? normalize({
              x: this.state.player.position.x - enemy.position.x,
              y: this.state.player.position.y - enemy.position.y,
            })
          : enemy.mode === "wander"
            ? enemy.wanderDirection
            : enemy.leaveDirection;
      const speed = enemy.mode === "wander" ? enemyWanderSpeed : enemySpeed;

      enemy.velocity.x = direction.x * speed;
      enemy.velocity.y = direction.y * speed;
      enemy.position.x += enemy.velocity.x * dt;
      enemy.position.y += enemy.velocity.y * dt;
    }

    if (expiredIds.length > 0) {
      const expired = new Set(expiredIds);
      this.state.enemies = this.state.enemies.filter((enemy) => !expired.has(enemy.id));
    }

    // Cull using player OR camera: the camera lags the player, so "distance to camera only" could
    // delete enemies that are still near the player while moving fast — felt like spawns vanished.
    const maximumDistance = Math.hypot(this.viewport.width, this.viewport.height) + 1100;
    this.state.enemies = this.state.enemies.filter((enemy) => {
      const nearPlayer =
        distanceBetween(enemy.position, this.state.player.position) < maximumDistance;
      const nearCamera = distanceBetween(enemy.position, this.state.camera) < maximumDistance;

      return nearPlayer || nearCamera;
    });
  }

  private spawnEnemy(): void {
    const distance = Math.hypot(this.viewport.width, this.viewport.height) * 0.58 + 280;
    const angle = Math.random() * Math.PI * 2;
    const value = Math.max(1, Math.min(this.state.upgrades.incrementLevel + 1, 8));
    const interestDuration = 5 + Math.random() * 10;
    const origin = this.state.player.position;

    this.state.enemies.push({
      id: this.state.nextEnemyId,
      position: {
        x: origin.x + Math.cos(angle) * distance,
        y: origin.y + Math.sin(angle) * distance,
      },
      velocity: { x: 0, y: 0 },
      value,
      radius: radiusForValue(value) + 8,
      phase: Math.random() * Math.PI * 2,
      mode: "wander",
      interestDuration,
      interestRemaining: interestDuration,
      wanderDirection: randomDirection(),
      wanderTimer: 1.4 + Math.random() * 3.2,
      leaveDirection: { x: 0, y: 1 },
    });
    this.state.nextEnemyId += 1;
  }

  private resolveEnemyCollisions(): void {
    if (this.state.player.clump.length === 0) {
      return;
    }

    for (let index = this.state.enemies.length - 1; index >= 0; index -= 1) {
      const enemy = this.state.enemies[index];

      if (enemy.mode !== "chase") {
        continue;
      }

      const distance = distanceToClump(enemy.position, this.state.player);

      if (distance > enemy.radius) {
        continue;
      }

      const consumed = this.subtractPlayerMass(enemy.value);

      if (consumed >= enemy.value) {
        this.state.enemies.splice(index, 1);
      } else {
        enemy.value -= consumed;
        enemy.radius = radiusForValue(enemy.value) + 8;
        enemy.mode = "leave";
        enemy.leaveDirection = normalize({
          x: enemy.position.x - this.state.player.position.x,
          y: enemy.position.y - this.state.player.position.y,
        });
      }

      this.state.shockwaves.push({
        age: 0,
        duration: 0.32,
        origin: { ...enemy.position },
        maxRadius: 130 + enemy.value * 18,
      });
    }
  }

  private subtractPlayerMass(amount: number): number {
    let remaining = amount;
    let consumed = 0;
    const sorted = [...this.state.player.clump].sort((a, b) => b.value - a.value);
    const emptied = new Set<number>();

    for (const particle of sorted) {
      if (remaining <= 0) {
        break;
      }

      const taken = Math.min(particle.value, remaining);
      particle.value -= taken;
      remaining -= taken;
      consumed += taken;

      if (particle.value <= 0) {
        emptied.add(particle.id);
      } else {
        particle.radius = radiusForValue(particle.value);
      }
    }

    this.state.player.clump = this.state.player.clump.filter((particle) => !emptied.has(particle.id));
    return consumed;
  }

  private updateShockwaves(dt: number): void {
    for (const shockwave of this.state.shockwaves) {
      shockwave.age += dt;

      if (shockwave.anchor === "player" && shockwave.offset) {
        shockwave.origin = {
          x: this.state.player.position.x + shockwave.offset.x,
          y: this.state.player.position.y + shockwave.offset.y,
        };
      }
    }

    this.state.shockwaves = this.state.shockwaves.filter(
      (shockwave) => shockwave.age < shockwave.duration,
    );
  }

  private updateMergeProgress(): void {
    const progresses: MergeProgress[] = [];
    let candidate = 1;

    for (let value = this.state.player.discoveredMaxValue; value >= 1; value -= 1) {
      const count = this.countParticles(value);
      const ready = count >= mergeThreshold;

      progresses.push({
        value,
        count,
        threshold: mergeThreshold,
        ready,
      });

      if (ready && candidate === 1) {
        candidate = value;
      }
    }

    this.state.mergeProgresses = progresses;
    this.state.mergeCandidateValue = candidate;
    this.state.mergeReady = progresses.some((progress) => progress.ready);
  }

  private updateUpgradeProgress(): void {
    const spawnRateLevel = this.state.upgrades.spawnRateLevel;
    const incrementLevel = this.state.upgrades.incrementLevel;
    const speedLevel = this.state.upgrades.speedLevel;
    const spawnRateMaxed = spawnRateLevel >= spawnRateCosts.length;
    const incrementMaxed = incrementLevel >= maxIncrementLevel;
    const speedMaxed = speedLevel >= speedCosts.length;
    const spawnRateCostBase =
      spawnRateCosts[Math.min(spawnRateLevel, spawnRateCosts.length - 1)];
    const incrementCostBase = incrementCosts[Math.min(incrementLevel, incrementCosts.length - 1)];
    const speedCostBase = speedCosts[Math.min(speedLevel, speedCosts.length - 1)];
    const spawnRateCostSpec = this.resolveUpgradeCost(spawnRateCostBase);
    const incrementCostSpec = this.resolveUpgradeCost(incrementCostBase);
    const speedCostSpec = this.resolveUpgradeCost(speedCostBase);
    const spawnRateMultiplier =
      spawnRateMultipliers[Math.min(spawnRateLevel, spawnRateMultipliers.length - 1)];
    const speedMultiplier = speedMultipliers[Math.min(speedLevel, speedMultipliers.length - 1)];
    const spawnValue = Math.min(incrementLevel + 1, 8);
    const upgrades: UpgradeProgress[] = [
      {
        kind: "spawnRate",
        name: "Spawn Rate",
        detail: `${spawnRateMultiplier.toFixed(2)}x more numbers`,
        costAmount: spawnRateCostSpec.amount,
        costValue: spawnRateCostSpec.value,
        progress: spawnRateMaxed
          ? 1
          : Math.min(this.countParticles(spawnRateCostSpec.value) / spawnRateCostSpec.amount, 1),
        canPurchase:
          !spawnRateMaxed && this.countParticles(spawnRateCostSpec.value) >= spawnRateCostSpec.amount,
        isMaxed: spawnRateMaxed,
      },
      {
        kind: "increment",
        name: "Increment",
        detail: incrementMaxed ? "Numbers max at 8" : `Numbers start at ${spawnValue} now`,
        costAmount: incrementCostSpec.amount,
        costValue: incrementCostSpec.value,
        progress: incrementMaxed
          ? 1
          : Math.min(this.countParticles(incrementCostSpec.value) / incrementCostSpec.amount, 1),
        canPurchase:
          !incrementMaxed &&
          this.countParticles(incrementCostSpec.value) >= incrementCostSpec.amount,
        isMaxed: incrementMaxed,
      },
      {
        kind: "speed",
        name: "Speed",
        detail: `${speedMultiplier.toFixed(2)}x movement speed`,
        costAmount: speedCostSpec.amount,
        costValue: speedCostSpec.value,
        progress: speedMaxed
          ? 1
          : Math.min(this.countParticles(speedCostSpec.value) / speedCostSpec.amount, 1),
        canPurchase:
          !speedMaxed && this.countParticles(speedCostSpec.value) >= speedCostSpec.amount,
        isMaxed: speedMaxed,
      },
    ];

    this.state.upgradeProgresses = upgrades;
  }

  /**
   * Table costs are in "tier-1 units". Express them in the current increment currency tier only
   * (never in merged / discovered high digits). Each step up divides by 10, always rounding up.
   */
  private resolveUpgradeCost(tableAmount: number): { amount: number; value: number } {
    const maxTier = Math.min(this.state.upgrades.incrementLevel + 1, 8);
    let amount = tableAmount;

    for (let tier = 1; tier < maxTier; tier += 1) {
      amount = amount < 10 ? 1 : Math.max(1, Math.ceil(amount / 10));
    }

    return { amount, value: maxTier };
  }

  private spendCurrency(amount: number, value: number): boolean {
    if (this.countParticles(value) < amount) {
      return false;
    }

    let remaining = amount;
    const spentIds = new Set<number>();

    for (const particle of this.state.player.clump) {
      if (remaining <= 0) {
        break;
      }

      if (particle.value === value) {
        remaining -= 1;
        spentIds.add(particle.id);
      }
    }

    this.state.player.clump = this.state.player.clump.filter((particle) => !spentIds.has(particle.id));
    return true;
  }

  private convertOutdatedFood(newBaseValue: number): void {
    for (const food of this.state.foods) {
      if (food.value >= newBaseValue) {
        continue;
      }

      food.value = newBaseValue;
      food.radius = 28 + Math.sqrt(newBaseValue) * 3;
      this.state.shockwaves.push({
        age: 0,
        duration: 0.28,
        origin: { ...food.position },
        maxRadius: 120 + newBaseValue * 14,
      });
    }

    this.enforceObsoletePreviousTierInWorld();
  }

  /** When increment is n and the clump has no (n-1), bump all world (n-1) enemies and food to n. */
  private enforceObsoletePreviousTierInWorld(): void {
    const incrementLevel = this.state.upgrades.incrementLevel;
    const n = incrementLevel + 1;

    if (incrementLevel < 1) {
      return;
    }

    const previousValue = n - 1;

    if (this.countParticles(previousValue) > 0) {
      return;
    }

    let changed = false;

    for (const enemy of this.state.enemies) {
      if (enemy.value !== previousValue) {
        continue;
      }

      enemy.value = Math.min(n, 8);
      enemy.radius = radiusForValue(enemy.value) + 8;
      changed = true;
      this.state.shockwaves.push({
        age: 0,
        duration: 0.34,
        origin: { ...enemy.position },
        maxRadius: 140 + enemy.value * 16,
      });
    }

    for (const food of this.state.foods) {
      if (food.value !== previousValue) {
        continue;
      }

      food.value = Math.min(n, 8);
      food.radius = 28 + Math.sqrt(food.value) * 3;
      changed = true;
      this.state.shockwaves.push({
        age: 0,
        duration: 0.3,
        origin: { ...food.position },
        maxRadius: 120 + food.value * 14,
      });
    }

    if (changed) {
      this.updateMergeProgress();
    }
  }

  private convertEnemyToFood(enemy: { position: Vec2; value: number; phase: number }): void {
    this.state.shockwaves.push({
      age: 0,
      duration: 0.38,
      origin: { ...enemy.position },
      maxRadius: 150 + enemy.value * 20,
    });
    this.state.foods.push(this.createFoodAt(enemy.position, enemy.value, enemy.phase));
  }

  private createFoodAt(position: Vec2, value: number, phase: number): Food {
    const food: Food = {
      id: this.state.nextFoodId,
      position: { ...position },
      value,
      radius: 28 + Math.sqrt(value) * 3,
      phase,
    };
    this.state.nextFoodId += 1;

    return food;
  }

  private countParticles(value: number): number {
    return this.state.player.clump.filter((particle) => particle.value === value).length;
  }

  /**
   * If merging removed the last `mergedValue` from the clump while the spawn floor is higher,
   * any world food still showing that digit is obsolete — bump it (with shockwave) to match play.
   */
  private bumpFoodWhenMergedDigitObsoleted(mergedValue: number): void {
    const spawnFloor = Math.min(this.state.upgrades.incrementLevel + 1, 8);

    if (spawnFloor <= mergedValue) {
      return;
    }

    if (this.countParticles(mergedValue) > 0) {
      return;
    }

    const target = Math.min(Math.max(mergedValue + 1, spawnFloor), 8);

    for (const food of this.state.foods) {
      if (food.value !== mergedValue) {
        continue;
      }

      food.value = target;
      food.radius = 28 + Math.sqrt(target) * 3;
      this.state.shockwaves.push({
        age: 0,
        duration: 0.28,
        origin: { ...food.position },
        maxRadius: 120 + target * 14,
      });
    }
  }

  private performMerge(value: number): void {
    const player = this.state.player;
    const mergeable = player.clump.filter((particle) => particle.value === value).slice(0, mergeThreshold);

    if (mergeable.length < mergeThreshold) {
      return;
    }

    const mergeIds = new Set(mergeable.map((particle) => particle.id));
    const origin = averageLocalPosition(mergeable);
    const nextValue = value + 1;

    player.clump = player.clump.filter((particle) => !mergeIds.has(particle.id));
    player.clump.push({
      id: player.nextParticleId,
      localPosition: origin,
      velocity: averageVelocity(mergeable),
      value: nextValue,
      radius: radiusForValue(nextValue),
      angleSeed: Math.random() * Math.PI * 2,
    });
    player.nextParticleId += 1;
    player.discoveredMaxValue = Math.max(player.discoveredMaxValue, nextValue);
    this.updateMergeProgress();
    this.bumpFoodWhenMergedDigitObsoleted(value);
    this.state.shockwaves.push({
      age: 0,
      duration: 0.48,
      origin: {
        x: player.position.x + origin.x,
        y: player.position.y + origin.y,
      },
      maxRadius: 220 + nextValue * 30,
    });
  }
}

function distanceBetween(a: Vec2, b: Vec2): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function normalize(vector: Vec2): Vec2 {
  const length = Math.hypot(vector.x, vector.y);

  if (length === 0) {
    return { x: 1, y: 0 };
  }

  return {
    x: vector.x / length,
    y: vector.y / length,
  };
}

function randomDirection(): Vec2 {
  const angle = Math.random() * Math.PI * 2;

  return {
    x: Math.cos(angle),
    y: Math.sin(angle),
  };
}

function distanceToClump(point: Vec2, player: GameState["player"]): number {
  if (player.clump.length === 0) {
    return distanceBetween(point, player.position) - 18;
  }

  let closest = currentClumpRadius(player);

  for (const particle of player.clump) {
    const worldPosition = {
      x: player.position.x + particle.localPosition.x,
      y: player.position.y + particle.localPosition.y,
    };

    closest = Math.min(closest, distanceBetween(point, worldPosition) - particle.radius);
  }

  return closest;
}

function averageLocalPosition(particles: ClumpParticle[]): Vec2 {
  return particles.reduce(
    (position, particle) => {
      position.x += particle.localPosition.x / particles.length;
      position.y += particle.localPosition.y / particles.length;
      return position;
    },
    { x: 0, y: 0 },
  );
}

function averageVelocity(particles: ClumpParticle[]): Vec2 {
  return particles.reduce(
    (velocity, particle) => {
      velocity.x += particle.velocity.x / particles.length;
      velocity.y += particle.velocity.y / particles.length;
      return velocity;
    },
    { x: 0, y: 0 },
  );
}
