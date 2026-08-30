/** 地图尺寸（格） */
export const GRID_W = 13;
export const GRID_H = 11;
export const CELL_COUNT = GRID_W * GRID_H;

/** 客户端每格像素 */
export const TILE = 32;

/** 泡泡引信 */
export const BOMB_FUSE_MS = 2500;
/** 火焰持续时间 */
export const FLAME_MS = 500;
/** 出生无敌时间 */
export const SPAWN_INVINCIBLE_MS = 2000;

/** 软墙密度与掉落概率 */
export const SOFT_WALL_RATIO = 0.7;
export const ITEM_DROP_RATE = 0.3;

/** 突然死亡：开局 3 分钟后开始，每 5 秒硬墙向内合拢一圈 */
export const SUDDEN_DEATH_AT_MS = 180_000;
export const SUDDEN_DEATH_STEP_MS = 5_000;

/** 移动速度（格/秒），下标 = 速度档-1 */
export const SPEED_LEVELS = [4, 4.6, 5.2, 5.8, 6.4, 7] as const;

export const MAX_BOMBS = 8;
export const MAX_FLAMES = 8;
export const MAX_SPEED_LEVEL = 6;

export enum Tile {
  Floor = 0,
  HardWall = 1,
  SoftWall = 2,
}

export enum ItemType {
  Bomb = 0,
  Flame = 1,
  Speed = 2,
}

/** 出生点（固定四角），颜色顺序：红 蓝 黄 绿 */
export const SPAWNS = [
  { gx: 1, gy: 1 },
  { gx: GRID_W - 2, gy: 1 },
  { gx: 1, gy: GRID_H - 2 },
  { gx: GRID_W - 2, gy: GRID_H - 2 },
] as const;
