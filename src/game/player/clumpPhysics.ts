import type { ClumpParticle, PlayerState, Vec2 } from "../types";

const coreAttraction = 9;
const pairAttraction = 12;
const repulsionStrength = 980;
const damping = 0.86;
const maxParticleSpeed = 260;

function lengthOf(vector: Vec2): number {
  return Math.hypot(vector.x, vector.y);
}

export function currentClumpRadius(player: PlayerState): number {
  let radius = 34;

  for (const particle of player.clump) {
    radius = Math.max(radius, lengthOf(particle.localPosition) + particle.radius);
  }

  return radius + 14;
}

export function createClumpParticle(
  player: PlayerState,
  worldPosition: Vec2,
  value = 1,
): ClumpParticle {
  const local = {
    x: worldPosition.x - player.position.x,
    y: worldPosition.y - player.position.y,
  };

  return {
    id: player.nextParticleId,
    localPosition: local,
    velocity: {
      x: 0,
      y: 0,
    },
    value,
    radius: radiusForValue(value),
    angleSeed: Math.random() * Math.PI * 2,
  };
}

export function addParticleToClump(player: PlayerState, worldPosition: Vec2, value = 1): void {
  player.clump.push(createClumpParticle(player, worldPosition, value));
  player.nextParticleId += 1;
}

export function updateClump(player: PlayerState, dt: number): void {
  const particles = player.clump;

  for (const particle of particles) {
    const distanceFromCore = Math.max(lengthOf(particle.localPosition), 1);
    const pullDirection = {
      x: -particle.localPosition.x / distanceFromCore,
      y: -particle.localPosition.y / distanceFromCore,
    };
    const strength = coreAttraction + particle.value * 4;

    particle.velocity.x += pullDirection.x * distanceFromCore * strength * dt;
    particle.velocity.y += pullDirection.y * distanceFromCore * strength * dt;
  }

  for (let i = 0; i < particles.length; i += 1) {
    for (let j = i + 1; j < particles.length; j += 1) {
      const a = particles[i];
      const b = particles[j];
      const offset = {
        x: a.localPosition.x - b.localPosition.x,
        y: a.localPosition.y - b.localPosition.y,
      };
      const distance = Math.max(lengthOf(offset), 0.001);
      const minimumDistance = a.radius + b.radius + 4;
      const normal = {
        x: offset.x / distance,
        y: offset.y / distance,
      };

      if (distance < minimumDistance) {
        const force = ((minimumDistance - distance) / minimumDistance) * repulsionStrength;

        a.velocity.x += normal.x * force * dt;
        a.velocity.y += normal.y * force * dt;
        b.velocity.x -= normal.x * force * dt;
        b.velocity.y -= normal.y * force * dt;
      } else {
        const attraction = Math.min(distance - minimumDistance, 180) * pairAttraction;
        const valueScale = 0.7 + (a.value + b.value) * 0.18;

        a.velocity.x -= normal.x * attraction * valueScale * dt;
        a.velocity.y -= normal.y * attraction * valueScale * dt;
        b.velocity.x += normal.x * attraction * valueScale * dt;
        b.velocity.y += normal.y * attraction * valueScale * dt;
      }
    }
  }

  for (const particle of particles) {
    const speed = lengthOf(particle.velocity);

    if (speed > maxParticleSpeed) {
      particle.velocity.x = (particle.velocity.x / speed) * maxParticleSpeed;
      particle.velocity.y = (particle.velocity.y / speed) * maxParticleSpeed;
    }

    particle.localPosition.x += particle.velocity.x * dt;
    particle.localPosition.y += particle.velocity.y * dt;
    particle.velocity.x *= damping;
    particle.velocity.y *= damping;
  }
}

export function radiusForValue(value: number): number {
  return 17 + Math.sqrt(value) * 4.2;
}
