/** Core balance + upgrade tables. Tune here; systems read these values. */

export const basePlayerSpeed = 270;
export const enemySpeed = 220;
export const enemyWanderSpeed = 86;
export const enemyLockRange = 430;
export const mergeThreshold = 10;
export const projectionSkew = 0.28;
export const projectionDepth = 0.54;
export const maxIncrementLevel = 7;

/** Highest digit n for spawn / enemies / food floor (increment cap). */
export const MAX_INCREMENT_SPAWN = 8;
/** Highest clump digit (merges + upgrade prices can use 9 and 10). */
export const MAX_CLUMP_VALUE = 10;
/** Upgrades bill from digit 2+ so first costs read as merged coins, not raw 1s. */
export const MIN_UPGRADE_BILL_DIGIT = 2;

export const incrementCosts = [30, 300, 3000, 30000, 300000, 3000000, 30000000].map((cost) => cost / 30);
export const spawnRateCosts = [10, 20, 100, 200, 1000, 2000, 10000, 100000, 1000000, 10000000, 100000000];
export const spawnRateMultipliers = [1, 1.28, 1.66, 2.18, 2.92, 4.05, 5.85, 8.6, 12.6, 18.4, 26, 36];
export const spawnCaps = [3, 4, 5, 6, 8, 11, 15, 20, 27, 36, 46, 56];
export const speedCosts = [10, 80, 100, 1000, 80000, 200000, 9000000, 80000000, 200000000];
export const speedMultipliers = [1, 1.14, 1.29, 1.45, 1.62, 1.8, 1.99, 2.18, 2.36, 2.66];
export const expandCostTier1 = 1_000_000_000;
export const maxExpandLevel = 1;
