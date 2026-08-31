/** 地图尺寸（格） */
export const GRID_W = 17;
export const GRID_H = 15;
export const CELL_COUNT = GRID_W * GRID_H;

/** 客户端每格像素 */
export const TILE = 64;

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
  /** 可炸方块按外观细分：木箱 / 水晶 / 石头 / 冰块，行为一致（一炸就开） */
  SoftWall = 2,
  Crystal = 3,
  Rock = 4,
  Ice = 5,
}

/** 是否为可被泡泡炸毁的方块 */
export function isSoft(t: number): boolean {
  return t >= Tile.SoftWall;
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
  /** 载具（自行车/汽车）：骑上移速大幅提升，被炸会掉下来给别人捡 */
  Vehicle = 6,
  /** 穿梭胶囊：拾取后地图上出现一对胶囊，踩上去互相传送 */
  Portal = 7,
  /** 激光剑：朝面朝方向攻击，范围 2 格 */
  Laser = 8,
  /** 手枪：朝面朝方向射出子弹，直线飞行，遇障碍销毁 */
  Pistol = 9,
  /** 盾牌：挡下手枪子弹并反弹 */
  Shield = 10,
  /** 精灵球：捕捉最近的对手，困住 5 秒 */
  Pokeball = 11,
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

// ---------- 冒险模式 ----------

export type GameType = "pvp" | "adventure";
export const ADVENTURE_PLAYERS = 5; // 冒险模式总席位（真人+人机）
export const GATHER_MS = 120_000; // 装备搜集期时长

export const SCATTER_ITEMS = 14; // 开局散落在地图上的道具数

export const MONSTER_BASE_HP = 100;
export const MONSTER_HP_PER_LEVEL = 30;
export const MONSTER_MAX_LEVEL = 10;
export const MONSTER_LEVEL_MS = 60_000; // 每 60 秒升 1 级
export const MONSTER_BASE_SPEED = 1.7; // 格/秒
export const MONSTER_SPEED_PER_LEVEL = 0.15;
export const MONSTER_MAX_SPEED = 3.4;
export const MONSTER_MAX_COUNT = 9;

// ---------- 冒险经济：蘑菇产阳光 + 商城 ----------
export const MUSHROOM_SUN_PERIOD = 6_000; // 每颗蘑菇 6 秒产 1 阳光
export const SUN_PER_MONSTER = 5; // 击杀怪物基础阳光（另加等级 x2）
export const SUN_PICKUP = 3; // 地图阳光拾取

// 装置（放置后常驻）
export const CANNON_RANGE = 3; // 格
export const CANNOW_DAMAGE = 10;
export const CANNON_COOLDOWN = 3_000;
export const FAN_RANGE = 4;
export const FAN_SLOW = 0.6;
export const FRIDGE_RANGE = 4;
export const FRIDGE_SLOW = 0.65; // 与风扇叠乘，配合加农炮怪物几乎挪不动
export const HOUSE_MAX_HP = 12; // 每次爆炸命中 -2
export const HOUSE_HEAL_PER_SEC = 3;
export const MONSTER_RETREAT_RATIO = 0.3; // 血量低于 30% 回屋
export const BUFF_DECAY_MS = 40_000; // 装备损耗：每 40 秒属性 -1

// ---------- 生命与武器 ----------
export const PLAYER_LIVES = 3; // 每人三条命
export const RESPAWN_MS = 1_500; // 阵亡后复活等待
export const RESPAWN_INVINCIBLE_MS = 3_000; // 复活后无敌
export const MOUNT_SPEED_FACTOR = 1.6; // 载具移速倍率
export const LASER_RANGE = 2; // 激光剑攻击距离（格）
export const LASER_COOLDOWN = 1_200;
export const PISTOL_COOLDOWN = 800;
export const PISTOL_SPEED = 13; // 子弹速度（格/秒）
export const PISTOL_RANGE = 8; // 子弹最大飞行距离（格）
export const PORTAL_TTL = 25_000; // 穿梭胶囊存活时间
export const PORTAL_COOLDOWN = 3_000; // 传送后再次使用间隔
export const CAPTURE_RANGE = 2.5; // 精灵球捕捉距离（格）
export const CAPTURE_MS = 5_000; // 困住时长


// ---------- 冒险模式天气权重（迷雾很稀有） ----------
export const ADVENTURE_WEATHER: [WeatherType, number][] = [
  [Weather.Sunny, 0.5],
  [Weather.Rain, 0.25],
  [Weather.Snow, 0.23],
  [Weather.Fog, 0.02],
];

export function pickAdventureWeather(rng: () => number): WeatherType {
  const roll = rng();
  let acc = 0;
  for (const [w, weight] of ADVENTURE_WEATHER) {
    acc += weight;
    if (roll < acc) return w;
  }
  return Weather.Sunny;
}

// ---------- 商城目录（服务端校验 + 客户端渲染共用） ----------
export interface ShopEntry {
  id: string;
  name: string;
  icon: string;
  price: number; // 阳光
  desc: string;
}

export const SHOP: ShopEntry[] = [
  { id: "bomb", name: "泡泡+1", icon: "🫧", price: 8, desc: "同时可放泡泡 +1" },
  { id: "flame", name: "火焰+1", icon: "🔥", price: 8, desc: "火焰长度 +1" },
  { id: "speed", name: "速度+1", icon: "👟", price: 10, desc: "移动速度 +1 档" },
  { id: "cannon", name: "加农炮", icon: "🎯", price: 30, desc: "放置炮台：3 格内自动攻击，每发 10 伤害" },
  { id: "fan", name: "小风扇", icon: "🌀", price: 20, desc: "放置后 4 格内怪物减速 40%" },
  { id: "fridge", name: "冰箱", icon: "🧊", price: 25, desc: "放置后 4 格内怪物再减速 35%（配合风扇/加农炮）" },
  { id: "wall", name: "城墙", icon: "🧱", price: 12, desc: "在领地边缘建造一段城墙，阻挡怪物" },
  { id: "mushroom", name: "双子蘑菇", icon: "🍄", price: 20, desc: "阳光产出 +1/次" },
  { id: "blindbox", name: "盲盒", icon: "🎁", price: 15, desc: "随机开出道具、装置、阳光……也可能谢谢惠顾" },
];
