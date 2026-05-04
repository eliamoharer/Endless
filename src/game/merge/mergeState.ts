import { radiusForValue } from "../player/clumpPhysics";
import { MAX_CLUMP_VALUE, mergeThreshold } from "../constants/balance";
import { countClumpParticles } from "../player/clumpInventory";
import type { ClumpParticle, GameState, MergeProgress, Vec2 } from "../types";
import { bumpFoodWhenMergedDigitObsoleted } from "../world/worldTierSync";

function averageLocalPosition(particles: ClumpParticle[]): Vec2 {
  return particles.reduce(
    (position, particle) => {
      position.x += particle.localPosition.x / particles.length;
      position.y += particle.localPosition.y / particles.length;
      return position;
    },
    { x: 0, y: 0 },
  );
}

function averageVelocity(particles: ClumpParticle[]): Vec2 {
  return particles.reduce(
    (velocity, particle) => {
      velocity.x += particle.velocity.x / particles.length;
      velocity.y += particle.velocity.y / particles.length;
      return velocity;
    },
    { x: 0, y: 0 },
  );
}

export function updateMergeProgress(state: GameState): void {
  const present = new Set<number>();

  for (const particle of state.player.clump) {
    if (particle.value >= 1 && particle.value < MAX_CLUMP_VALUE) {
      present.add(particle.value);
    }
  }

  const values = [...present].sort((a, b) => b - a);
  const progresses: MergeProgress[] = [];
  let candidate = 1;

  for (const value of values) {
    const count = countClumpParticles(state.player.clump, value);
    const ready = count >= mergeThreshold;

    progresses.push({
      value,
      count,
      threshold: mergeThreshold,
      ready,
    });

    if (ready && candidate === 1) {
      candidate = value;
    }
  }

  if (progresses.length === 0) {
    state.mergeProgresses = [];
    state.mergeCandidateValue = 1;
    state.mergeReady = false;
    return;
  }

  state.mergeProgresses = progresses;
  state.mergeCandidateValue = candidate;
  state.mergeReady = progresses.some((progress) => progress.ready);
}

export function performMerge(state: GameState, value: number): void {
  if (value >= MAX_CLUMP_VALUE) {
    return;
  }

  const player = state.player;
  const mergeable = player.clump.filter((particle) => particle.value === value).slice(0, mergeThreshold);

  if (mergeable.length < mergeThreshold) {
    return;
  }

  const mergeIds = new Set(mergeable.map((particle) => particle.id));
  const origin = averageLocalPosition(mergeable);
  const nextValue = value + 1;

  player.clump = player.clump.filter((particle) => !mergeIds.has(particle.id));
  player.clump.push({
    id: player.nextParticleId,
    localPosition: origin,
    velocity: averageVelocity(mergeable),
    value: nextValue,
    radius: radiusForValue(nextValue),
    angleSeed: Math.random() * Math.PI * 2,
  });
  player.nextParticleId += 1;
  player.discoveredMaxValue = Math.max(player.discoveredMaxValue, nextValue);
  updateMergeProgress(state);
  bumpFoodWhenMergedDigitObsoleted(state, value);
  state.shockwaves.push({
    age: 0,
    duration: 0.48,
    origin: {
      x: player.position.x + origin.x,
      y: player.position.y + origin.y,
    },
    maxRadius: 220 + nextValue * 30,
  });
}
