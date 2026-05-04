import {
  basePlayerSpeed,
  projectionDepth,
  projectionSkew,
  speedMultipliers,
} from "../constants/balance";
import type { GameState, InputSnapshot } from "../types";

export function updatePlayerMovement(state: GameState, input: InputSnapshot, dt: number): void {
  const player = state.player;
  const playerSpeed = currentPlayerSpeed(state);
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

export function updateCamera(state: GameState, dt: number): void {
  const follow = Math.min(dt * 10, 1);

  state.camera.x += (state.player.position.x - state.camera.x) * follow;
  state.camera.y += (state.player.position.y - state.camera.y) * follow;
}

function currentPlayerSpeed(state: GameState): number {
  const totalMass = state.player.clump.reduce((mass, particle) => mass + particle.value, 0);
  const massDrag = 1 + totalMass / 62;
  const speedUpgrade =
    speedMultipliers[Math.min(state.upgrades.speedLevel, speedMultipliers.length - 1)];
  const lowMassCap = 255 + Math.sqrt(totalMass) * 19 + Math.min(totalMass, 80) * 0.85;
  const rawSpeed = (basePlayerSpeed * speedUpgrade) / massDrag;

  return Math.max(128, Math.min(rawSpeed, lowMassCap));
}
