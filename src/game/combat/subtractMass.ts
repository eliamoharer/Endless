import { radiusForValue } from "../player/clumpPhysics";
import type { PlayerState } from "../types";

/** Subtract up to `amount` from clump particle values (largest first); returns total value removed. */
export function subtractPlayerMass(player: PlayerState, amount: number): number {
  let remaining = amount;
  let consumed = 0;
  const sorted = [...player.clump].sort((a, b) => b.value - a.value);
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

  player.clump = player.clump.filter((particle) => !emptied.has(particle.id));
  return consumed;
}
