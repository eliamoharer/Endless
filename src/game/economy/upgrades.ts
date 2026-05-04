import {
  expandCostTier1,
  incrementCosts,
  MAX_CLUMP_VALUE,
  MAX_INCREMENT_SPAWN,
  mergeThreshold,
  maxExpandLevel,
  maxIncrementLevel,
  MIN_UPGRADE_BILL_DIGIT,
  spawnRateCosts,
  spawnRateMultipliers,
  speedCosts,
  speedMultipliers,
} from "../constants/balance";
import { countClumpParticles } from "../player/clumpInventory";
import type { GameState, UpgradeProgress } from "../types";

function billTier1WeightAsDigit(
  weight: number,
  billDigit: number,
  options: { relaxUnitOnes: boolean },
): { amount: number; value: number } {
  const digit = Math.max(1, Math.min(MAX_CLUMP_VALUE, Math.floor(billDigit)));
  const w = Math.max(0, Math.floor(weight));

  if (w === 0) {
    return { amount: 1, value: digit };
  }

  if (options.relaxUnitOnes && w === 1 && digit > 1) {
    return { amount: 1, value: 1 };
  }

  const unit = 10 ** (digit - 1);

  return { amount: Math.max(1, Math.ceil(w / unit)), value: digit };
}

function normalizeUpgradeCoinDisplay(amount: number, value: number): { amount: number; value: number } {
  let a = Math.max(1, Math.floor(amount));
  let v = Math.max(1, Math.floor(value));

  while (v < MAX_CLUMP_VALUE && a >= mergeThreshold && a % mergeThreshold === 0) {
    a = Math.floor(a / mergeThreshold);
    v += 1;
  }

  return { amount: a, value: v };
}

function billedUpgradeCost(
  weight: number,
  billDigit: number,
  relaxUnitOnes: boolean,
): { amount: number; value: number } {
  const raw = billTier1WeightAsDigit(weight, billDigit, { relaxUnitOnes });

  return normalizeUpgradeCoinDisplay(raw.amount, raw.value);
}

export function updateUpgradeProgress(state: GameState): void {
  const clump = state.player.clump;
  const spawnRateLevel = state.upgrades.spawnRateLevel;
  const incrementLevel = state.upgrades.incrementLevel;
  const speedLevel = state.upgrades.speedLevel;
  const expandLevel = state.upgrades.expandLevel;
  const spawnRateMaxed = spawnRateLevel >= spawnRateCosts.length;
  const incrementMaxed = incrementLevel >= maxIncrementLevel;
  const speedMaxed = speedLevel >= speedCosts.length;
  const expandMaxed = expandLevel >= maxExpandLevel;
  const spawnRateCostBase = spawnRateCosts[Math.min(spawnRateLevel, spawnRateCosts.length - 1)];
  const incrementCostBase = incrementCosts[Math.min(incrementLevel, incrementCosts.length - 1)];
  const speedCostBase = speedCosts[Math.min(speedLevel, speedCosts.length - 1)];
  const spawnBillDigit = Math.min(
    Math.max(incrementLevel + 1, MIN_UPGRADE_BILL_DIGIT),
    MAX_INCREMENT_SPAWN,
  );
  const spawnRateCostSpec = billedUpgradeCost(spawnRateCostBase, spawnBillDigit, true);
  const incrementCostSpec = billedUpgradeCost(incrementCostBase, spawnBillDigit, true);
  const speedCostSpec = billedUpgradeCost(speedCostBase, spawnBillDigit, true);
  const expandCostSpec = billedUpgradeCost(expandCostTier1, MAX_CLUMP_VALUE, false);
  const spawnRateMultiplier =
    spawnRateMultipliers[Math.min(spawnRateLevel, spawnRateMultipliers.length - 1)];
  const speedMultiplier = speedMultipliers[Math.min(speedLevel, speedMultipliers.length - 1)];
  const spawnValue = Math.min(incrementLevel + 1, MAX_INCREMENT_SPAWN);

  const count = (value: number) => countClumpParticles(clump, value);

  const upgrades: UpgradeProgress[] = [
    {
      kind: "spawnRate",
      name: "Spawn Rate",
      detail: `${spawnRateMultiplier.toFixed(2)}x more numbers`,
      costAmount: spawnRateCostSpec.amount,
      costValue: spawnRateCostSpec.value,
      progress: spawnRateMaxed
        ? 1
        : Math.min(count(spawnRateCostSpec.value) / spawnRateCostSpec.amount, 1),
      canPurchase:
        !spawnRateMaxed && count(spawnRateCostSpec.value) >= spawnRateCostSpec.amount,
      isMaxed: spawnRateMaxed,
    },
    {
      kind: "increment",
      name: "Increment",
      detail: incrementMaxed ? "Numbers max at 8" : `Numbers can start at ${spawnValue}`,
      costAmount: incrementCostSpec.amount,
      costValue: incrementCostSpec.value,
      progress: incrementMaxed ? 1 : Math.min(count(incrementCostSpec.value) / incrementCostSpec.amount, 1),
      canPurchase: !incrementMaxed && count(incrementCostSpec.value) >= incrementCostSpec.amount,
      isMaxed: incrementMaxed,
    },
    {
      kind: "speed",
      name: "Speed",
      detail: `${speedMultiplier.toFixed(2)}x movement speed`,
      costAmount: speedCostSpec.amount,
      costValue: speedCostSpec.value,
      progress: speedMaxed ? 1 : Math.min(count(speedCostSpec.value) / speedCostSpec.amount, 1),
      canPurchase: !speedMaxed && count(speedCostSpec.value) >= speedCostSpec.amount,
      isMaxed: speedMaxed,
    },
    {
      kind: "expand",
      name: "Expand",
      detail: "(coming soon)",
      costAmount: expandCostSpec.amount,
      costValue: expandCostSpec.value,
      progress: expandMaxed ? 1 : Math.min(count(expandCostSpec.value) / expandCostSpec.amount, 1),
      canPurchase: !expandMaxed && count(expandCostSpec.value) >= expandCostSpec.amount,
      isMaxed: expandMaxed,
    },
  ];

  state.upgradeProgresses = upgrades;
}

export function spendCurrency(state: GameState, amount: number, value: number): boolean {
  const clump = state.player.clump;

  if (countClumpParticles(clump, value) < amount) {
    return false;
  }

  let remaining = amount;
  const spentIds = new Set<number>();

  for (const particle of clump) {
    if (remaining <= 0) {
      break;
    }

    if (particle.value === value) {
      remaining -= 1;
      spentIds.add(particle.id);
    }
  }

  state.player.clump = clump.filter((particle) => !spentIds.has(particle.id));
  return true;
}

export { maxIncrementLevel };
