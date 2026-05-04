import { radiusForValue } from "../player/clumpPhysics";
import {
  enemyLockRange,
  enemySpeed,
  enemyWanderSpeed,
  MAX_INCREMENT_SPAWN,
} from "../constants/balance";
import { distanceToClump } from "../player/clumpCollision";
import { subtractPlayerMass } from "../combat/subtractMass";
import type { GameState, Vec2, Viewport } from "../types";
import { distanceBetween, normalize, randomDirection } from "../core/vecMath";
import {
  bumpOrphanedFoodToIncrementFloor,
  enforceObsoletePreviousTierInWorld,
  stripStragglerOnesBelowSpawnFloor,
} from "./worldTierSync";
import { createFoodAt } from "./foodCycle";

export function updateEnemies(state: GameState, viewport: Viewport, dt: number): void {
  const playerHasMass = state.player.clump.length > 0;
  const expiredIds: number[] = [];

  state.enemySpawnTimer -= dt;

  if (state.enemySpawnTimer <= 0) {
    spawnEnemy(state, viewport);
    const baseInterval = 4 + Math.random() * 5;
    state.enemySpawnTimer =
      state.enemies.length < 2 ? Math.min(baseInterval, 2.5) : baseInterval;
  }

  for (const enemy of state.enemies) {
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

      if (
        playerHasMass &&
        distanceBetween(enemy.position, state.player.position) <= enemyLockRange
      ) {
        enemy.mode = "chase";
        enemy.interestDuration = 5 + Math.random() * 10;
        enemy.interestRemaining = enemy.interestDuration;
      }
    } else if (enemy.mode === "chase") {
      enemy.interestRemaining -= dt;

      if (enemy.interestRemaining <= 0) {
        convertEnemyToFood(state, enemy);
        expiredIds.push(enemy.id);
        continue;
      }
    }

    const direction =
      enemy.mode === "chase"
        ? normalize({
            x: state.player.position.x - enemy.position.x,
            y: state.player.position.y - enemy.position.y,
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
    state.enemies = state.enemies.filter((enemy) => !expired.has(enemy.id));
  }

  const maximumDistance = Math.hypot(viewport.width, viewport.height) + 1100;
  state.enemies = state.enemies.filter((enemy) => {
    const nearPlayer =
      distanceBetween(enemy.position, state.player.position) < maximumDistance;
    const nearCamera = distanceBetween(enemy.position, state.camera) < maximumDistance;

    return nearPlayer || nearCamera;
  });
}

export function spawnEnemy(state: GameState, viewport: Viewport): void {
  const distance = Math.hypot(viewport.width, viewport.height) * 0.58 + 280;
  const angle = Math.random() * Math.PI * 2;
  const value = Math.max(1, Math.min(state.upgrades.incrementLevel + 1, MAX_INCREMENT_SPAWN));
  const interestDuration = 5 + Math.random() * 10;
  const origin = state.player.position;

  state.enemies.push({
    id: state.nextEnemyId,
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
  state.nextEnemyId += 1;
}

export function resolveEnemyCollisions(state: GameState): void {
  if (state.player.clump.length === 0) {
    return;
  }

  for (let index = state.enemies.length - 1; index >= 0; index -= 1) {
    const enemy = state.enemies[index];

    if (enemy.mode !== "chase") {
      continue;
    }

    if (state.player.clump.length === 0) {
      continue;
    }

    const distance = distanceToClump(enemy.position, state.player);

    if (distance > enemy.radius) {
      continue;
    }

    const consumed = subtractPlayerMass(state.player, enemy.value);

    if (consumed <= 0) {
      continue;
    }

    if (consumed >= enemy.value) {
      state.enemies.splice(index, 1);
    } else {
      enemy.value -= consumed;
      enemy.radius = radiusForValue(enemy.value) + 8;
      enemy.mode = "leave";
      enemy.leaveDirection = normalize({
        x: enemy.position.x - state.player.position.x,
        y: enemy.position.y - state.player.position.y,
      });
    }

    state.shockwaves.push({
      age: 0,
      duration: 0.32,
      origin: { ...enemy.position },
      maxRadius: 130 + enemy.value * 18,
      anchor: "enemy",
      enemyId: enemy.id,
    });

    stripStragglerOnesBelowSpawnFloor(state);
    enforceObsoletePreviousTierInWorld(state);
    bumpOrphanedFoodToIncrementFloor(state);
  }
}

function convertEnemyToFood(
  state: GameState,
  enemy: { id: number; position: Vec2; value: number; phase: number },
): void {
  state.shockwaves.push({
    age: 0,
    duration: 0.38,
    origin: { ...enemy.position },
    maxRadius: 150 + enemy.value * 20,
    anchor: "enemy",
    enemyId: enemy.id,
  });
  state.foods.push(createFoodAt(state, enemy.position, enemy.value, enemy.phase));
}
