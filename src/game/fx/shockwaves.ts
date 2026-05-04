import type { GameState } from "../types";

export function updateShockwaves(state: GameState, dt: number): void {
  for (const shockwave of state.shockwaves) {
    shockwave.age += dt;

    if (shockwave.anchor === "player") {
      const ox = shockwave.offset?.x ?? 0;
      const oy = shockwave.offset?.y ?? 0;
      shockwave.origin = {
        x: state.player.position.x + ox,
        y: state.player.position.y + oy,
      };
    } else if (shockwave.anchor === "enemy" && shockwave.enemyId !== undefined) {
      const enemy = state.enemies.find((e) => e.id === shockwave.enemyId);

      if (enemy) {
        shockwave.origin = { ...enemy.position };
      }
    }
  }

  state.shockwaves = state.shockwaves.filter((shockwave) => shockwave.age < shockwave.duration);
}
