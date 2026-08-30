/** 地图尺寸（格） */
export const GRID_W = 15;
export const GRID_H = 13;
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
/** 天气专属道具掉落概率（仅在对应天气下） */
export const WEATHER_ITEM_RATE = 0.18;

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
  /** 钉鞋：暴雪天气免疫减速，并加速一档 */
  Boots = 3,
  /** 避雷针：雷雨天气免疫闪电 */
  Rod = 4,
  /** 提灯：迷雾天气视野变大 */
  Lantern = 5,
}

/** 天气 */
export const Weather = {
  Sunny: "sunny",
  Rain: "rain",
  Snow: "snow",
  Fog: "fog",
} as const;
export type WeatherType = (typeof Weather)[keyof typeof Weather];
export const WEATHERS: WeatherType[] = [Weather.Sunny, Weather.Rain, Weather.Snow, Weather.Fog];

/** 暴雪：移速倍率（钉鞋可免疫） */
export const SNOW_SLOW_FACTOR = 0.65;
/** 雷雨：泡泡受潮，引信缩短倍率 */
export const RAIN_FUSE_FACTOR = 0.8;
/** 雷雨闪电：警告时长与间隔区间 */
export const LIGHTNING_WARN_MS = 1_000;
export const LIGHTNING_INTERVAL_MIN = 7_000;
export const LIGHTNING_INTERVAL_MAX = 13_000;
/** 迷雾：视野半径（格），提灯加成倍率 */
export const FOG_VISION_CELLS = 3.4;
export const FOG_LANTERN_FACTOR = 1.45;

export const WEATHER_LABEL: Record<WeatherType, string> = {
  sunny: "☀️ 晴朗",
  rain: "🌧 雷雨",
  snow: "❄️ 暴雪",
  fog: "🌫 迷雾",
};

/** 出生点（固定四角），颜色顺序：红 蓝 黄 绿 */
export const SPAWNS = [
  { gx: 1, gy: 1 },
  { gx: GRID_W - 2, gy: 1 },
  { gx: 1, gy: GRID_H - 2 },
  { gx: GRID_W - 2, gy: GRID_H - 2 },
] as const;
