import type { ClumpParticle } from "../types";

export function countClumpParticles(clump: ClumpParticle[], value: number): number {
  return clump.filter((particle) => particle.value === value).length;
}
