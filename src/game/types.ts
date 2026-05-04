export type Vec2 = {
  x: number;
  y: number;
};

export type InputSnapshot = {
  moveX: number;
  moveY: number;
};

export type Food = {
  id: number;
  position: Vec2;
  value: number;
  radius: number;
  phase: number;
};

export type Enemy = {
  id: number;
  position: Vec2;
  velocity: Vec2;
  value: number;
  radius: number;
  phase: number;
  mode: "wander" | "chase" | "leave";
  interestDuration: number;
  interestRemaining: number;
  wanderDirection: Vec2;
  wanderTimer: number;
  leaveDirection: Vec2;
};

export type ClumpParticle = {
  id: number;
  localPosition: Vec2;
  velocity: Vec2;
  value: number;
  radius: number;
  angleSeed: number;
};

export type Shockwave = {
  age: number;
  duration: number;
  origin: Vec2;
  maxRadius: number;
  anchor?: "player" | "enemy";
  enemyId?: number;
  offset?: Vec2;
};

export type PlayerState = {
  position: Vec2;
  velocity: Vec2;
  clump: ClumpParticle[];
  nextParticleId: number;
  discoveredMaxValue: number;
};

export type MergeProgress = {
  value: number;
  count: number;
  threshold: number;
  ready: boolean;
};

export type UpgradeKind = "spawnRate" | "increment" | "speed" | "expand";

export type UpgradeProgress = {
  kind: UpgradeKind;
  name: string;
  detail: string;
  costAmount: number;
  costValue: number;
  progress: number;
  canPurchase: boolean;
  isMaxed: boolean;
};

export type UpgradeState = {
  spawnRateLevel: number;
  incrementLevel: number;
  speedLevel: number;
  expandLevel: number;
};

export type GameState = {
  time: number;
  camera: Vec2;
  player: PlayerState;
  foods: Food[];
  nextFoodId: number;
  spawnTimer: number;
  enemies: Enemy[];
  nextEnemyId: number;
  enemySpawnTimer: number;
  shockwaves: Shockwave[];
  mergeProgresses: MergeProgress[];
  mergeCandidateValue: number;
  mergeReady: boolean;
  upgrades: UpgradeState;
  upgradeProgresses: UpgradeProgress[];
};

export type Viewport = {
  width: number;
  height: number;
  pixelRatio: number;
};
