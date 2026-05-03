import type { Food, Vec2, Viewport } from "./types";

const minimumSpawnDistance = 150;
const spawnBuffer = 420;

export function createFood(
  id: number,
  camera: Vec2,
  viewport: Viewport,
  value: number,
): Food {
  const halfDiagonal = Math.hypot(viewport.width, viewport.height) * 0.5;
  const distance =
    minimumSpawnDistance + Math.random() * Math.max(halfDiagonal + spawnBuffer, 1);
  const angle = Math.random() * Math.PI * 2;

  return {
    id,
    position: {
      x: camera.x + Math.cos(angle) * distance,
      y: camera.y + Math.sin(angle) * distance,
    },
    value,
    radius: 28 + Math.sqrt(value) * 3,
    phase: Math.random() * Math.PI * 2,
  };
}
