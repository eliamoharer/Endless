import { currentClumpRadius } from "./clumpPhysics";
import type { PlayerState, Vec2 } from "../types";
import { distanceBetween } from "../core/vecMath";

/** Distance from world point to nearest pickup surface on the clump (or ghost “0”). */
export function distanceToClump(point: Vec2, player: PlayerState): number {
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
