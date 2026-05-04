import type { Vec2 } from "../types";

export function distanceBetween(a: Vec2, b: Vec2): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

export function normalize(vector: Vec2): Vec2 {
  const length = Math.hypot(vector.x, vector.y);

  if (length === 0) {
    return { x: 1, y: 0 };
  }

  return {
    x: vector.x / length,
    y: vector.y / length,
  };
}

export function randomDirection(): Vec2 {
  const angle = Math.random() * Math.PI * 2;

  return {
    x: Math.cos(angle),
    y: Math.sin(angle),
  };
}
