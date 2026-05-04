import { radiusForValue } from "../player/clumpPhysics";
import {
  MAX_INCREMENT_SPAWN,
} from "../constants/balance";
import { countClumpParticles } from "../player/clumpInventory";
import type { GameState } from "../types";

/** Food below increment floor with no matching clump tier bumps to floor. */
export function bumpOrphanedFoodToIncrementFloor(state: GameState): void {
  const baseValue = Math.min(state.upgrades.incrementLevel + 1, MAX_INCREMENT_SPAWN);
  const clump = state.player.clump;

  for (const food of state.foods) {
    if (food.value >= baseValue) {
      continue;
    }

    if (countClumpParticles(clump, food.value) > 0) {
      continue;
    }

    food.value = baseValue;
    food.radius = 28 + Math.sqrt(food.value) * 3;
    state.shockwaves.push({
      age: 0,
      duration: 0.3,
      origin: { ...food.position },
      maxRadius: 120 + food.value * 14,
    });
  }
}

export function stripStragglerOnesBelowSpawnFloor(state: GameState): void {
  if (state.upgrades.incrementLevel + 1 <= 1) {
    return;
  }

  state.player.clump = state.player.clump.filter((particle) => particle.value !== 1);
}

export function enforceObsoletePreviousTierInWorld(state: GameState): void {
  const incrementLevel = state.upgrades.incrementLevel;
  const n = incrementLevel + 1;

  if (incrementLevel < 1) {
    return;
  }

  const previousValue = n - 1;

  if (countClumpParticles(state.player.clump, previousValue) > 0) {
    return;
  }

  for (const enemy of state.enemies) {
    if (enemy.value !== previousValue) {
      continue;
    }

    enemy.value = Math.min(n, MAX_INCREMENT_SPAWN);
    enemy.radius = radiusForValue(enemy.value) + 8;
    state.shockwaves.push({
      age: 0,
      duration: 0.34,
      origin: { ...enemy.position },
      maxRadius: 140 + enemy.value * 16,
      anchor: "enemy",
      enemyId: enemy.id,
    });
  }

  for (const food of state.foods) {
    if (food.value !== previousValue) {
      continue;
    }

    food.value = Math.min(n, MAX_INCREMENT_SPAWN);
    food.radius = 28 + Math.sqrt(food.value) * 3;
    state.shockwaves.push({
      age: 0,
      duration: 0.3,
      origin: { ...food.position },
      maxRadius: 120 + food.value * 14,
    });
  }
}

export function convertOutdatedFood(state: GameState, newBaseValue: number): void {
  for (const food of state.foods) {
    if (food.value >= newBaseValue) {
      continue;
    }

    food.value = newBaseValue;
    food.radius = 28 + Math.sqrt(newBaseValue) * 3;
    state.shockwaves.push({
      age: 0,
      duration: 0.28,
      origin: { ...food.position },
      maxRadius: 120 + newBaseValue * 14,
    });
  }

  enforceObsoletePreviousTierInWorld(state);
}

export function bumpFoodWhenMergedDigitObsoleted(state: GameState, mergedValue: number): void {
  const spawnFloor = Math.min(state.upgrades.incrementLevel + 1, MAX_INCREMENT_SPAWN);

  if (spawnFloor <= mergedValue) {
    return;
  }

  if (countClumpParticles(state.player.clump, mergedValue) > 0) {
    return;
  }

  const target = Math.min(Math.max(mergedValue + 1, spawnFloor), MAX_INCREMENT_SPAWN);

  for (const food of state.foods) {
    if (food.value !== mergedValue) {
      continue;
    }

    food.value = target;
    food.radius = 28 + Math.sqrt(target) * 3;
    state.shockwaves.push({
      age: 0,
      duration: 0.28,
      origin: { ...food.position },
      maxRadius: 120 + target * 14,
    });
  }
}
