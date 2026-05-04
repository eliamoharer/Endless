import { addParticleToClump } from "../player/clumpPhysics";
import {
  MAX_INCREMENT_SPAWN,
  mergeThreshold,
  spawnCaps,
  spawnRateMultipliers,
} from "../constants/balance";
import { distanceToClump } from "../player/clumpCollision";
import type { Food, GameState, Vec2, Viewport } from "../types";
import { distanceBetween } from "../core/vecMath";
import { createFood } from "../spawning";

export function absorbFood(state: GameState): void {
  const player = state.player;

  for (let index = state.foods.length - 1; index >= 0; index -= 1) {
    const food = state.foods[index];
    const distance = distanceToClump(food.position, player);

    if (distance <= food.radius) {
      const wasGhost = player.clump.length === 0;
      const spawnWorld = wasGhost ? player.position : food.position;

      addParticleToClump(player, spawnWorld, food.value);
      player.discoveredMaxValue = Math.max(player.discoveredMaxValue, food.value);
      state.foods.splice(index, 1);

      if (wasGhost) {
        state.shockwaves.push({
          age: 0,
          duration: 0.42,
          origin: { ...player.position },
          maxRadius: 180,
          anchor: "player",
        });
      }
    }
  }
}

export function cullDistantFood(state: GameState, viewport: Viewport): void {
  const maximumDistance = Math.hypot(viewport.width, viewport.height) + 900;

  state.foods = state.foods.filter(
    (food) => distanceBetween(food.position, state.camera) < maximumDistance,
  );
}

export function currentSpawnValue(state: GameState): number {
  const baseValue = Math.min(state.upgrades.incrementLevel + 1, MAX_INCREMENT_SPAWN);
  const clump = state.player.clump;

  for (let value = 1; value < baseValue; value += 1) {
    const count = clump.filter((particle) => particle.value === value).length;

    if (count > 0 && count < mergeThreshold) {
      return value;
    }
  }

  return baseValue;
}

export function nextSpawnInterval(state: GameState): number {
  const level = state.upgrades.spawnRateLevel;
  const valueAcceleration = 1 + (state.player.discoveredMaxValue - 1) * 0.1;
  const multiplier =
    spawnRateMultipliers[Math.min(level, spawnRateMultipliers.length - 1)] * valueAcceleration;

  return Math.max(0.5, 12.8 / multiplier);
}

export function updateFoodSpawning(state: GameState, viewport: Viewport, dt: number): void {
  const targetFoodCount = spawnCaps[Math.min(state.upgrades.spawnRateLevel, spawnCaps.length - 1)];

  if (state.foods.length >= targetFoodCount) {
    return;
  }

  state.spawnTimer -= dt;

  if (state.spawnTimer > 0) {
    return;
  }

  const spawnValue = currentSpawnValue(state);
  state.foods.push(createFood(state.nextFoodId, state.camera, viewport, spawnValue));
  state.nextFoodId += 1;
  state.spawnTimer = nextSpawnInterval(state);
}

export function createFoodAt(state: GameState, position: Vec2, value: number, phase: number): Food {
  const food: Food = {
    id: state.nextFoodId,
    position: { ...position },
    value,
    radius: 28 + Math.sqrt(value) * 3,
    phase,
  };
  state.nextFoodId += 1;

  return food;
}
